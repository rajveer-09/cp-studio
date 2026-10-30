<div align="center">

<img src="client/public/favicon.svg" width="72" alt="CP Studio logo" />

# CP Studio

**An online practice editor for competitive programming in C++, Java and Python.**<br />
Run code against test cases like an online judge, step through it with a debugger, and get help from an AI assistant. The assistant changes your code only after you approve.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Monaco](https://img.shields.io/badge/Monaco_Editor-0078D4?logo=visualstudiocode&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?logo=googlegemini&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

<img src=".github/assets/editor.png" alt="CP Studio: a wrong answer with its line-by-line diff" width="100%" />

</div>

## Features

### Run like a judge
- **Multiple test cases**, each with an input, an expected output and your output, plus verdicts: **Accepted**, **Wrong Answer**, **Time Limit Exceeded**, **Runtime Error** and **Compilation Error**.
- **Judge-style output checking:**
  - Two modes: word by word (like Codeforces) or exact lines.
  - Optional decimal tolerance (`1e-6` / `1e-9`).
  - Optional "ignore letter case" for YES/NO answers.
- **Clear wrong answers.** The checker tells you exactly what's wrong, e.g. `Line 2: expected "9", found "3"`, and a **Diff** view highlights the differing words.
- **Readable crashes.** Runtime errors are explained ("Segmentation fault", "Integer division by zero"). Compiler errors become clickable links and squiggles in the editor.
- **Fast re-runs.** Code is compiled once per change, so re-running tests is instant.

### AI assistant (Google Gemini)
- It sees your code, your selection, the problem statement, your test cases, their outputs and any errors.
- **`/fix`** proposes a fix as a **side-by-side diff**. Nothing changes until you accept. Accepting is one `Ctrl+Z` undo step and automatically re-runs all your tests.
- `/debug`, `/hint` (no spoilers), `/explain`, `/optimize`, `/complexity`, and `/tests` for generated edge-case test cases.
- It stays on topic: it only answers questions about data structures, algorithms and your code.

### Debugger
- Select a variable and click **Debug**. The program runs on the selected test case and every line is recorded.
- Step forward and back, or scrub a timeline. The current line is highlighted, with the variable values shown next to it.
- Each variable's full history of changes is listed. Runtime errors are pinpointed to their line.
- Engines: **gdb** for C++, **JDI** for Java and **sys.settrace** for Python.

### Editor
- The **Monaco** editor (the editor behind VS Code) with dark and light themes.
- **Autocomplete** for keywords, STL / Java / Python library members, identifiers in your file, and CP snippets: `fori`, `readv`, `bfs`, `dfs`, `dsu`, `binsearch`, `modpow`, `sieve`, `graph`…
- **Formatting** with clang-format (C++/Java) and Ruff (Python). Both run in the browser as WebAssembly.
- **CP templates** (multi-test, fast I/O, blank) and your own saved templates, plus **Reset** to start over. Reset can be undone.
- Resizable panels, with the test panel **below or beside** the editor. Your work is saved in the browser automatically.
- **Keyboard shortcuts** for everything.

<table>
  <tr>
    <td><img src=".github/assets/ai-fix.png" alt="Reviewing an AI fix as a diff" /></td>
    <td><img src=".github/assets/debugger.png" alt="Stepping through code with the debugger" /></td>
  </tr>
  <tr>
    <td align="center"><b>Review AI fixes as a diff</b></td>
    <td align="center"><b>Step through your code</b></td>
  </tr>
  <tr>
    <td colspan="2"><img src=".github/assets/light.png" alt="Light theme" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><b>Light theme</b></td>
  </tr>
</table>

## Getting started

### Prerequisites
- **Node.js 20.19+**
- The toolchains for the languages you want to run:

| Language | Windows | Linux / macOS |
|---|---|---|
| C++ (+ debugger) | g++ and gdb from [MSYS2](https://www.msys2.org/) or [WinLibs](https://winlibs.com/) | `g++`, `gdb` |
| Java | JDK 17+ (e.g. [Temurin](https://adoptium.net/)) | `openjdk-17-jdk` |
| Python | [Python 3.10+](https://www.python.org/downloads/) | `python3` |

If a toolchain is missing, the app shows a ⚠ next to that language.

### Run locally

```bash
git clone https://github.com/rajveer-09/cp-studio.git
cd cp-studio
npm install
cp server/.env.example server/.env   # add your GEMINI_API_KEY
npm run dev
```

Open **http://localhost:5173**. The API server runs on port 3001.

Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Without a key, everything except the assistant still works.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Run the selected test case |
| `Ctrl+Shift+Enter` | Run all test cases |
| `Alt+N` | Add a test case |
| `Shift+Alt+F` | Format code |
| `Alt+W` / `F8` | Debug the variable at the cursor / restart debugging |
| `Alt+.` / `Alt+,` | Next / previous debugger step |
| `Ctrl+Shift+A` | Focus the AI assistant |
| `Alt+Y` / `Esc` | Accept / reject a proposed fix |
| `Alt+1` `Alt+2` `Alt+3` | Switch to C++ / Java / Python |
| `Alt+L` | Move the test panel right / bottom |
| `Alt+T` | Toggle dark / light theme |
| `Alt+/` | Show all shortcuts |

On macOS, use `⌘` instead of `Ctrl`.

## Configuration

Set these in `server/.env` locally, or as environment variables when deploying.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | (empty) | Turns on the AI assistant |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Gemini model to use |
| `ACCESS_KEY` | (empty) | Optional shared password that visitors enter once |
| `PORT` | `3001` | HTTP port |
| `TRUST_PROXY` | `1` in Docker | Set behind a reverse proxy, so rate limits see real IPs |
| `CXX` `JAVAC` `JAVA` `PYTHON` `GDB` | `g++` `javac` `java` `python3` `gdb` | Toolchain commands |
| `MAX_CONCURRENT_RUNS` | CPU cores | Programs compiled or run at the same time |

## Deployment

The `Dockerfile` builds one image with the app, g++, gdb, Java 17 and Python 3. It runs anywhere Docker does:

```bash
docker build -t cp-studio .
docker run -p 3001:3001 -e GEMINI_API_KEY=your-key -e ACCESS_KEY=choose-a-password cp-studio
```

**On Render:**
1. Create a **Web Service** from this repo.
2. Choose the **Docker** runtime.
3. Add `GEMINI_API_KEY`, `GEMINI_MODEL` and `ACCESS_KEY` as environment variables.

The port is picked up automatically. Render's free instance is small (about 0.1 CPU, 512 MB RAM) and sleeps when idle, so compiling is slow there. Java in particular needs a paid instance or a VM.

Secrets are never part of the image: `.env` files are excluded from the Docker build.

## How it works

```
client/   React + Vite + Tailwind
          Monaco editor, test panel, output checker, debugger UI, AI assistant
server/   Express + TypeScript
          /api/run    compile once, run every test with time and output limits
          /api/debug  record variables line by line (gdb · JDI · sys.settrace)
          /api/ai/*   Gemini chat (streamed), structured fixes and test generation
```

- Compiled programs are cached by a hash of the code, so "Run all" compiles once.
- The output checker runs in the browser. Changing an expected output or a checker setting updates the verdict immediately.
- The Gemini key stays on the server. User programs run with a minimal environment, so they can't read it.

## Security

CP Studio is meant for **trusted users**. Submitted code runs on the server without a sandbox. These safeguards are in place:

- time, output and request-size limits
- a cap on how many programs run at once
- per-IP rate limits
- an optional shared access key

Always set `ACCESS_KEY` on a public deployment.

## Author

**Rajveer Sharma**

@CP Studio
