import type { Language, Template } from '../types';

// The "Multi-test" templates read the number of test cases and call solve() for each one;
// the solution itself is left to write.

const CPP_MULTI = `#include <bits/stdc++.h>
using namespace std;

using ll = long long;
#define all(x) (x).begin(), (x).end()

void solve() {
    // write your code here

}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t = 1;
    cin >> t;
    while (t--) solve();
    return 0;
}
`;

const CPP_FAST = `#include <bits/stdc++.h>
using namespace std;

using ll = long long;
using pii = pair<int, int>;
#define all(x) (x).begin(), (x).end()
#define sz(x) (int)(x).size()

const int MOD = 1e9 + 7;
const ll INF = 4e18;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // your code here

    return 0;
}
`;

const CPP_BLANK = `#include <iostream>
using namespace std;

int main() {

    return 0;
}
`;

const JAVA_FAST_READER = `    static class FastReader {
        private final BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        private StringTokenizer st;

        String next() {
            while (st == null || !st.hasMoreTokens()) {
                try {
                    String line = br.readLine();
                    if (line == null) return null;
                    st = new StringTokenizer(line);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }
            return st.nextToken();
        }

        int nextInt() { return Integer.parseInt(next()); }
        long nextLong() { return Long.parseLong(next()); }
        double nextDouble() { return Double.parseDouble(next()); }

        String nextLine() {
            try {
                return br.readLine();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }`;

const JAVA_MULTI = `import java.io.*;
import java.util.*;

public class Main {
    static final FastReader in = new FastReader();
    static final PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));

    static void solve() {
        // write your code here: read with in.nextInt(), print with out.println()

    }

    public static void main(String[] args) {
        int t = in.nextInt();
        while (t-- > 0) solve();
        out.flush();
    }

${JAVA_FAST_READER}
}
`;

const JAVA_FAST = `import java.io.*;
import java.util.*;

public class Main {
    static final FastReader in = new FastReader();
    static final PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
    static final int MOD = 1_000_000_007;

    public static void main(String[] args) {
        // your code here

        out.flush();
    }

${JAVA_FAST_READER}
}
`;

const JAVA_BLANK = `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

    }
}
`;

const PYTHON_MULTI = `import sys
input = sys.stdin.readline


def solve():
    # write your code here
    pass


def main():
    t = int(input())
    for _ in range(t):
        solve()


if __name__ == "__main__":
    main()
`;

const PYTHON_FAST = `import sys
from collections import defaultdict, deque, Counter
from heapq import heappush, heappop
from bisect import bisect_left, bisect_right

sys.setrecursionlimit(1 << 25)
MOD = 10**9 + 7


def main():
    data = sys.stdin.buffer.read().split()
    pos = 0

    def nxt():
        nonlocal pos
        pos += 1
        return data[pos - 1]

    out = []
    # your code here: read with int(nxt()), append answers to out

    sys.stdout.write("\\n".join(map(str, out)) + "\\n")


if __name__ == "__main__":
    main()
`;

const PYTHON_BLANK = `def main():
    pass


if __name__ == "__main__":
    main()
`;

export const BUILTIN_TEMPLATES: Template[] = [
  { id: 'cpp-multi', language: 'cpp', name: 'Multi-test', description: 'solve() + t test cases, fast I/O', code: CPP_MULTI, builtin: true },
  { id: 'cpp-fast', language: 'cpp', name: 'CP Fast I/O', description: 'bits/stdc++, aliases, constants', code: CPP_FAST, builtin: true },
  { id: 'cpp-blank', language: 'cpp', name: 'Blank', description: 'Minimal main()', code: CPP_BLANK, builtin: true },
  { id: 'java-multi', language: 'java', name: 'Multi-test', description: 'FastReader + PrintWriter, t test cases', code: JAVA_MULTI, builtin: true },
  { id: 'java-fast', language: 'java', name: 'CP Fast I/O', description: 'FastReader + PrintWriter', code: JAVA_FAST, builtin: true },
  { id: 'java-blank', language: 'java', name: 'Blank', description: 'Scanner-based main()', code: JAVA_BLANK, builtin: true },
  { id: 'python-multi', language: 'python', name: 'Multi-test', description: 'readline + t test cases', code: PYTHON_MULTI, builtin: true },
  { id: 'python-fast', language: 'python', name: 'CP Fast I/O', description: 'Bulk token reading, common imports', code: PYTHON_FAST, builtin: true },
  { id: 'python-blank', language: 'python', name: 'Blank', description: 'Minimal main()', code: PYTHON_BLANK, builtin: true },
];

export const DEFAULT_CODE: Record<Language, string> = {
  cpp: CPP_MULTI,
  java: JAVA_MULTI,
  python: PYTHON_MULTI,
};

// solve() bodies: today's, and the first templates' (which printed the max of an array).
const SOLVE_BODIES: Record<Language, { now: string; old: string }> = {
  cpp: {
    now: '    // write your code here\n\n',
    old: "    int n;\n    cin >> n;\n    vector<ll> a(n);\n    for (auto &x : a) cin >> x;\n\n    cout << *max_element(all(a)) << '\\n';\n",
  },
  java: {
    now: '        // write your code here: read with in.nextInt(), print with out.println()\n\n',
    old: '        int n = in.nextInt();\n        long best = Long.MIN_VALUE;\n        for (int i = 0; i < n; i++) best = Math.max(best, in.nextLong());\n        out.println(best);\n',
  },
  python: {
    now: '    # write your code here\n    pass\n',
    old: '    n = int(input())\n    a = list(map(int, input().split()))\n    print(max(a))\n',
  },
};

const normalize = (code: string) => code.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();

/** A tab still exactly as an old Multi-test template left it gets today's template; edited code is kept. */
export function upgradeUntouchedTemplate(language: Language, code: string): string {
  const { now, old } = SOLVE_BODIES[language];
  const oldTemplate = DEFAULT_CODE[language].replace(now, old);
  return normalize(code) === normalize(oldTemplate) ? DEFAULT_CODE[language] : code;
}
