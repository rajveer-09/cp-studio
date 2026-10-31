import type { Language } from '../types';
import { LANGUAGE_META, LANGUAGES } from './languages';
import { monaco } from './monaco';

interface Snippet {
  label: string;
  detail: string;
  body: string[];
}

interface LanguageCompletions {
  keywords: string[];
  types: string[];
  functions: string[];
  members: string[];
  qualified: Record<string, string[]>;
  snippets: Snippet[];
}

const CPP_STD_FUNCTIONS = [
  'sort', 'stable_sort', 'reverse', 'max', 'min', 'swap', 'abs', 'accumulate', 'lower_bound', 'upper_bound',
  'binary_search', 'unique', 'next_permutation', 'prev_permutation', 'fill', 'iota', 'max_element', 'min_element',
  'count', 'count_if', 'find', 'find_if', 'gcd', 'lcm', '__gcd', 'memset', 'make_pair', 'make_tuple', 'to_string',
  'stoi', 'stoll', 'stod', 'getline', 'sqrt', 'pow', 'ceil', 'floor', 'log2', 'partial_sum', 'nth_element',
  'rotate', 'all_of', 'any_of', 'none_of', 'set_intersection', 'set_union', 'merge', 'distance', 'tie', 'minmax',
  '__builtin_popcount', '__builtin_popcountll', '__builtin_clz', '__builtin_ctz', '__lg',
];

const CPP: LanguageCompletions = {
  keywords: [
    'auto', 'bool', 'break', 'case', 'char', 'class', 'const', 'constexpr', 'continue', 'default', 'delete', 'do',
    'double', 'else', 'enum', 'false', 'float', 'for', 'if', 'inline', 'int', 'long', 'namespace', 'new', 'nullptr',
    'operator', 'private', 'public', 'return', 'short', 'signed', 'sizeof', 'static', 'static_cast', 'struct',
    'switch', 'template', 'this', 'true', 'typedef', 'typename', 'unsigned', 'using', 'void', 'while',
  ],
  types: [
    'vector', 'map', 'unordered_map', 'set', 'unordered_set', 'multiset', 'multimap', 'pair', 'tuple', 'string',
    'deque', 'queue', 'priority_queue', 'stack', 'array', 'bitset', 'list', 'int64_t', 'uint64_t', 'size_t', 'greater',
    'less', 'function',
  ],
  functions: [...CPP_STD_FUNCTIONS, 'cin', 'cout', 'cerr', 'endl', 'ios', 'INT_MAX', 'INT_MIN', 'LLONG_MAX', 'LLONG_MIN'],
  members: [
    'push_back', 'emplace_back', 'pop_back', 'push_front', 'pop_front', 'emplace', 'size', 'empty', 'clear', 'begin',
    'end', 'rbegin', 'rend', 'front', 'back', 'insert', 'erase', 'find', 'count', 'resize', 'assign', 'reserve', 'at',
    'substr', 'length', 'c_str', 'append', 'first', 'second', 'top', 'push', 'pop', 'lower_bound', 'upper_bound',
    'swap', 'contains',
  ],
  qualified: { std: [...CPP_STD_FUNCTIONS, 'vector', 'map', 'set', 'string', 'pair', 'cin', 'cout', 'endl'] },
  snippets: [
    {
      label: 'intll',
      detail: '#define int long long (then use signed main)',
      body: ['// Every int is 64-bit, so sums and products of large values don\'t overflow.', '#define int long long'],
    },
    {
      label: 'signedmain',
      detail: 'main() that works with #define int long long',
      body: ['signed main() {', '\tios::sync_with_stdio(false);', '\tcin.tie(nullptr);', '', '\t$0', '', '\treturn 0;', '}'],
    },
    { label: 'fori', detail: 'for loop 0..n-1', body: ['for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {', '\t$0', '}'] },
    { label: 'forr', detail: 'reverse for loop', body: ['for (int ${1:i} = ${2:n} - 1; ${1:i} >= 0; ${1:i}--) {', '\t$0', '}'] },
    { label: 'fore', detail: 'range-based for', body: ['for (auto &${1:x} : ${2:a}) {', '\t$0', '}'] },
    { label: 'readv', detail: 'read a vector of n values', body: ['vector<${1:long long}> ${2:a}(${3:n});', 'for (auto &x : ${2:a}) cin >> x;'] },
    { label: 'all', detail: 'v.begin(), v.end()', body: ['${1:v}.begin(), ${1:v}.end()'] },
    { label: 'yesno', detail: 'print YES / NO', body: ["cout << (${1:ok} ? \"YES\" : \"NO\") << '\\n';"] },
    { label: 'minpq', detail: 'min-heap priority queue', body: ['priority_queue<${1:int}, vector<${1:int}>, greater<${1:int}>> ${2:pq};'] },
    {
      label: 'graph',
      detail: 'read an undirected graph',
      body: ['vector<vector<int>> ${1:adj}(${2:n});', 'for (int i = 0; i < ${3:m}; i++) {', '\tint u, v;', '\tcin >> u >> v;', '\tu--, v--;', '\t${1:adj}[u].push_back(v);', '\t${1:adj}[v].push_back(u);', '}'],
    },
    {
      label: 'bfs',
      detail: 'breadth-first search distances',
      body: ['vector<int> dist(${1:n}, -1);', 'queue<int> q;', 'dist[${2:src}] = 0;', 'q.push(${2:src});', 'while (!q.empty()) {', '\tint u = q.front();', '\tq.pop();', '\tfor (int v : ${3:adj}[u]) {', '\t\tif (dist[v] == -1) {', '\t\t\tdist[v] = dist[u] + 1;', '\t\t\tq.push(v);', '\t\t}', '\t}', '}'],
    },
    {
      label: 'dfs',
      detail: 'recursive DFS (lambda)',
      body: ['function<void(int, int)> dfs = [&](int u, int parent) {', '\tfor (int v : ${1:adj}[u]) {', '\t\tif (v == parent) continue;', '\t\tdfs(v, u);', '\t}', '};', 'dfs(${2:0}, -1);'],
    },
    {
      label: 'binsearch',
      detail: 'binary search on the answer',
      body: ['long long lo = ${1:0}, hi = ${2:n}, ans = -1;', 'while (lo <= hi) {', '\tlong long mid = lo + (hi - lo) / 2;', '\tif (${3:check(mid)}) {', '\t\tans = mid;', '\t\thi = mid - 1;', '\t} else {', '\t\tlo = mid + 1;', '\t}', '}'],
    },
    {
      label: 'modpow',
      detail: 'fast modular exponentiation',
      body: ['long long modpow(long long b, long long e, long long m) {', '\tlong long r = 1 % m;', '\tb %= m;', '\twhile (e > 0) {', '\t\tif (e & 1) r = r * b % m;', '\t\tb = b * b % m;', '\t\te >>= 1;', '\t}', '\treturn r;', '}'],
    },
    {
      label: 'dsu',
      detail: 'disjoint set union',
      body: ['struct DSU {', '\tvector<int> p, sz;', '\tDSU(int n) : p(n), sz(n, 1) { iota(p.begin(), p.end(), 0); }', '\tint find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }', '\tbool unite(int a, int b) {', '\t\ta = find(a), b = find(b);', '\t\tif (a == b) return false;', '\t\tif (sz[a] < sz[b]) swap(a, b);', '\t\tp[b] = a;', '\t\tsz[a] += sz[b];', '\t\treturn true;', '\t}', '};'],
    },
    {
      label: 'sieve',
      detail: 'sieve of Eratosthenes',
      body: ['vector<bool> is_prime(${1:N} + 1, true);', 'is_prime[0] = is_prime[1] = false;', 'for (int i = 2; 1LL * i * i <= ${1:N}; i++)', '\tif (is_prime[i])', '\t\tfor (int j = i * i; j <= ${1:N}; j += i) is_prime[j] = false;'],
    },
  ],
};

const JAVA: LanguageCompletions = {
  keywords: [
    'abstract', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'continue', 'default', 'do', 'double',
    'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int',
    'interface', 'long', 'new', 'null', 'private', 'protected', 'public', 'return', 'short', 'static', 'super',
    'switch', 'this', 'throw', 'throws', 'try', 'void', 'while', 'var', 'true', 'false',
  ],
  types: [
    'String', 'StringBuilder', 'ArrayList', 'List', 'LinkedList', 'HashMap', 'TreeMap', 'Map', 'HashSet', 'TreeSet',
    'Set', 'ArrayDeque', 'Deque', 'Queue', 'PriorityQueue', 'Stack', 'Arrays', 'Collections', 'Math', 'Integer',
    'Long', 'Double', 'Character', 'Boolean', 'BigInteger', 'Scanner', 'BufferedReader', 'PrintWriter', 'Comparator',
    'System',
  ],
  functions: [],
  members: [
    'length', 'size', 'add', 'get', 'set', 'remove', 'contains', 'containsKey', 'getOrDefault', 'put', 'putIfAbsent',
    'merge', 'keySet', 'values', 'entrySet', 'isEmpty', 'clear', 'charAt', 'substring', 'toCharArray', 'equals',
    'indexOf', 'append', 'toString', 'reverse', 'offer', 'poll', 'peek', 'push', 'pop', 'addFirst', 'addLast',
    'pollFirst', 'pollLast', 'peekFirst', 'peekLast', 'firstKey', 'lastKey', 'floorKey', 'ceilingKey', 'higherKey',
    'lowerKey', 'first', 'last', 'floor', 'ceiling', 'compareTo', 'stream', 'forEach', 'sort', 'getKey', 'getValue',
    'nextInt', 'nextLong', 'nextLine', 'next', 'hasNext', 'println', 'print', 'printf', 'flush',
  ],
  qualified: {
    Math: ['max', 'min', 'abs', 'pow', 'sqrt', 'floor', 'ceil', 'round', 'log', 'log10', 'floorDiv', 'floorMod', 'hypot', 'cbrt'],
    Arrays: ['sort', 'fill', 'asList', 'toString', 'copyOf', 'copyOfRange', 'stream', 'binarySearch', 'equals', 'deepToString'],
    Collections: ['sort', 'reverse', 'max', 'min', 'swap', 'shuffle', 'frequency', 'nCopies', 'reverseOrder', 'emptyList'],
    Integer: ['parseInt', 'valueOf', 'MAX_VALUE', 'MIN_VALUE', 'toBinaryString', 'bitCount', 'compare', 'toString', 'highestOneBit', 'numberOfTrailingZeros'],
    Long: ['parseLong', 'valueOf', 'MAX_VALUE', 'MIN_VALUE', 'toBinaryString', 'bitCount', 'compare', 'toString'],
    Character: ['isDigit', 'isLetter', 'isUpperCase', 'isLowerCase', 'toUpperCase', 'toLowerCase', 'getNumericValue', 'isLetterOrDigit'],
    String: ['valueOf', 'format', 'join'],
    System: ['out', 'in', 'err', 'currentTimeMillis', 'nanoTime', 'exit', 'arraycopy', 'lineSeparator'],
    'System.out': ['println', 'print', 'printf', 'flush'],
  },
  snippets: [
    { label: 'fori', detail: 'for loop 0..n-1', body: ['for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {', '\t$0', '}'] },
    { label: 'forr', detail: 'reverse for loop', body: ['for (int ${1:i} = ${2:n} - 1; ${1:i} >= 0; ${1:i}--) {', '\t$0', '}'] },
    { label: 'fore', detail: 'for-each loop', body: ['for (${1:int} ${2:x} : ${3:a}) {', '\t$0', '}'] },
    { label: 'sout', detail: 'System.out.println', body: ['System.out.println($0);'] },
    { label: 'readarr', detail: 'read an int array (FastReader)', body: ['int[] ${1:a} = new int[${2:n}];', 'for (int i = 0; i < ${2:n}; i++) ${1:a}[i] = in.nextInt();'] },
    { label: 'list', detail: 'new ArrayList', body: ['List<${1:Integer}> ${2:list} = new ArrayList<>();'] },
    { label: 'hmap', detail: 'new HashMap', body: ['Map<${1:Integer}, ${2:Integer}> ${3:map} = new HashMap<>();'] },
    { label: 'minpq', detail: 'min-heap', body: ['PriorityQueue<${1:Integer}> ${2:pq} = new PriorityQueue<>();'] },
    {
      label: 'graph',
      detail: 'read an undirected graph',
      body: ['List<List<Integer>> ${1:adj} = new ArrayList<>();', 'for (int i = 0; i < ${2:n}; i++) ${1:adj}.add(new ArrayList<>());', 'for (int i = 0; i < ${3:m}; i++) {', '\tint u = in.nextInt() - 1, v = in.nextInt() - 1;', '\t${1:adj}.get(u).add(v);', '\t${1:adj}.get(v).add(u);', '}'],
    },
    {
      label: 'bfs',
      detail: 'breadth-first search distances',
      body: ['int[] dist = new int[${1:n}];', 'Arrays.fill(dist, -1);', 'ArrayDeque<Integer> q = new ArrayDeque<>();', 'dist[${2:src}] = 0;', 'q.add(${2:src});', 'while (!q.isEmpty()) {', '\tint u = q.poll();', '\tfor (int v : ${3:adj}.get(u)) {', '\t\tif (dist[v] == -1) {', '\t\t\tdist[v] = dist[u] + 1;', '\t\t\tq.add(v);', '\t\t}', '\t}', '}'],
    },
    {
      label: 'binsearch',
      detail: 'binary search on the answer',
      body: ['long lo = ${1:0}, hi = ${2:n}, ans = -1;', 'while (lo <= hi) {', '\tlong mid = lo + (hi - lo) / 2;', '\tif (${3:check(mid)}) {', '\t\tans = mid;', '\t\thi = mid - 1;', '\t} else {', '\t\tlo = mid + 1;', '\t}', '}'],
    },
    { label: 'gcd', detail: 'greatest common divisor', body: ['static long gcd(long a, long b) {', '\treturn b == 0 ? a : gcd(b, a % b);', '}'] },
    {
      label: 'modpow',
      detail: 'fast modular exponentiation',
      body: ['static long modpow(long b, long e, long m) {', '\tlong r = 1 % m;', '\tb %= m;', '\twhile (e > 0) {', '\t\tif ((e & 1) == 1) r = r * b % m;', '\t\tb = b * b % m;', '\t\te >>= 1;', '\t}', '\treturn r;', '}'],
    },
    {
      label: 'dsu',
      detail: 'disjoint set union',
      body: ['static int[] parent;', '', 'static int find(int x) {', '\treturn parent[x] == x ? x : (parent[x] = find(parent[x]));', '}', '', 'static boolean unite(int a, int b) {', '\ta = find(a);', '\tb = find(b);', '\tif (a == b) return false;', '\tparent[b] = a;', '\treturn true;', '}'],
    },
  ],
};

const PYTHON: LanguageCompletions = {
  keywords: [
    'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise',
    'return', 'True', 'try', 'while', 'with', 'yield',
  ],
  types: ['int', 'str', 'float', 'list', 'dict', 'set', 'tuple', 'bool'],
  functions: [
    'print', 'input', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max',
    'abs', 'pow', 'divmod', 'any', 'all', 'ord', 'chr', 'bin', 'hex', 'round', 'isinstance',
  ],
  members: [
    'append', 'extend', 'pop', 'insert', 'remove', 'index', 'count', 'sort', 'reverse', 'copy', 'clear', 'keys',
    'values', 'items', 'get', 'setdefault', 'update', 'add', 'discard', 'union', 'intersection', 'difference',
    'split', 'strip', 'rstrip', 'lstrip', 'join', 'lower', 'upper', 'isdigit', 'isalpha', 'startswith', 'endswith',
    'find', 'replace', 'format', 'popleft', 'appendleft', 'most_common',
  ],
  qualified: {
    math: ['sqrt', 'isqrt', 'gcd', 'lcm', 'ceil', 'floor', 'log', 'log2', 'log10', 'inf', 'pi', 'comb', 'perm', 'factorial'],
    sys: ['stdin', 'stdout', 'setrecursionlimit', 'exit', 'maxsize'],
    'sys.stdin': ['readline', 'read', 'buffer'],
    collections: ['defaultdict', 'Counter', 'deque', 'OrderedDict', 'namedtuple'],
    heapq: ['heappush', 'heappop', 'heapify', 'heappushpop', 'nlargest', 'nsmallest'],
    bisect: ['bisect_left', 'bisect_right', 'insort'],
    itertools: ['permutations', 'combinations', 'product', 'accumulate', 'groupby', 'chain', 'count'],
    functools: ['lru_cache', 'cache', 'reduce', 'cmp_to_key'],
  },
  snippets: [
    { label: 'fori', detail: 'for i in range(n)', body: ['for ${1:i} in range(${2:n}):', '\t$0'] },
    { label: 'tc', detail: 'loop over test cases', body: ['for _ in range(int(input())):', '\t$0'] },
    { label: 'inp', detail: 'read one integer', body: ['${1:n} = int(input())'] },
    { label: 'li', detail: 'read a list of integers', body: ['${1:a} = list(map(int, input().split()))'] },
    { label: 'mi', detail: 'read several integers', body: ['${1:a}, ${2:b} = map(int, input().split())'] },
    {
      label: 'graph',
      detail: 'read an undirected graph',
      body: ['${1:adj} = [[] for _ in range(${2:n})]', 'for _ in range(${3:m}):', '\tu, v = map(int, input().split())', '\t${1:adj}[u - 1].append(v - 1)', '\t${1:adj}[v - 1].append(u - 1)'],
    },
    {
      label: 'bfs',
      detail: 'breadth-first search distances',
      body: ['from collections import deque', '', 'dist = [-1] * ${1:n}', 'dist[${2:src}] = 0', 'q = deque([${2:src}])', 'while q:', '\tu = q.popleft()', '\tfor v in ${3:adj}[u]:', '\t\tif dist[v] == -1:', '\t\t\tdist[v] = dist[u] + 1', '\t\t\tq.append(v)'],
    },
    {
      label: 'binsearch',
      detail: 'binary search on the answer',
      body: ['lo, hi, ans = ${1:0}, ${2:n}, -1', 'while lo <= hi:', '\tmid = (lo + hi) // 2', '\tif ${3:check(mid)}:', '\t\tans = mid', '\t\thi = mid - 1', '\telse:', '\t\tlo = mid + 1'],
    },
    {
      label: 'dsu',
      detail: 'disjoint set union',
      body: ['parent = list(range(${1:n}))', '', 'def find(x):', '\twhile parent[x] != x:', '\t\tparent[x] = parent[parent[x]]', '\t\tx = parent[x]', '\treturn x', '', 'def unite(a, b):', '\ta, b = find(a), find(b)', '\tif a == b:', '\t\treturn False', '\tparent[b] = a', '\treturn True'],
    },
    {
      label: 'sieve',
      detail: 'sieve of Eratosthenes',
      body: ['is_prime = [True] * (${1:N} + 1)', 'is_prime[0] = is_prime[1] = False', 'for i in range(2, int(${1:N} ** 0.5) + 1):', '\tif is_prime[i]:', '\t\tfor j in range(i * i, ${1:N} + 1, i):', '\t\t\tis_prime[j] = False'],
    },
  ],
};

const COMPLETIONS: Record<Language, LanguageCompletions> = { cpp: CPP, java: JAVA, python: PYTHON };

export function isWatchable(language: Language, name: string): boolean {
  const { keywords, types, functions } = COMPLETIONS[language];
  return /^[A-Za-z_$][\w$]*$/.test(name) && !keywords.includes(name) && !types.includes(name) && !functions.includes(name);
}

const wordCache = new WeakMap<monaco.editor.ITextModel, { version: number; words: string[] }>();

function documentWords(model: monaco.editor.ITextModel): string[] {
  const version = model.getVersionId();
  let cached = wordCache.get(model);
  if (cached?.version !== version) {
    cached = { version, words: [...new Set(model.getValue().match(/[A-Za-z_]\w+/g) ?? [])].slice(0, 1000) };
    wordCache.set(model, cached);
  }
  return cached.words;
}

export function registerCompletions() {
  const Kind = monaco.languages.CompletionItemKind;

  for (const language of LANGUAGES) {
    const data = COMPLETIONS[language];
    monaco.languages.registerCompletionItemProvider(LANGUAGE_META[language].monaco, {
      triggerCharacters: language === 'cpp' ? ['.', ':', '>'] : ['.'],
      provideCompletionItems(model, position, context) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn));

        const access = /(?:([A-Za-z_][\w.]*?)|[)\]"'])\s*(\.|::|->)\s*$/.exec(before);
        // A lone ':' (case labels, ternaries), '>' (comparisons) or a '.' in a number shouldn't pop anything up.
        if (!access && context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter) return { suggestions: [] };
        if (access) {
          const known = access[1] ? data.qualified[access[1]] : undefined;
          const members = known ?? (access[2] === '::' ? [] : data.members);
          return {
            suggestions: members.map((label) => ({
              label,
              kind: /^[A-Z_]+$/.test(label) ? Kind.Constant : Kind.Method,
              insertText: label,
              range,
            })),
          };
        }

        const seen = new Set<string>();
        const item = (label: string, kind: monaco.languages.CompletionItemKind, sortGroup: string) => {
          seen.add(label);
          return { label, kind, insertText: label, range, sortText: `${sortGroup}${label}` };
        };
        const suggestions: monaco.languages.CompletionItem[] = [
          ...data.snippets.map((snippet) => ({
            label: snippet.label,
            kind: Kind.Snippet,
            detail: snippet.detail,
            documentation: { value: `\`\`\`${LANGUAGE_META[language].monaco}\n${snippet.body.join('\n').replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$0/g, '')}\n\`\`\`` },
            insertText: snippet.body.join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: `3${snippet.label}`,
          })),
          ...data.keywords.map((k) => item(k, Kind.Keyword, '2')),
          ...data.types.map((t) => item(t, Kind.Class, '2')),
          ...data.functions.map((f) => item(f, Kind.Function, '2')),
        ];
        for (const w of documentWords(model)) {
          if (!seen.has(w) && w !== word.word) suggestions.push(item(w, Kind.Variable, '1'));
        }
        return { suggestions };
      },
    });
  }
}
