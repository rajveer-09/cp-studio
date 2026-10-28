import type { Language, Template } from '../types';

// The "Multi-test" templates all solve the default sample (print the max of each array),
// so a first Run shows a green "Accepted".

const CPP_MULTI = `#include <bits/stdc++.h>
using namespace std;

using ll = long long;
#define all(x) (x).begin(), (x).end()

void solve() {
    int n;
    cin >> n;
    vector<ll> a(n);
    for (auto &x : a) cin >> x;

    cout << *max_element(all(a)) << '\\n';
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
        int n = in.nextInt();
        long best = Long.MIN_VALUE;
        for (int i = 0; i < n; i++) best = Math.max(best, in.nextLong());
        out.println(best);
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
    n = int(input())
    a = list(map(int, input().split()))
    print(max(a))


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
