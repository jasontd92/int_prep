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

export function runCode(questionId: string, code: string): RunResult {
  const started = Date.now();
  const question = QUESTIONS.get(questionId);
  const harness = question?.harness ?? "";
  const full = PREAMBLE + "\n" + code + "\n" + PRELUDE + "\n" + harness + "\n" + EPILOGUE;

  // Line numbers are reported against the candidate's own code, so map the
  // compiler's lines back by subtracting the preamble and flagging anything
  // that lands past the end of their code as harness-internal.
  const preambleLines = PREAMBLE.split("\n").length;
  const codeLines = code.split("\n").length;

  // 1. Typecheck with the real compiler.
  const diagnostics = typecheck(full, preambleLines, codeLines);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics, stdout: "", stderr: "", cases: [], timedOut: false, durationMs: Date.now() - started };
  }

  // 2. Transpile and execute in a child process.
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

/** Strips sandbox paths and node-internal frames out of a stack trace. */
function cleanTrace(detail: string, sandboxFile: string): string {
  return detail
    .split("\n")
    .filter((l) => !l.includes("node:internal"))
    .map((l) => l.replaceAll(sandboxFile, "your code"))
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
