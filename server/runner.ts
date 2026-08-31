// Compiles candidate TypeScript with the real tsc, then executes it (plus the
// question's test harness) in a sandboxed child Node process with a timeout.

import * as ts from "typescript";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { QUESTIONS } from "./questions";

export interface CaseResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface RunResult {
  ok: boolean; // compiled and executed without crashing
  diagnostics: string[]; // TypeScript compiler errors (empty if clean)
  stdout: string; // candidate's own console output (harness marker stripped)
  stderr: string;
  cases: CaseResult[]; // test results (empty for design questions)
  timedOut: boolean;
  durationMs: number;
}

export type Lang = "ts" | "js" | "py";

// Ambient globals available to candidate code. Declared rather than pulled in
// via @types/node so the sandbox surface stays small and predictable — a
// candidate should see the same globals a coding round would give them.
const PREAMBLE = `
declare const console: {
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
  debug(...args: any[]): void;
  table(...args: any[]): void;
};
declare function setTimeout(fn: (...a: any[]) => void, ms?: number, ...args: any[]): any;
declare function clearTimeout(handle: any): void;
declare function setInterval(fn: (...a: any[]) => void, ms?: number, ...args: any[]): any;
declare function clearInterval(handle: any): void;
declare function queueMicrotask(fn: () => void): void;
declare function structuredClone<T>(value: T): T;
declare const performance: { now(): number };
`;

const PRELUDE = `
type __CaseResult = { name: string; pass: boolean; detail?: string };
const __results: __CaseResult[] = [];
function __fmt(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
function __check(name: string, got: unknown, want: unknown): void {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  __results.push(pass ? { name, pass } : { name, pass, detail: "expected " + __fmt(want) + ", got " + __fmt(got) });
}
function __checkSet(name: string, got: unknown[], want: unknown[]): void {
  const g = [...got].sort((a, b) => String(a).localeCompare(String(b)));
  const w = [...want].sort((a, b) => String(a).localeCompare(String(b)));
  __check(name, g, w);
}
`;

const EPILOGUE = `
(async () => {
  try {
    // @ts-ignore -- defined by the question harness when present
    if (typeof __harnessMain === "function") { await __harnessMain(); }
  } catch (e) {
    __results.push({ name: "harness crashed", pass: false, detail: e instanceof Error ? (e.stack || e.message) : String(e) });
  }
  console.log("__ARENA_RESULTS__" + JSON.stringify(__results));
})();
`;

export function runCode(questionId: string, code: string, lang: Lang = "ts"): RunResult {
  if (lang === "py") return runPython(questionId, code);
  if (lang === "js") return runJavaScript(questionId, code);
  return runTypeScript(questionId, code);
}

function runTypeScript(questionId: string, code: string): RunResult {
  const started = Date.now();
  const question = QUESTIONS.get(questionId);
  const harness = question?.harness ?? "";
  const full = PREAMBLE + "\n" + code + "\n" + PRELUDE + "\n" + harness + "\n" + EPILOGUE;

  // Line numbers are reported against the candidate's own code, so map the
  // compiler's lines back by subtracting the preamble and flagging anything
  // that lands past the end of their code as harness-internal.
  const preambleLines = PREAMBLE.split("\n").length;
  const codeLines = code.split("\n").length;

  // Typecheck with the real compiler; only run if it's clean.
  const diagnostics = typecheck(full, preambleLines, codeLines);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics, stdout: "", stderr: "", cases: [], timedOut: false, durationMs: Date.now() - started };
  }
  return executeNode(full, started);
}

// Plain JavaScript: no static typecheck (JS has no annotations). The candidate's
// JS and the question's TS harness are transpiled together — which strips the
// harness's type annotations — then run on Node. JS is a subset of TS, so the
// candidate's code passes through the transpiler untouched.
function runJavaScript(questionId: string, code: string): RunResult {
  const started = Date.now();
  const harness = QUESTIONS.get(questionId)?.harness ?? "";
  const full = code + "\n" + PRELUDE + "\n" + harness + "\n" + EPILOGUE;
  return executeNode(full, started);
}

// Transpiles a combined TS/JS source and runs it in a sandboxed child process,
// returning the parsed harness results. Shared by the TS and JS paths.
function executeNode(full: string, started: number): RunResult {
  const js = ts.transpileModule(full, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-run-"));
  const file = path.join(dir, "candidate.cjs");
  fs.writeFileSync(file, js);
  try {
    const proc = spawnSync(process.execPath, ["--stack-size=4000", file], {
      timeout: 10_000,
      encoding: "utf8",
      cwd: dir,
      env: { PATH: process.env.PATH ?? "" }, // no secrets leak into candidate code
      maxBuffer: 4 * 1024 * 1024,
    });
    const timedOut = proc.error != null && (proc.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
    let stdout = proc.stdout ?? "";
    let cases: CaseResult[] = [];
    const marker = stdout.lastIndexOf("__ARENA_RESULTS__");
    if (marker >= 0) {
      const line = stdout.slice(marker + "__ARENA_RESULTS__".length);
      stdout = stdout.slice(0, marker);
      try {
        cases = (JSON.parse(line.split("\n")[0]) as CaseResult[]).map((c) =>
          c.detail ? { ...c, detail: cleanTrace(c.detail, file) } : c
        );
      } catch {
        /* corrupted marker line; leave cases empty */
      }
    }
    const crashed = proc.status !== 0 && !timedOut;
    return {
      ok: !crashed && !timedOut,
      diagnostics: [],
      stdout: stdout.slice(0, 20_000),
      stderr: (proc.stderr ?? "").slice(0, 20_000),
      cases,
      timedOut,
      durationMs: Date.now() - started,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Python execution path ─────────────────────────────────────────────────
// Mirrors the TS runner: a prelude defines __check/__checkSet/__results, the
// candidate's code and the question's Python harness run, and results are
// emitted on a marker line. No static typecheck (Python is dynamic) — syntax
// and runtime errors surface via stderr with line numbers mapped to the
// candidate's own code.

const PY_PRELUDE = `import json
__results = []
def __fmt(v):
    try:
        return json.dumps(v, default=str)
    except Exception:
        return str(v)
def __check(name, got, want):
    if got == want:
        __results.append({"name": name, "pass": True})
    else:
        __results.append({"name": name, "pass": False, "detail": "expected " + __fmt(want) + ", got " + __fmt(got)})
def __checkSet(name, got, want):
    g = sorted(list(got), key=lambda x: str(x))
    w = sorted(list(want), key=lambda x: str(x))
    __check(name, g, w)
`;

const PY_EPILOGUE = `
def __arena_run():
    fn = globals().get("__harness_main")
    if callable(fn):
        try:
            fn()
        except Exception:
            import traceback
            __results.append({"name": "harness crashed", "pass": False, "detail": traceback.format_exc()[-1200:]})
    print("__ARENA_RESULTS__" + json.dumps(__results))
__arena_run()
`;

function runPython(questionId: string, code: string): RunResult {
  const started = Date.now();
  const question = QUESTIONS.get(questionId);
  const harness = question?.harnessPy ?? "";
  const prefix = PY_PRELUDE + "\n";
  const full = prefix + code + "\n" + harness + "\n" + PY_EPILOGUE;
  const preludeLines = prefix.split("\n").length - 1; // file lines before candidate code
  const codeLines = code.split("\n").length;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-py-"));
  const file = path.join(dir, "candidate.py");
  fs.writeFileSync(file, full);
  try {
    const proc = spawnSync("python3", [file], {
      timeout: 10_000,
      encoding: "utf8",
      cwd: dir,
      env: { PATH: process.env.PATH ?? "" }, // no secrets leak into candidate code
      maxBuffer: 4 * 1024 * 1024,
    });
    const timedOut = proc.error != null && (proc.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
    const missingPython = proc.error != null && (proc.error as NodeJS.ErrnoException).code === "ENOENT";
    if (missingPython) {
      return {
        ok: false, diagnostics: ["python3 was not found on PATH — install Python 3 to run the Python harness"],
        stdout: "", stderr: "", cases: [], timedOut: false, durationMs: Date.now() - started,
      };
    }
    let stdout = proc.stdout ?? "";
    let cases: CaseResult[] = [];
    const marker = stdout.lastIndexOf("__ARENA_RESULTS__");
    if (marker >= 0) {
      const line = stdout.slice(marker + "__ARENA_RESULTS__".length);
      stdout = stdout.slice(0, marker);
      try {
        cases = JSON.parse(line.split("\n")[0]) as CaseResult[];
      } catch {
        /* corrupted marker line; leave cases empty */
      }
    }
    const crashed = proc.status !== 0 && !timedOut;
    return {
      ok: !crashed && !timedOut,
      diagnostics: [],
      stdout: stdout.slice(0, 20_000),
      stderr: cleanPyTrace(proc.stderr ?? "", file, preludeLines, codeLines).slice(0, 20_000),
      cases,
      timedOut,
      durationMs: Date.now() - started,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Rewrites Python traceback file/line refs to the candidate's own line numbers. */
function cleanPyTrace(err: string, file: string, preludeLines: number, codeLines: number): string {
  if (!err) return "";
  const base = file.split("/").pop() ?? file; // candidate.py — matches the /private-prefixed path too
  return err
    .split("\n")
    .map((l) => {
      const m = l.match(/File "(.*?)", line (\d+)/);
      if (m && m[1].endsWith(base)) {
        const mapped = Number(m[2]) - preludeLines;
        const loc = mapped >= 1 && mapped <= codeLines ? `line ${mapped}` : `line (test harness)`;
        return l.replace(/File ".*?", line \d+/, `File "your code", ${loc}`);
      }
      return l;
    })
    .join("\n")
    .trim();
}

/** Strips sandbox paths and node-internal frames out of a stack trace. */
function cleanTrace(detail: string, sandboxFile: string): string {
  // Match by basename so the /private symlink prefix macOS adds to stack traces
  // (/var/.../candidate.cjs vs /private/var/.../candidate.cjs) is fully stripped.
  const base = (sandboxFile.split("/").pop() ?? "candidate.cjs").replace(/[.]/g, "\\.");
  const pathRe = new RegExp("[^\\s():]*" + base, "g");
  return detail
    .split("\n")
    .filter((l) => !l.includes("node:internal"))
    .map((l) => l.replace(pathRe, "your code"))
    .slice(0, 6)
    .join("\n")
    .trim();
}

function typecheck(source: string, preambleLines: number, codeLines: number): string[] {
  const fileName = "candidate.ts";
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    lib: ["lib.es2022.d.ts"],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const origGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, langVersion, ...rest) => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, langVersion, true);
    }
    return origGetSourceFile(name, langVersion, ...rest);
  };
  host.writeFile = () => undefined;
  const program = ts.createProgram([fileName], options, host);
  const all = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ].filter((d) => d.file?.fileName === fileName);
  return all.map((d) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file && d.start != null) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      const yourLine = line + 1 - preambleLines;
      if (yourLine < 1 || yourLine > codeLines) {
        // The error surfaced inside the test harness — almost always caused by
        // the candidate's signature not matching what the tests call.
        return `in the test harness — ${msg} (TS${d.code}) — usually means your function signature doesn't match the one the question specifies`;
      }
      return `line ${yourLine}:${character + 1} — ${msg} (TS${d.code})`;
    }
    return `${msg} (TS${d.code})`;
  });
}
