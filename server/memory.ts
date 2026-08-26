// Persistent "memory" cache for the portfolio-defense track. Each researched
// feature is written to a sibling directory (default ~/.interview-arena/memory)
// as one markdown file per feature, grouped by repo:
//
//   <memoryDir>/<repo-name>/<feature-slug>.md
//   <memoryDir>/<repo-name>/_platform.md   (reserved for platform-level notes)
//
// The file body is the agent's technical writeup (cheap references and
// pointers). The frontmatter turns it into a real cache: it records the repo
// HEAD sha and the git blob sha of each key file, so a repeat question can
// decide in one `git` call whether the writeup is still fresh or needs
// re-researching — and only re-researches when files backing THIS feature moved.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TTL_MS = 14 * 24 * 60 * 60 * 1000; // non-git fallback: 14 days

export interface MemoryMeta {
  repo: string;
  slug: string;
  feature: string;
  git_sha: string; // "" when the repo isn't a git repo
  researched_at: string;
  key_files: Record<string, string>; // repo-relative path -> blob sha
}

export interface MemoryFile {
  meta: MemoryMeta;
  body: string;
}

export type Freshness = "fresh" | "stale";

export function memoryDir(): string {
  return (
    process.env.ARENA_MEMORY_DIR ||
    path.join(os.homedir(), ".interview-arena", "memory")
  );
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "feature"
  );
}

export function repoName(repoPath: string): string {
  return path.basename(path.resolve(repoPath)) || "repo";
}

function featureFile(repoPath: string, slug: string): string {
  return path.join(memoryDir(), repoName(repoPath), `${slug}.md`);
}

// ── git helpers (all read-only; every call is guarded) ───────────────────────

function gitRaw(repoPath: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

// Trimmed — for single-value output (shas, booleans). NOT for porcelain, whose
// leading status-column space is significant and must not be trimmed away.
function git(repoPath: string, args: string[]): string | null {
  const out = gitRaw(repoPath, args);
  return out === null ? null : out.trim();
}

export function isGitRepo(repoPath: string): boolean {
  return git(repoPath, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

export function headSha(repoPath: string): string {
  return git(repoPath, ["rev-parse", "HEAD"]) ?? "";
}

/** Blob sha of a path at HEAD, or "" if the path isn't tracked. */
export function blobSha(repoPath: string, relPath: string): string {
  return git(repoPath, ["rev-parse", `HEAD:${relPath}`]) ?? "";
}

function changedSince(repoPath: string, fromSha: string): Set<string> {
  const out = git(repoPath, ["diff", "--name-only", `${fromSha}`, "HEAD"]);
  const set = new Set<string>();
  if (out) for (const l of out.split("\n")) if (l.trim()) set.add(l.trim());
  return set;
}

function dirtyFiles(repoPath: string): Set<string> {
  const out = gitRaw(repoPath, ["status", "--porcelain"]); // raw: leading space is significant
  const set = new Set<string>();
  if (out) {
    for (const line of out.split("\n")) {
      if (line.length < 4) continue;
      const p = line.slice(3).trim(); // porcelain: 2 status cols + space, then path
      if (p) set.add(p.includes(" -> ") ? p.split(" -> ")[1] : p); // rename: keep new path
    }
  }
  return set;
}

// ── freshness (the cache invalidation heart) ─────────────────────────────────

export function freshness(repoPath: string, meta: MemoryMeta): Freshness {
  if (!isGitRepo(repoPath) || !meta.git_sha) {
    const age = Date.now() - Date.parse(meta.researched_at || "");
    return Number.isFinite(age) && age < TTL_MS ? "fresh" : "stale";
  }
  const keyPaths = Object.keys(meta.key_files);
  const dirty = dirtyFiles(repoPath);
  const cur = headSha(repoPath);

  // A key file with uncommitted edits is always stale, sha or not.
  if (keyPaths.some((p) => dirty.has(p))) return "stale";

  if (cur === meta.git_sha) return "fresh";

  // HEAD moved: stale only if a file backing THIS feature changed.
  const changed = changedSince(repoPath, meta.git_sha);
  return keyPaths.some((p) => changed.has(p)) ? "stale" : "fresh";
}

// ── read / write ─────────────────────────────────────────────────────────────

export function readMemory(repoPath: string, slug: string): MemoryFile | null {
  const file = featureFile(repoPath, slug);
  if (!fs.existsSync(file)) return null;
  try {
    return parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Writes/overwrites a feature's memory file, computing the frontmatter from the
 * key file paths the agent reported. Paths that don't resolve at HEAD are
 * dropped, so the cache is grounded in files that actually exist.
 */
export function writeMemory(
  repoPath: string,
  slug: string,
  feature: string,
  body: string,
  keyFilePaths: string[]
): MemoryFile {
  const isGit = isGitRepo(repoPath);
  const key_files: Record<string, string> = {};
  for (const raw of keyFilePaths) {
    const rel = raw.trim().replace(/^\.\//, "");
    if (!rel || key_files[rel] !== undefined) continue;
    const sha = isGit ? blobSha(repoPath, rel) : "";
    if (isGit && !sha) continue; // path not tracked at HEAD — likely hallucinated
    key_files[rel] = sha || "untracked";
  }
  const meta: MemoryMeta = {
    repo: repoName(repoPath),
    slug,
    feature,
    git_sha: isGit ? headSha(repoPath) : "",
    researched_at: new Date().toISOString(),
    key_files,
  };
  const file = featureFile(repoPath, slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serialize(meta, body));
  return { meta, body };
}

export function memoryPath(repoPath: string, slug: string): string {
  return featureFile(repoPath, slug);
}

// ── frontmatter (minimal, dependency-free) ───────────────────────────────────

function serialize(meta: MemoryMeta, body: string): string {
  const lines = [
    "---",
    `repo: ${meta.repo}`,
    `slug: ${meta.slug}`,
    `feature: ${meta.feature}`,
    `git_sha: ${meta.git_sha}`,
    `researched_at: ${meta.researched_at}`,
    "key_files:",
    ...Object.entries(meta.key_files).map(([p, s]) => `  ${p}: ${s}`),
    "---",
    "",
    body.trim(),
    "",
  ];
  return lines.join("\n");
}

function parse(text: string): MemoryFile {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: emptyMeta(), body: text };
  const [, front, body] = m;
  const meta = emptyMeta();
  let inKeyFiles = false;
  for (const line of front.split("\n")) {
    if (line.startsWith("  ") && inKeyFiles) {
      const idx = line.indexOf(":");
      if (idx > 0) meta.key_files[line.slice(2, idx).trim()] = line.slice(idx + 1).trim();
      continue;
    }
    inKeyFiles = false;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === "key_files") inKeyFiles = true;
    else if (key === "repo") meta.repo = val;
    else if (key === "slug") meta.slug = val;
    else if (key === "feature") meta.feature = val;
    else if (key === "git_sha") meta.git_sha = val;
    else if (key === "researched_at") meta.researched_at = val;
  }
  return { meta, body: body.trim() };
}

function emptyMeta(): MemoryMeta {
  return { repo: "", slug: "", feature: "", git_sha: "", researched_at: "", key_files: {} };
}
