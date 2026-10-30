import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { MISSING_TOOLCHAIN, WORK_ROOT, type Workspace } from '../runner/index.js';
import { runProcess } from '../runner/process.js';
import { rangesArg, type TraceOutcome } from './types.js';

/**
 * A tiny debugger built on the JDK's Java Debug Interface: launches the user's class, puts a breakpoint
 * on every line of their source file and records the watched variables at each hit.
 * Usage: CpStudioTracer <mainClass> <sourceFile> <watch,watch> <maxSteps> <timeLimitMs> <out.json> <hidden ranges, e.g. 1-20,40-90>
 */
const TRACER = String.raw`
import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class CpStudioTracer {
    static String sourceFile;
    static final List<String> steps = new ArrayList<>();
    static final List<BreakpointRequest> breakpoints = new ArrayList<>();
    static final List<ReferenceType> userTypes = new ArrayList<>();
    static String error = null;
    static int errorLine = -1;
    static boolean truncated = false;
    // Line ranges of code the user didn't write (a LeetCode harness): no breakpoints there.
    static final List<int[]> hidden = new ArrayList<>();

    static boolean isHidden(int line) {
        for (int[] range : hidden) if (line >= range[0] && line <= range[1]) return true;
        return false;
    }

    public static void main(String[] args) throws Exception {
        String mainClass = args[0];
        sourceFile = args[1];
        String[] watches = args[2].split(",");
        int maxSteps = Integer.parseInt(args[3]);
        long deadline = System.currentTimeMillis() + Long.parseLong(args[4]);
        Path out = Paths.get(args[5]);
        if (args.length > 6) {
            for (String range : args[6].split(",")) {
                String[] bounds = range.split("-");
                if (bounds.length == 2) hidden.add(new int[] {Integer.parseInt(bounds[0]), Integer.parseInt(bounds[1])});
            }
        }

        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("main").setValue(mainClass);
        arguments.get("options").setValue("-cp . -Xss256m -Xmx512m -XX:+UseSerialGC");
        VirtualMachine vm = connector.launch(arguments);
        Process process = vm.process();

        Thread stdin = new Thread(() -> {
            try (OutputStream target = process.getOutputStream()) {
                System.in.transferTo(target);
            } catch (IOException ignored) {
            }
        });
        Thread stdout = pump(process.getInputStream(), System.out);
        Thread stderr = pump(process.getErrorStream(), System.err);
        stdin.start();
        stdout.start();
        stderr.start();

        EventRequestManager requests = vm.eventRequestManager();
        ClassPrepareRequest prepare = requests.createClassPrepareRequest();
        for (String excluded : new String[] {"java.*", "javax.*", "sun.*", "jdk.*", "com.sun.*"}) prepare.addClassExclusionFilter(excluded);
        prepare.enable();
        requests.createExceptionRequest(null, false, true).enable();

        try {
            boolean running = true;
            while (running) {
                EventSet events = vm.eventQueue().remove();
                for (Event event : events) {
                    if (event instanceof ClassPrepareEvent) {
                        watchClass(requests, ((ClassPrepareEvent) event).referenceType());
                    } else if (event instanceof BreakpointEvent) {
                        if (steps.size() >= maxSteps || System.currentTimeMillis() > deadline) {
                            truncated = true;
                            vm.exit(0);
                            running = false;
                            break;
                        }
                        record((BreakpointEvent) event, watches);
                    } else if (event instanceof ExceptionEvent) {
                        recordException((ExceptionEvent) event);
                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        running = false;
                    }
                }
                if (running) events.resume();
            }
        } catch (VMDisconnectedException ignored) {
        }

        int exitCode = process.waitFor();
        stdout.join(2000);
        stderr.join(2000);
        System.out.flush();
        String json = "{\"steps\":[" + String.join(",", steps) + "],\"truncated\":" + truncated
                + ",\"error\":" + (error == null ? "null" : quote(error))
                + ",\"errorLine\":" + (errorLine < 0 ? "null" : errorLine) + "}";
        Files.write(out, json.getBytes(StandardCharsets.UTF_8));
        System.exit(exitCode);
    }

    static Thread pump(InputStream in, PrintStream target) {
        Thread thread = new Thread(() -> {
            try {
                in.transferTo(target);
                target.flush();
            } catch (IOException ignored) {
            }
        });
        thread.setDaemon(true);
        return thread;
    }

    static boolean isUserCode(ReferenceType type) {
        try {
            if (!type.sourceName().equals(sourceFile)) return false;
        } catch (AbsentInformationException e) {
            return false;
        }
        // Fast-I/O helper classes would use up every step on reading input.
        String simpleName = type.name().substring(type.name().lastIndexOf('$') + 1);
        return !simpleName.matches("(?i).*(reader|scanner|writer|fastio|kattio|input|output).*");
    }

    static void watchClass(EventRequestManager requests, ReferenceType type) {
        try {
            if (!type.sourceName().equals(sourceFile)) return;
        } catch (AbsentInformationException e) {
            return;
        }
        userTypes.add(type);
        if (!isUserCode(type)) return;
        try {
            for (Location location : type.allLineLocations()) {
                if (isHidden(location.lineNumber())) continue;
                BreakpointRequest breakpoint = requests.createBreakpointRequest(location);
                breakpoint.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
                breakpoint.enable();
                breakpoints.add(breakpoint);
            }
        } catch (AbsentInformationException ignored) {
        }
    }

    static void record(BreakpointEvent hit, String[] watches) {
        StringBuilder values = new StringBuilder();
        try {
            StackFrame frame = hit.thread().frame(0);
            for (String name : watches) {
                String value = read(frame, hit.thread(), name);
                if (value == null) continue;
                if (values.length() > 0) values.append(',');
                values.append(quote(name)).append(':').append(quote(value));
            }
        } catch (IncompatibleThreadStateException ignored) {
        }
        steps.add("{\"line\":" + hit.location().lineNumber() + ",\"values\":{" + values + "}}");
    }

    static String read(StackFrame frame, ThreadReference thread, String name) {
        try {
            LocalVariable local = frame.visibleVariableByName(name);
            if (local != null) return format(frame.getValue(local), thread, 0);
        } catch (AbsentInformationException ignored) {
        }
        ReferenceType type = frame.location().declaringType();
        Field field = type.fieldByName(name);
        if (field != null) {
            if (field.isStatic()) return format(type.getValue(field), thread, 0);
            ObjectReference self = frame.thisObject();
            if (self != null) return format(self.getValue(field), thread, 0);
        }
        for (ReferenceType other : userTypes) {
            Field staticField = other.fieldByName(name);
            if (staticField != null && staticField.isStatic()) return format(other.getValue(staticField), thread, 0);
        }
        return null;
    }

    static String format(Value value, ThreadReference thread, int depth) {
        if (value == null) return "null";
        if (value instanceof StringReference) return clip(quote(((StringReference) value).value()));
        if (value instanceof CharValue) return "'" + ((CharValue) value).value() + "'";
        if (value instanceof PrimitiveValue) return value.toString();
        if (value instanceof ArrayReference) {
            ArrayReference array = (ArrayReference) value;
            int length = array.length();
            StringBuilder text = new StringBuilder("[");
            List<Value> items = array.getValues(0, Math.min(length, 50));
            for (int i = 0; i < items.size(); i++) {
                if (i > 0) text.append(", ");
                text.append(depth < 2 ? format(items.get(i), thread, depth + 1) : "…");
            }
            if (length > 50) text.append(", …");
            return clip(text.append(']').toString());
        }
        ObjectReference object = (ObjectReference) value;
        String typeName = object.referenceType().name();
        if (typeName.startsWith("java.") && object.referenceType() instanceof ClassType) {
            Method toString = ((ClassType) object.referenceType()).concreteMethodByName("toString", "()Ljava/lang/String;");
            // Breakpoints are paused while invoking, in case the collection holds user objects.
            for (BreakpointRequest breakpoint : breakpoints) breakpoint.disable();
            try {
                Value text = object.invokeMethod(thread, toString, Collections.emptyList(), ObjectReference.INVOKE_SINGLE_THREADED);
                return text == null ? "null" : clip(((StringReference) text).value());
            } catch (Exception e) {
                return typeName;
            } finally {
                for (BreakpointRequest breakpoint : breakpoints) breakpoint.enable();
            }
        }
        StringBuilder text = new StringBuilder(typeName.substring(typeName.lastIndexOf('$') + 1)).append('{');
        boolean first = true;
        for (Field field : object.referenceType().visibleFields()) {
            if (field.isStatic()) continue;
            if (!first) text.append(", ");
            first = false;
            text.append(field.name()).append('=').append(depth < 2 ? format(object.getValue(field), thread, depth + 1) : "…");
        }
        return clip(text.append('}').toString());
    }

    static void recordException(ExceptionEvent event) {
        ObjectReference exception = event.exception();
        String message = null;
        Field detail = exception.referenceType().fieldByName("detailMessage");
        if (detail != null && exception.getValue(detail) instanceof StringReference) {
            message = ((StringReference) exception.getValue(detail)).value();
        }
        error = exception.referenceType().name() + (message != null ? ": " + message : "");
        try {
            for (StackFrame frame : event.thread().frames()) {
                ReferenceType type = frame.location().declaringType();
                if (userTypes.contains(type)) {
                    errorLine = frame.location().lineNumber();
                    break;
                }
            }
        } catch (IncompatibleThreadStateException ignored) {
        }
    }

    static String clip(String text) {
        return text.length() > 300 ? text.substring(0, 300) + " …" : text;
    }

    static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : text.toCharArray()) {
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
}
`;

let tracerBuild: Promise<string> | null = null;

function buildTracer(): Promise<string> {
  tracerBuild ??= (async () => {
    const dir = path.join(WORK_ROOT, '_java_tracer');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'CpStudioTracer.java'), TRACER);
    const result = await runProcess(config.toolchain.javac, ['-encoding', 'UTF-8', '-d', '.', 'CpStudioTracer.java'], { cwd: dir, timeoutMs: 60_000 });
    if (result.spawnError) throw new Error(MISSING_TOOLCHAIN.java);
    if (result.exitCode !== 0) throw new Error(`Could not build the Java debugger:\n${result.stdout}${result.stderr}`);
    return dir;
  })();
  tracerBuild.catch(() => (tracerBuild = null));
  return tracerBuild;
}

export async function traceJava(ws: Workspace, input: string, watches: string[], hidden: [number, number][] = []): Promise<TraceOutcome> {
  const { maxSteps, timeLimitMs } = config.debugger;
  const tracerDir = await buildTracer();
  const className = ws.plan.run.args.at(-1)!;
  await fs.rm(path.join(ws.dir, 'trace.json'), { force: true });

  const result = await runProcess(
    config.toolchain.java,
    ['-cp', tracerDir, 'CpStudioTracer', className, ws.plan.sourceFile, watches.join(','), String(maxSteps), String(timeLimitMs), 'trace.json', rangesArg(hidden)],
    { cwd: ws.dir, input, timeoutMs: timeLimitMs + 10_000 },
  );
  if (result.spawnError) throw new Error(MISSING_TOOLCHAIN.java);

  const trace = JSON.parse(await fs.readFile(path.join(ws.dir, 'trace.json'), 'utf8').catch(() => '{}'));
  return {
    steps: trace.steps ?? [],
    truncated: Boolean(trace.truncated) || result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    error: trace.error ?? (result.timedOut ? 'Stopped: the debugger time limit was reached.' : undefined),
    errorLine: trace.errorLine ?? undefined,
    exitCode: result.exitCode,
  };
}
