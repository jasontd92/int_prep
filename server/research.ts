// The research agent — the "B" side of the A/B. It runs `claude -p` in
// headless mode with the target repo as its working directory and a READ-ONLY
// tool set, so it explores the actual code and produces a ground-truth writeup
// of a feature. Results are cached via server/memory.ts; a repeat question on
// an unchanged feature never re-runs the agent.
//
// Unlike the interviewer bridge, research MUST have repo + tool access, so it
// is CLI-only (the SDK path has no filesystem tools). If `claude` isn't
// installed, research is unavailable and the caller surfaces that.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import {
  readMemory,
  writeMemory,
  freshness,
  slugify,
  memoryPath,
  type MemoryFile,
} from "./memory";

const MODEL = process.env.ARENA_MODEL || "claude-opus-5";
// Read-only exploration tools. Anything not listed is denied (non-interactively),
// so the agent cannot modify the repo it's documenting.
const READONLY_TOOLS = "Read,Grep,Glob,LS";

export type ResearchStatus = "hit" | "refreshed" | "created" | "error";

export interface ResearchResult {
  status: ResearchStatus;
  slug: string;
  groundTruth: string; // markdown body; empty on error
  savedTo: string;
  error?: string;
}

/**
 * Returns ground truth for a feature, cache-first. On a fresh cache hit it
 * returns immediately with no agent call; otherwise it researches the repo and
 * writes/updates the memory file.
 */
export async function researchFeature(
  repoPath: string,
  featureName: string,
  opts: { force?: boolean } = {}
): Promise<ResearchResult> {
  const slug = slugify(featureName);
  const saved = memoryPath(repoPath, slug);
  const existing = readMemory(repoPath, slug);

  if (existing && !opts.force && freshness(repoPath, existing.meta) === "fresh") {
    return { status: "hit", slug, groundTruth: existing.body, savedTo: saved };
  }

  try {
    const raw = await callResearchAgent(repoPath, buildResearchPrompt(featureName, existing));
    const body = cleanBody(raw);
    const keyFiles = extractKeyFiles(body);
    writeMemory(repoPath, slug, featureName, body, keyFiles);
    return {
      status: existing ? "refreshed" : "created",
      slug,
      groundTruth: body,
      savedTo: saved,
    };
  } catch (e) {
    // A stale-but-present cache still beats nothing — fall back to it.
    if (existing) {
      return {
        status: "hit",
        slug,
        groundTruth: existing.body,
        savedTo: saved,
        error: `research failed, served stale cache: ${errMsg(e)}`,
      };
    }
    return { status: "error", slug, groundTruth: "", savedTo: saved, error: errMsg(e) };
  }
}

function buildResearchPrompt(featureName: string, prior: MemoryFile | null): string {
  const warmStart = prior
    ? `\n\nA PREVIOUS version of this document is below, but the code has since changed. Update it, re-verifying every claim against the CURRENT files. Keep what's still accurate; correct what drifted.\n\n<previous>\n${prior.body}\n</previous>\n`
    : "";
  return `You are a staff engineer documenting one feature of THIS codebase (the current working directory) for a technical design review. Another engineer will verbally defend this feature from memory, and your document is the ground truth their account gets checked against — so be precise and cite real files.

FEATURE TO DOCUMENT: "${featureName}"

Use Grep, Glob, and Read to locate and read the code that implements this feature. Read enough to be specific. Do NOT modify anything.

Output ONLY a markdown document in EXACTLY this structure, nothing before or after:

## Summary
2-4 short paragraphs on what this feature is and how it actually works in THIS repo.

## Key files
A bullet list, one file per line, formatted \`path/to/file.ext:LINE — one-line role\`. Use real repo-relative paths you actually read. 4-12 files. This section is parsed programmatically, so keep each line's leading token a real path.

## Docs / references
Bullet pointers to READMEs, comments, or docs that describe it — or "none found".

## Architecture & tradeoffs
The real design decisions this code embodies: data structures, control flow, failure handling, concurrency, what it optimized for and what it sacrificed, and the alternatives it implicitly rejected. Cite files. This is what a candidate's verbal defense is graded against — be concrete.

Rules: base every claim on files you actually read; if the feature isn't clearly present, say so plainly in Summary. Keep the whole document under ~700 words.${warmStart}`;
}

// ── parsing the agent's output ───────────────────────────────────────────────

/** Strips any stray prose/code fences and keeps from the first "## " heading. */
function cleanBody(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(s);
  if (fence) s = fence[1].trim();
  const firstHeading = s.indexOf("## ");
  if (firstHeading > 0) s = s.slice(firstHeading);
  return s.trim();
}

/** Pulls repo-relative paths out of the "## Key files" section. */
function extractKeyFiles(body: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => /^##\s+key files/i.test(l.trim()));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line.trim())) break; // next section
    // Match a leading list item then a path-ish token up to ':' or whitespace.
    const m = /^\s*[-*]\s*`?([A-Za-z0-9._/-]+\.[A-Za-z0-9]+)/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

// ── the CLI bridge (read-only, repo cwd) ─────────────────────────────────────

function callResearchAgent(repoPath: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
      reject(new Error(`repo path not found: ${repoPath}`));
      return;
    }
    const proc = spawn(
      "claude",
      ["-p", "--model", MODEL, "--output-format", "text", "--allowedTools", READONLY_TOOLS],
      {
        cwd: repoPath, // the agent explores the real repo from here
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 300_000, // research reads many files; allow more time
      }
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) =>
      reject(new Error(`claude CLI unavailable (research needs it): ${e.message}`))
    );
    proc.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`claude CLI exit ${code}: ${err.slice(0, 400) || "empty output"}`));
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
