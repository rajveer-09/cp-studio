import type { Language } from '../runner/languages.js';

/**
 * Turns a LeetCode method into a runnable program: the starter code in the middle, and a harness around
 * it (in foldable regions) that reads one test case from stdin (one argument per line, as LeetCode writes
 * them) and prints the result the way LeetCode does. Built from LeetCode's own type metadata, so no AI is
 * needed. Design problems (a class with several methods) and unusual types return null.
 */

type Kind = 'int' | 'long' | 'double' | 'bool' | 'string' | 'char' | 'tree' | 'listNode' | 'array' | 'list';
interface LcType {
  kind: Kind;
  of?: LcType;
}

interface Signature {
  method: string;
  params: LcType[];
  /** null for void methods. */
  returns: LcType | null;
  /** Void methods that change an argument in place: the argument to print. */
  printParam?: number;
}

const SCALARS: Record<string, Kind> = {
  integer: 'int', int: 'int', long: 'long', double: 'double', float: 'double', boolean: 'bool', string: 'string',
  character: 'char', char: 'char', treenode: 'tree', listnode: 'listNode',
};

function parseType(raw: string): LcType | null {
  const text = raw.trim();
  if (text.endsWith('[]')) {
    const of = parseType(text.slice(0, -2));
    return of && { kind: 'array', of };
  }
  const list = /^list<(.+)>$/i.exec(text);
  if (list) {
    const of = parseType(list[1]);
    return of && { kind: 'list', of };
  }
  const kind = SCALARS[text.toLowerCase()];
  return kind ? { kind } : null;
}

function parseSignature(metaData: string): Signature | null {
  let meta: { name?: unknown; params?: { type: string }[]; return?: { type?: string }; output?: { paramindex?: number }; systemdesign?: boolean };
  try {
    meta = JSON.parse(metaData);
  } catch {
    return null;
  }
  if (!meta || meta.systemdesign || typeof meta.name !== 'string' || !Array.isArray(meta.params)) return null;
  const params = meta.params.map((p) => parseType(String(p.type)));
  if (params.some((p) => !p)) return null;
  const returnType = meta.return?.type ?? 'void';
  const returns = returnType === 'void' ? null : parseType(returnType);
  if (returnType !== 'void' && !returns) return null;
  const printParam = !returns && typeof meta.output?.paramindex === 'number' ? meta.output.paramindex : undefined;
  return { method: meta.name, params: params as LcType[], returns, printParam };
}

const args = (sig: Signature) => sig.params.map((_, i) => `a${i}`).join(', ');

// ---------------------------------------------------------------------------------------------- C++

function cppType(t: LcType): string {
  switch (t.kind) {
    case 'int': return 'int';
    case 'long': return 'long long';
    case 'double': return 'double';
    case 'bool': return 'bool';
    case 'string': return 'string';
    case 'char': return 'char';
    case 'tree': return 'TreeNode*';
    case 'listNode': return 'ListNode*';
    default: return `vector<${cppType(t.of!)}>`;
  }
}

const CPP_TOP = `#pragma region LeetCode harness: headers and node types (click the arrow to expand)
#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};
#pragma endregion`;

const CPP_HELPERS = `// Each input line is one argument, written as on LeetCode: 5, "abc", [1,2,3], [[1,2],[3]], [1,null,2].
struct LcJson {
    char type = 'n';  // n: null, u: number, s: string, b: bool, a: array
    string text;
    bool flag = false;
    vector<LcJson> items;
};

LcJson lcParse(const string& s, size_t& i) {
    while (i < s.size() && isspace((unsigned char)s[i])) i++;
    LcJson j;
    if (i >= s.size()) return j;
    if (s[i] == '[') {
        j.type = 'a';
        i++;
        while (i < s.size()) {
            while (i < s.size() && (isspace((unsigned char)s[i]) || s[i] == ',')) i++;
            if (i >= s.size() || s[i] == ']') { i++; break; }
            size_t before = i;
            j.items.push_back(lcParse(s, i));
            if (i == before) break;
        }
    } else if (s[i] == '"') {
        j.type = 's';
        for (i++; i < s.size() && s[i] != '"'; i++) {
            if (s[i] == '\\\\' && i + 1 < s.size()) { i++; j.text += s[i] == 'n' ? '\\n' : s[i] == 't' ? '\\t' : s[i]; }
            else j.text += s[i];
        }
        i++;
    } else if (s.compare(i, 4, "true") == 0) { j.type = 'b'; j.flag = true; i += 4; }
    else if (s.compare(i, 5, "false") == 0) { j.type = 'b'; i += 5; }
    else if (s.compare(i, 4, "null") == 0) { i += 4; }
    else {
        j.type = 'u';
        while (i < s.size() && (isdigit((unsigned char)s[i]) || strchr("+-.eE", s[i]))) j.text += s[i++];
    }
    return j;
}

template <class T> struct LcFrom;
template <> struct LcFrom<int> { static int get(const LcJson& j) { return stoi(j.text); } };
template <> struct LcFrom<long long> { static long long get(const LcJson& j) { return stoll(j.text); } };
template <> struct LcFrom<double> { static double get(const LcJson& j) { return stod(j.text); } };
template <> struct LcFrom<bool> { static bool get(const LcJson& j) { return j.flag; } };
template <> struct LcFrom<string> { static string get(const LcJson& j) { return j.text; } };
template <> struct LcFrom<char> { static char get(const LcJson& j) { return j.text.empty() ? ' ' : j.text[0]; } };
template <class T> struct LcFrom<vector<T>> {
    static vector<T> get(const LcJson& j) {
        vector<T> v;
        for (const LcJson& x : j.items) v.push_back(LcFrom<T>::get(x));
        return v;
    }
};
template <> struct LcFrom<ListNode*> {
    static ListNode* get(const LcJson& j) {
        ListNode head;
        ListNode* tail = &head;
        for (const LcJson& x : j.items) tail = tail->next = new ListNode(stoi(x.text));
        return head.next;
    }
};
template <> struct LcFrom<TreeNode*> {
    static TreeNode* get(const LcJson& j) {
        if (j.items.empty() || j.items[0].type == 'n') return nullptr;
        vector<TreeNode*> nodes;
        for (const LcJson& x : j.items) nodes.push_back(x.type == 'n' ? nullptr : new TreeNode(stoi(x.text)));
        size_t child = 1;
        for (size_t i = 0; i < nodes.size() && child < nodes.size(); i++) {
            if (!nodes[i]) continue;
            nodes[i]->left = nodes[child++];
            if (child < nodes.size()) nodes[i]->right = nodes[child++];
        }
        return nodes[0];
    }
};

string lcShow(int v) { return to_string(v); }
string lcShow(long long v) { return to_string(v); }
string lcShow(double v) { char b[64]; snprintf(b, sizeof b, "%.5f", v); return b; }
string lcShow(bool v) { return v ? "true" : "false"; }
string lcShow(const string& v) {
    string s = "\\"";
    for (char c : v) { if (c == '"' || c == '\\\\') s += '\\\\'; s += c; }
    return s + "\\"";
}
string lcShow(char c) { return lcShow(string(1, c)); }
string lcShow(ListNode* head) {
    string s = "[";
    for (ListNode* p = head; p; p = p->next) s += (p == head ? "" : ",") + to_string(p->val);
    return s + "]";
}
string lcShow(TreeNode* root) {
    vector<string> out;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* n = q.front();
        q.pop();
        if (!n) { out.push_back("null"); continue; }
        out.push_back(to_string(n->val));
        q.push(n->left);
        q.push(n->right);
    }
    while (!out.empty() && out.back() == "null") out.pop_back();
    string s = "[";
    for (size_t i = 0; i < out.size(); i++) s += (i ? "," : "") + out[i];
    return s + "]";
}
template <class T> string lcShow(const vector<T>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) s += (i ? "," : "") + lcShow(static_cast<T>(v[i]));
    return s + "]";
}`;

function cppProgram(sig: Signature, snippet: string): string {
  const decls = sig.params.map((t, i) => `    ${cppType(t)} a${i} = LcFrom<${cppType(t)}>::get(arg(${i}));`).join('\n');
  const call = sig.returns
    ? `    cout << lcShow(solution.${sig.method}(${args(sig)})) << "\\n";`
    : `    solution.${sig.method}(${args(sig)});${sig.printParam !== undefined ? `\n    cout << lcShow(a${sig.printParam}) << "\\n";` : ''}`;
  return `${CPP_TOP}

${snippet.trim()}

#pragma region LeetCode harness: reads one test case from stdin and prints the answer
${CPP_HELPERS}

int main() {
    vector<string> lines;
    for (string line; getline(cin, line);) {
        while (!line.empty() && isspace((unsigned char)line.back())) line.pop_back();
        if (!line.empty()) lines.push_back(line);
    }
    auto arg = [&](size_t k) { size_t i = 0; return lcParse(k < lines.size() ? lines[k] : string(), i); };
${decls}
    Solution solution;
${call}
    return 0;
}
#pragma endregion
`;
}

// --------------------------------------------------------------------------------------------- Java

function javaType(t: LcType): string {
  switch (t.kind) {
    case 'int': return 'int';
    case 'long': return 'long';
    case 'double': return 'double';
    case 'bool': return 'boolean';
    case 'string': return 'String';
    case 'char': return 'char';
    case 'tree': return 'TreeNode';
    case 'listNode': return 'ListNode';
    case 'array': return `${javaType(t.of!)}[]`;
    default: return `List<${javaBoxed(t.of!)}>`;
  }
}

function javaBoxed(t: LcType): string {
  const boxed: Partial<Record<Kind, string>> = { int: 'Integer', long: 'Long', double: 'Double', bool: 'Boolean', char: 'Character' };
  return boxed[t.kind] ?? javaType(t);
}

function javaConvert(t: LcType, expr: string, depth = 0): string {
  const x = `x${depth}`;
  const simple: Partial<Record<Kind, string>> = {
    int: 'toInt', long: 'toLong', double: 'toDouble', bool: 'toBool', string: 'toStr', char: 'toChar', tree: 'toTree', listNode: 'toListNode',
  };
  if (simple[t.kind]) return `${simple[t.kind]}(${expr})`;
  const of = t.of!;
  if (t.kind === 'list') return `items(${expr}).stream().map(${x} -> ${javaConvert(of, x, depth + 1)}).collect(Collectors.toList())`;
  if (of.kind === 'int') return `items(${expr}).stream().mapToInt(${x} -> toInt(${x})).toArray()`;
  if (of.kind === 'long') return `items(${expr}).stream().mapToLong(${x} -> toLong(${x})).toArray()`;
  if (of.kind === 'double') return `items(${expr}).stream().mapToDouble(${x} -> toDouble(${x})).toArray()`;
  if (of.kind === 'bool') return `toBoolArray(${expr})`;
  if (of.kind === 'char') return `toCharArray(${expr})`;
  return `items(${expr}).stream().map(${x} -> ${javaConvert(of, x, depth + 1)}).toArray(${javaType(of)}[]::new)`;
}

const JAVA_TOP = `// #region LeetCode harness: imports and node types (click the arrow to expand)
import java.util.*;
import java.util.stream.*;

class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}
// #endregion`;

const JAVA_HELPERS = `    // Each input line is one argument, written as on LeetCode: 5, "abc", [1,2,3], [[1,2],[3]], [1,null,2].
    static final class Num {
        final String text;
        Num(String text) { this.text = text; }
    }

    static Object parse(String s) { return parseValue(s, new int[] {0}); }

    static Object parseValue(String s, int[] p) {
        skip(s, p);
        if (p[0] >= s.length()) return null;
        char c = s.charAt(p[0]);
        if (c == '[') {
            p[0]++;
            List<Object> list = new ArrayList<>();
            while (p[0] < s.length()) {
                while (p[0] < s.length() && (Character.isWhitespace(s.charAt(p[0])) || s.charAt(p[0]) == ',')) p[0]++;
                if (p[0] >= s.length() || s.charAt(p[0]) == ']') { p[0]++; break; }
                int before = p[0];
                list.add(parseValue(s, p));
                if (p[0] == before) break;
            }
            return list;
        }
        if (c == '"') {
            StringBuilder b = new StringBuilder();
            for (p[0]++; p[0] < s.length() && s.charAt(p[0]) != '"'; p[0]++) {
                char ch = s.charAt(p[0]);
                if (ch == '\\\\' && p[0] + 1 < s.length()) { char e = s.charAt(++p[0]); b.append(e == 'n' ? '\\n' : e == 't' ? '\\t' : e); }
                else b.append(ch);
            }
            p[0]++;
            return b.toString();
        }
        if (s.startsWith("true", p[0])) { p[0] += 4; return Boolean.TRUE; }
        if (s.startsWith("false", p[0])) { p[0] += 5; return Boolean.FALSE; }
        if (s.startsWith("null", p[0])) { p[0] += 4; return null; }
        int start = p[0];
        while (p[0] < s.length() && "+-.eE0123456789".indexOf(s.charAt(p[0])) >= 0) p[0]++;
        return new Num(s.substring(start, p[0]));
    }

    static void skip(String s, int[] p) { while (p[0] < s.length() && Character.isWhitespace(s.charAt(p[0]))) p[0]++; }

    static int toInt(Object o) { return Integer.parseInt(((Num) o).text); }
    static long toLong(Object o) { return Long.parseLong(((Num) o).text); }
    static double toDouble(Object o) { return Double.parseDouble(((Num) o).text); }
    static boolean toBool(Object o) { return (Boolean) o; }
    static String toStr(Object o) { return (String) o; }
    static char toChar(Object o) { String s = (String) o; return s.isEmpty() ? ' ' : s.charAt(0); }

    @SuppressWarnings("unchecked")
    static List<Object> items(Object o) { return o == null ? new ArrayList<>() : (List<Object>) o; }

    static boolean[] toBoolArray(Object o) {
        List<Object> l = items(o);
        boolean[] r = new boolean[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = toBool(l.get(i));
        return r;
    }

    static char[] toCharArray(Object o) {
        List<Object> l = items(o);
        char[] r = new char[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = toChar(l.get(i));
        return r;
    }

    static ListNode toListNode(Object o) {
        ListNode head = new ListNode(), tail = head;
        for (Object x : items(o)) tail = tail.next = new ListNode(toInt(x));
        return head.next;
    }

    static TreeNode toTree(Object o) {
        List<Object> l = items(o);
        if (l.isEmpty() || l.get(0) == null) return null;
        TreeNode[] nodes = new TreeNode[l.size()];
        for (int i = 0; i < nodes.length; i++) nodes[i] = l.get(i) == null ? null : new TreeNode(toInt(l.get(i)));
        int child = 1;
        for (int i = 0; i < nodes.length && child < nodes.length; i++) {
            if (nodes[i] == null) continue;
            nodes[i].left = nodes[child++];
            if (child < nodes.length) nodes[i].right = nodes[child++];
        }
        return nodes[0];
    }

    static String show(Object o) {
        if (o == null) return "null";
        if (o instanceof String) return quote((String) o);
        if (o instanceof Character) return quote(o.toString());
        if (o instanceof Double || o instanceof Float) return String.format(Locale.ROOT, "%.5f", ((Number) o).doubleValue());
        if (o instanceof Number || o instanceof Boolean) return o.toString();
        StringJoiner j = new StringJoiner(",", "[", "]");
        if (o instanceof ListNode) {
            for (ListNode p = (ListNode) o; p != null; p = p.next) j.add(String.valueOf(p.val));
        } else if (o instanceof TreeNode) {
            List<String> out = new ArrayList<>();
            LinkedList<TreeNode> queue = new LinkedList<>();
            queue.add((TreeNode) o);
            while (!queue.isEmpty()) {
                TreeNode n = queue.poll();
                if (n == null) { out.add("null"); continue; }
                out.add(String.valueOf(n.val));
                queue.add(n.left);
                queue.add(n.right);
            }
            while (!out.isEmpty() && out.get(out.size() - 1).equals("null")) out.remove(out.size() - 1);
            out.forEach(j::add);
        } else if (o.getClass().isArray()) {
            for (int i = 0; i < java.lang.reflect.Array.getLength(o); i++) j.add(show(java.lang.reflect.Array.get(o, i)));
        } else if (o instanceof Iterable) {
            for (Object x : (Iterable<?>) o) j.add(show(x));
        } else {
            return o.toString();
        }
        return j.toString();
    }

    static String quote(String s) { return "\\"" + s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\""; }`;

function javaProgram(sig: Signature, snippet: string): string {
  const decls = sig.params.map((t, i) => `        ${javaType(t)} a${i} = ${javaConvert(t, `arg(lines, ${i})`)};`).join('\n');
  // An empty tree or list prints as [] on LeetCode, not null.
  const shown = (expr: string, t: LcType) => (t.kind === 'tree' || t.kind === 'listNode' ? `${expr} == null ? "[]" : show(${expr})` : `show(${expr})`);
  const call = sig.returns
    ? `        ${javaType(sig.returns)} result = solution.${sig.method}(${args(sig)});\n        System.out.println(${shown('result', sig.returns)});`
    : `        solution.${sig.method}(${args(sig)});${sig.printParam !== undefined ? `\n        System.out.println(${shown(`a${sig.printParam}`, sig.params[sig.printParam])});` : ''}`;
  return `${JAVA_TOP}

${snippet.trim()}

// #region LeetCode harness: reads one test case from stdin and prints the answer
public class Main {
    public static void main(String[] args) throws Exception {
        java.io.BufferedReader in = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        List<String> lines = new ArrayList<>();
        for (String line; (line = in.readLine()) != null;) if (!line.trim().isEmpty()) lines.add(line.trim());
${decls}
        Solution solution = new Solution();
${call}
    }

    static Object arg(List<String> lines, int k) { return k < lines.size() ? parse(lines.get(k)) : null; }

${JAVA_HELPERS}
}
// #endregion
`;
}

// ------------------------------------------------------------------------------------------- Python

function pythonConvert(t: LcType, expr: string, depth = 0): string {
  if (t.kind === 'tree') return `_tree(${expr})`;
  if (t.kind === 'listNode') return `_list_node(${expr})`;
  if (t.kind === 'double') return `float(${expr})`;
  if ((t.kind === 'array' || t.kind === 'list') && needsPythonConversion(t.of!)) {
    const x = `x${depth}`;
    return `[${pythonConvert(t.of!, x, depth + 1)} for ${x} in ${expr}]`;
  }
  return expr;
}

const needsPythonConversion = (t: LcType): boolean =>
  t.kind === 'tree' || t.kind === 'listNode' || t.kind === 'double' || ((t.kind === 'array' || t.kind === 'list') && needsPythonConversion(t.of!));

const hasDouble = (t: LcType): boolean => t.kind === 'double' || (Boolean(t.of) && hasDouble(t.of!));

const PYTHON_TOP = `#region LeetCode harness: imports and node types (click the arrow to expand)
import json
import math
import sys
from bisect import *
from collections import *
from functools import *
from heapq import *
from itertools import *
from typing import *


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
#endregion`;

const PYTHON_HELPERS = `# Each input line is one argument, written as on LeetCode: 5, "abc", [1,2,3], [[1,2],[3]], [1,null,2].
def _list_node(values):
    head = tail = ListNode()
    for v in values or []:
        tail.next = ListNode(v)
        tail = tail.next
    return head.next


def _tree(values):
    if not values or values[0] is None:
        return None
    nodes = [None if v is None else TreeNode(v) for v in values]
    child = 1
    for node in nodes:
        if child >= len(nodes):
            break
        if node is None:
            continue
        node.left = nodes[child]
        child += 1
        if child < len(nodes):
            node.right = nodes[child]
            child += 1
    return nodes[0]


def _show(v, decimals=False):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float) or (decimals and isinstance(v, int)):
        return f'{float(v):.5f}'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v)
    if isinstance(v, ListNode):
        out = []
        while v:
            out.append(str(v.val))
            v = v.next
        return '[' + ','.join(out) + ']'
    if isinstance(v, TreeNode):
        out, queue = [], [v]
        for node in queue:
            if node is None:
                out.append('null')
                continue
            out.append(str(node.val))
            queue += [node.left, node.right]
        while out and out[-1] == 'null':
            out.pop()
        return '[' + ','.join(out) + ']'
    if isinstance(v, (list, tuple)):
        return '[' + ','.join(_show(x, decimals) for x in v) + ']'
    return str(v)`;

function pythonProgram(sig: Signature, snippet: string): string {
  const decls = sig.params.map((t, i) => `    a${i} = ${pythonConvert(t, `_args[${i}]`)}`).join('\n');
  const shown = (expr: string, t: LcType) => {
    const value = t.kind === 'tree' || t.kind === 'listNode' ? `'[]' if ${expr} is None else _show(${expr})` : `_show(${expr}${hasDouble(t) ? ', True' : ''})`;
    return `print(${value})`;
  };
  const call = sig.returns
    ? `    _result = Solution().${sig.method}(${args(sig)})\n    ${shown('_result', sig.returns)}`
    : `    Solution().${sig.method}(${args(sig)})${sig.printParam !== undefined ? `\n    ${shown(`a${sig.printParam}`, sig.params[sig.printParam])}` : ''}`;
  return `${PYTHON_TOP}


${snippet.trim()}


#region LeetCode harness: reads one test case from stdin and prints the answer
${PYTHON_HELPERS}


if __name__ == '__main__':
    _args = [json.loads(line) for line in sys.stdin.read().splitlines() if line.strip()]
${decls}
${call}
#endregion
`;
}

const BUILDERS: Record<Language, (sig: Signature, snippet: string) => string> = {
  cpp: cppProgram,
  java: javaProgram,
  python: pythonProgram,
};

/** Full programs for each language LeetCode has a snippet for, or nothing when the method can't be wrapped. */
export function leetCodePrograms(metaData: string | null, snippets: Partial<Record<Language, string>>): Partial<Record<Language, string>> {
  const sig = metaData ? parseSignature(metaData) : null;
  if (!sig) return {};
  const programs: Partial<Record<Language, string>> = {};
  for (const [language, snippet] of Object.entries(snippets) as [Language, string][]) {
    programs[language] = BUILDERS[language](sig, snippet);
  }
  return programs;
}
