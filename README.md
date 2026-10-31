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

### Import problems
- **Fetch a problem by its number or URL:**
  - **CodeChef:** `FLOW001`
  - **LeetCode:** `1` or `two-sum`
  - **AtCoder:** `abc300_a`

  You get the statement, with math typeset (KaTeX) as on the judge's site, plus the sample tests and the time limit. An import can be undone.
- **Submit on Codeforces / CodeChef / LeetCode / AtCoder** copies your code (for LeetCode, just the `Solution` class) and opens the judge's submit page with the problem selected.
- The sample tests appear under the statement as **Input / Output** cards with copy buttons. They are also loaded as your test cases, and **Use as test cases** puts them back after you've changed them.
- **Codeforces** blocks automated downloads, so a one-click **Send to CP Studio** bookmark reads the problem from the page you have open.
- **LeetCode** problems are methods rather than programs. Importing one opens a tab (e.g. `two-sum.cpp`) in each language, with the `Solution` class ready to fill in. The code that reads each test and prints the answer in LeetCode's format sits in collapsed blocks above and below it, built from LeetCode's own type information (no AI needed). Design problems such as `LRUCache` get an AI-written `main()` via **Starter + main()**.

### Run like a judge
- **Multiple test cases**, each with an input, an expected output and your output, plus verdicts: **Accepted**, **Wrong Answer**, **Time Limit Exceeded**, **Runtime Error** and **Compilation Error**.
  - Each case shows its verdict as a coloured dot, and one verdict line explains the first difference.
  - Drag the dividers to resize the Input / Expected / Output columns. Change their text size from the **⋯** menu, in Settings, or with `Ctrl` + mouse wheel over them.
  - Quick actions: copy, clear, and use your output as the expected output.
  - Reset options: restore the problem's samples, clear results, or delete all cases. Each can be undone.
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
- **Generate tests** (`Alt+G`): edge, random or mixed cases, written to fit your code's input format. Expected outputs are worked out from the problem statement. Pick which ones to add, and they run straight away.
- `/debug`, `/hint` (no spoilers), `/explain`, `/optimize`, `/complexity`.
- It stays on topic: it only answers questions about data structures, algorithms and your code.
- **Several API keys:**
  - Requests rotate through every key in `GEMINI_API_KEYS`.
  - A key that runs out of quota rests until the quota refills: for a per-minute limit, the delay Gemini asks for; for the daily limit, midnight Pacific time. Meanwhile the other keys take over.
  - When every key is out on the main model, it falls back to the Flash-Lite models, which have far higher free limits.
  - Gemini counts quota per Google Cloud project, so create each key in its own project.
- **Lean on tokens:**
  - Only failing tests and the selected test are sent in full; long inputs and outputs keep their beginning and end.
  - Earlier chat turns are trimmed, and `/explain` and `/complexity` skip test data entirely.
  - Token use for each request is logged on the server.

### Debugger
- Select a variable and click **Debug**. The program runs on the selected test case and every line is recorded.
- Step forward and back, or scrub a timeline. The current line is highlighted, with the variable values shown next to it.
- Each variable's full history of changes is listed. Runtime errors are pinpointed to their line.
- Engines: **gdb** for C++, **JDI** for Java and **sys.settrace** for Python.

### Editor
- The **Monaco** editor (the editor behind VS Code).
- **14 themes**, each coloring both the app and the code:
  - **Dark:** Ember (the default: graphite with an orange accent and Monokai-style code colors), Midnight, One Dark, Dracula, Tokyo Night, Nord, Monokai, Gruvbox, Catppuccin Mocha, GitHub Dark.
  - **Light:** Daylight, GitHub Light, Solarized Light, Catppuccin Latte.

  `Alt+T` switches between your favourite dark and light theme.
- **Easy on the eyes:** Darkness and Contrast sliders (theme menu or Settings) adjust any theme: the panels, navigation and editor together.
- **Tabs:** keep several files per language, e.g. a solution and a brute force.
  - **+** adds a tab from any template, or duplicates the current one.
  - Double-click a tab to rename it. Closing a tab can be undone.
  - Run, the debugger and the AI always act on the active tab.
- **Autocomplete** for keywords, STL / Java / Python library members, identifiers in your file, and CP snippets: `fori`, `readv`, `bfs`, `dfs`, `dsu`, `binsearch`, `modpow`, `sieve`, `graph`…
- **Formatting** with clang-format (C++/Java) and Ruff (Python). Both run in the browser as WebAssembly.
- **CP templates** (multi-test, fast I/O, blank) and your own saved templates, plus **Reset** to start over. Reset can be undone.
- **Download** the active tab as a file, or all your tabs as a `.zip`.
- **Save to GitHub**: sign in with your own GitHub account and commit solutions to your repository (e.g. `codeforces/1904A.cpp`); the repository is created on first save.
- Resizable panels, with the test panel **below or beside** the editor. Your work is saved in the browser automatically.
- **Lock layout** (`Alt+K` or the lock button) so panels can't be resized, moved or hidden by accident while you code.
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
cp server/.env.example server/.env   # add your GEMINI_API_KEYS
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
| `Alt+G` | Generate test cases with AI |
| `Shift+Alt+F` | Format code |
| `Alt+W` / `F8` | Debug the variable at the cursor / restart debugging |
| `Alt+.` / `Alt+,` | Next / previous debugger step |
| `Ctrl+Shift+A` | Focus the AI assistant |
| `Alt+Y` / `Esc` | Accept / reject a proposed fix |
| `Alt+1` `Alt+2` `Alt+3` | Switch to C++ / Java / Python |
| `Alt+L` | Move the test panel right / bottom |
| `Alt+B` | Show / hide the AI assistant |
| `Alt+K` | Lock / unlock the layout |
| `Alt+T` | Switch between your dark and light theme |
| `Alt+/` | Show all shortcuts |

On macOS, use `⌘` instead of `Ctrl`.

## Configuration

Set these in `server/.env` locally, or as environment variables when deploying.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEYS` | (empty) | One or more Gemini API keys, comma-separated. Turns on the AI assistant |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Main Gemini model |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.5-flash-lite,gemini-3.1-flash-lite` | Used in order when every key is out of quota on the main model |
| `ACCESS_KEY` | (empty) | Optional shared password that visitors enter once |
| `GITHUB_CLIENT_ID` `GITHUB_CLIENT_SECRET` | (empty) | A GitHub OAuth App for **Save to GitHub**; each user signs in with their own account |
| `PORT` | `3001` | HTTP port |
| `TRUST_PROXY` | `1` in Docker | Set behind a reverse proxy, so rate limits see real IPs |
| `CXX` `JAVAC` `JAVA` `PYTHON` `GDB` | `g++` `javac` `java` `python3` `gdb` | Toolchain commands |
| `MAX_CONCURRENT_RUNS` | the CPU the container may use (1 on a 0.1-CPU instance) | Programs compiled or run at the same time |
| `CXX_PCH_DIR` | `/opt/cp-pch` in Docker | Precompiled `<bits/stdc++.h>`, which makes C++17 compiles about 3× faster |

## Deployment

The `Dockerfile` builds one image with the app, g++, gdb, Java 17 and Python 3. It runs anywhere Docker does:

```bash
docker build -t cp-studio .
docker run -p 3001:3001 -e GEMINI_API_KEYS=key1,key2 -e ACCESS_KEY=choose-a-password cp-studio
```

**On Render:**
1. Create a **Web Service** from this repo.
2. Choose the **Docker** runtime.
3. Add `GEMINI_API_KEYS`, `GEMINI_MODEL` and `ACCESS_KEY` as environment variables.

The port is picked up automatically. Render's free instance is small (about 0.1 CPU, 512 MB RAM) and sleeps when idle, so compiling is slow there. Java in particular needs a paid instance or a VM.

Secrets are never part of the image: `.env` files are excluded from the Docker build.

## How it works

```
client/   React + Vite + Tailwind
          Monaco editor, test panel, output checker, debugger UI, AI assistant
server/   Express + TypeScript
          /api/run    compile once, run every test with time and output limits
          /api/debug     record variables line by line (gdb · JDI · sys.settrace)
          /api/problems  import statements and samples from CodeChef, LeetCode, AtCoder
          /api/ai/*      Gemini chat (streamed), structured fixes, test generation, LeetCode drivers
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
