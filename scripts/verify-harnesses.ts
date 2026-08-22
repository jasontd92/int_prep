// Verifies every coding question's harness by running a reference solution
// through the real compile+execute pipeline. Run: npx tsx scripts/verify-harnesses.ts
// This is a self-test of the arena, not part of the interview experience.

import { runCode } from "../server/runner";
import { QUESTIONS } from "../server/questions";

const SOLUTIONS: Record<string, string> = {
  "cursor-merkle-diff": `
function hashString(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

interface MerkleNode {
  hash: string;
  isFile: boolean;
  children: Map<string, MerkleNode>;
}

function buildTree(snapshot: Record<string, string>): MerkleNode {
  const root: MerkleNode = { hash: "", isFile: false, children: new Map() };
  for (const [p, content] of Object.entries(snapshot)) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      let child = node.children.get(parts[i]);
      if (!child) {
        child = { hash: "", isFile: isLast, children: new Map() };
        node.children.set(parts[i], child);
      }
      if (isLast) child.hash = hashString(content);
      node = child;
    }
  }
  const compute = (n: MerkleNode): string => {
    if (n.isFile) return n.hash;
    const names = [...n.children.keys()].sort();
    n.hash = hashString(names.map((k) => k + ":" + compute(n.children.get(k)!)).join("|"));
    return n.hash;
  };
  compute(root);
  return root;
}

function collect(n: MerkleNode, prefix: string, out: string[]): void {
  if (n.isFile) { out.push(prefix); return; }
  for (const [name, child] of n.children) collect(child, prefix ? prefix + "/" + name : name, out);
}

function diffSnapshots(before: Record<string, string>, after: Record<string, string>) {
  const added: string[] = [], removed: string[] = [], changed: string[] = [];
  const walk = (a: MerkleNode | undefined, b: MerkleNode | undefined, prefix: string): void => {
    if (a && b && a.hash === b.hash) return; // prune: identical subtree
    if (!a && b) { collect(b, prefix, added); return; }
    if (a && !b) { collect(a, prefix, removed); return; }
    if (!a || !b) return;
    if (a.isFile && b.isFile) { changed.push(prefix); return; }
    if (a.isFile !== b.isFile) { collect(a, prefix, removed); collect(b, prefix, added); return; }
    const names = new Set([...a.children.keys(), ...b.children.keys()]);
    for (const name of names) {
      walk(a.children.get(name), b.children.get(name), prefix ? prefix + "/" + name : name);
    }
  };
  walk(buildTree(before), buildTree(after), "");
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
`,

  "cursor-text-buffer": `
class TextBuffer {
  private text: string;
  constructor(text: string) { this.text = text; }
  insert(pos: number, text: string): void {
    this.text = this.text.slice(0, pos) + text + this.text.slice(pos);
  }
  delete(pos: number, len: number): void {
    this.text = this.text.slice(0, pos) + this.text.slice(pos + len);
  }
  getText(): string { return this.text; }
  lineCount(): number { return this.text.split("\\n").length; }
  getLine(line: number): string { return this.text.split("\\n")[line] ?? ""; }
}
`,

  "openai-rate-limiter": `
class TokenBucket {
  private tokens: number;
  private lastMs: number;
  private capacity: number;
  private rate: number;
  constructor(capacity: number, refillPerSec: number) {
    this.capacity = capacity;
    this.rate = refillPerSec;
    this.tokens = capacity;
    this.lastMs = 0;
  }
  tryRemove(n: number, nowMs: number): boolean {
    const elapsed = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    if (this.tokens + 1e-9 >= n) { this.tokens -= n; return true; }
    return false;
  }
}
`,

  "openai-retry-backoff": `
interface RetryOptions {
  retries: number;
  baseMs: number;
  sleep: (ms: number) => Promise<void>;
  shouldRetry?: (err: unknown) => boolean;
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (opts.shouldRetry && !opts.shouldRetry(e)) throw e;
      if (attempt === opts.retries) break;
      await opts.sleep(opts.baseMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}
`,

  "openai-usage-aggregation": `
interface UsageEvent { team: string; model: string; inputTokens: number; outputTokens: number; }

function costReport(
  events: UsageEvent[],
  pricing: Record<string, { inputPerM: number; outputPerM: number }>
) {
  const raw = new Map<string, number>();
  const unknown = new Set<string>();
  for (const e of events) {
    if (!raw.has(e.team)) raw.set(e.team, 0);
    const p = pricing[e.model];
    if (!p) { unknown.add(e.model); continue; }
    const cost = (e.inputTokens / 1e6) * p.inputPerM + (e.outputTokens / 1e6) * p.outputPerM;
    raw.set(e.team, raw.get(e.team)! + cost);
  }
  const byTeam: Record<string, number> = {};
  let topTeam: string | null = null;
  let best = -1;
  for (const team of [...raw.keys()].sort()) {
    const v = Math.round(raw.get(team)! * 100) / 100;
    byTeam[team] = v;
    if (raw.get(team)! > best) { best = raw.get(team)!; topTeam = team; }
  }
  return { byTeam, topTeam, unknownModels: [...unknown].sort() };
}
`,

  "dsa-two-sum": `
function twoSum(nums: number[], target: number): [number, number] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need)!, i];
    seen.set(nums[i], i);
  }
  throw new Error("no solution");
}
`,

  "dsa-valid-parentheses": `
function isValid(s: string): boolean {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (pairs[ch]) { if (stack.pop() !== pairs[ch]) return false; }
  }
  return stack.length === 0;
}
`,

  "dsa-merge-intervals": `
function merge(intervals: number[][]): number[][] {
  if (intervals.length === 0) return [];
  const sorted = intervals.map((i) => [...i]).sort((a, b) => a[0] - b[0]);
  const out: number[][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = out[out.length - 1];
    if (sorted[i][0] <= cur[1]) cur[1] = Math.max(cur[1], sorted[i][1]);
    else out.push(sorted[i]);
  }
  return out;
}
`,

  "dsa-lru-cache": `
class LRUCache {
  private cap: number;
  private map = new Map<number, number>();
  constructor(capacity: number) { this.cap = capacity; }
  get(key: number): number {
    if (!this.map.has(key)) return -1;
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  put(key: number, value: number): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.cap) {
      this.map.delete(this.map.keys().next().value as number);
    }
  }
}
`,

  "dsa-binary-search-range": `
function searchRange(nums: number[], target: number): [number, number] {
  const lowerBound = (t: number): number => {
    let lo = 0, hi = nums.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nums[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const first = lowerBound(target);
  if (first === nums.length || nums[first] !== target) return [-1, -1];
  return [first, lowerBound(target + 1) - 1];
}
`,

  "dsa-longest-substring": `
function lengthOfLongestSubstring(s: string): number {
  const last = new Map<string, number>();
  let best = 0, left = 0;
  for (let i = 0; i < s.length; i++) {
    const prev = last.get(s[i]);
    if (prev !== undefined && prev >= left) left = prev + 1;
    last.set(s[i], i);
    best = Math.max(best, i - left + 1);
  }
  return best;
}
`,

  "dsa-reverse-linked-list": `
class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val: number, next: ListNode | null = null) { this.val = val; this.next = next; }
}

function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  let cur = head;
  while (cur) {
    const next: ListNode | null = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
  }
  return prev;
}
`,

  "dsa-number-of-islands": `
function numIslands(grid: string[][]): number {
  if (grid.length === 0) return 0;
  const rows = grid.length, cols = grid[0].length;
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== "1") continue;
      count++;
      const stack: [number, number][] = [[r, c]];
      grid[r][c] = "0";
      while (stack.length) {
        const [y, x] = stack.pop()!;
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === "1") {
            grid[ny][nx] = "0";
            stack.push([ny, nx]);
          }
        }
      }
    }
  }
  return count;
}
`,

  "dsa-top-k-frequent": `
function topKFrequent(nums: number[], k: number): number[] {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  const buckets: number[][] = Array.from({ length: nums.length + 1 }, () => []);
  for (const [v, c] of counts) buckets[c].push(v);
  const out: number[] = [];
  for (let c = buckets.length - 1; c >= 0 && out.length < k; c--) {
    for (const v of buckets[c]) {
      if (out.length < k) out.push(v);
    }
  }
  return out;
}
`,

  "dsa-course-schedule": `
function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  const adj: number[][] = Array.from({ length: numCourses }, () => []);
  const indeg = new Array(numCourses).fill(0);
  for (const [a, b] of prerequisites) { adj[b].push(a); indeg[a]++; }
  const queue: number[] = [];
  for (let i = 0; i < numCourses; i++) if (indeg[i] === 0) queue.push(i);
  let done = 0;
  while (queue.length) {
    const n = queue.shift()!;
    done++;
    for (const next of adj[n]) if (--indeg[next] === 0) queue.push(next);
  }
  return done === numCourses;
}
`,
};

let failures = 0;
let checked = 0;

for (const [id, q] of QUESTIONS) {
  if (!q.harness) continue; // design/scenario questions have no tests
  checked++;
  const solution = SOLUTIONS[id];
  if (!solution) {
    console.log(`\x1b[31m✗ ${id}: NO REFERENCE SOLUTION\x1b[0m`);
    failures++;
    continue;
  }
  const r = runCode(id, solution);
  if (r.diagnostics.length) {
    console.log(`\x1b[31m✗ ${id}: compile errors\x1b[0m`);
    for (const d of r.diagnostics) console.log("    " + d);
    failures++;
    continue;
  }
  const failed = r.cases.filter((c) => !c.pass);
  if (failed.length || r.cases.length === 0 || r.timedOut) {
    console.log(`\x1b[31m✗ ${id}: ${failed.length} failing / ${r.cases.length} cases${r.timedOut ? " TIMED OUT" : ""}\x1b[0m`);
    for (const c of failed) console.log(`    ${c.name} — ${c.detail}`);
    if (r.stderr) console.log("    stderr: " + r.stderr.slice(0, 300));
    failures++;
  } else {
    console.log(`\x1b[32m✓ ${id}: ${r.cases.length} cases pass (${r.durationMs}ms)\x1b[0m`);
  }
}

// Also assert that starter code (unimplemented) FAILS — a harness that passes
// on empty starter code isn't testing anything.
console.log("\n-- starter code should not pass --");
for (const [id, q] of QUESTIONS) {
  if (!q.harness) continue;
  const r = runCode(id, q.starterCode);
  const passedAll = r.cases.length > 0 && r.cases.every((c) => c.pass);
  if (passedAll) {
    console.log(`\x1b[31m✗ ${id}: starter code passes all tests (harness is vacuous)\x1b[0m`);
    failures++;
  }
}

console.log(`\n${checked - failures}/${checked} harnesses verified.`);
process.exit(failures > 0 ? 1 : 0);
