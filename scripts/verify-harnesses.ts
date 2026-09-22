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

  // ── Redo track ──
  "redo-othello": `
type Player = "B" | "W";
type Cell = Player | ".";
type Board = Cell[][];
const N = 8;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];
function opponent(p: Player): Player { return p === "B" ? "W" : "B"; }
function inBounds(r: number, c: number): boolean { return r >= 0 && r < N && c >= 0 && c < N; }
function initialBoard(): Board {
  const b: Board = Array.from({ length: N }, () => Array<Cell>(N).fill("."));
  b[3][3] = "W"; b[3][4] = "B"; b[4][3] = "B"; b[4][4] = "W";
  return b;
}
function flipsInDir(board: Board, player: Player, r: number, c: number, dr: number, dc: number): Array<[number, number]> {
  const opp = opponent(player);
  const out: Array<[number, number]> = [];
  let nr = r + dr, nc = c + dc;
  while (inBounds(nr, nc) && board[nr][nc] === opp) { out.push([nr, nc]); nr += dr; nc += dc; }
  if (out.length > 0 && inBounds(nr, nc) && board[nr][nc] === player) return out;
  return [];
}
function legalMoves(board: Board, player: Player): Array<[number, number]> {
  const moves: Array<[number, number]> = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c] !== ".") continue;
    for (const [dr, dc] of DIRS) {
      if (flipsInDir(board, player, r, c, dr, dc).length > 0) { moves.push([r, c]); break; }
    }
  }
  return moves;
}
function applyMove(board: Board, player: Player, r: number, c: number): Board {
  const nb: Board = board.map((row) => row.slice());
  nb[r][c] = player;
  for (const [dr, dc] of DIRS) for (const [fr, fc] of flipsInDir(board, player, r, c, dr, dc)) nb[fr][fc] = player;
  return nb;
}
function isGameOver(board: Board): boolean {
  return legalMoves(board, "B").length === 0 && legalMoves(board, "W").length === 0;
}
function score(board: Board): { B: number; W: number } {
  let B = 0, W = 0;
  for (const row of board) for (const cell of row) { if (cell === "B") B++; else if (cell === "W") W++; }
  return { B, W };
}
`,

  "redo-build-tree": `
interface TreeNode { val: number; left: TreeNode | null; right: TreeNode | null; }
function buildTree(preorder: number[], inorder: number[]): TreeNode | null {
  const idx = new Map<number, number>();
  inorder.forEach((v, i) => idx.set(v, i));
  let pre = 0;
  const build = (lo: number, hi: number): TreeNode | null => {
    if (lo > hi) return null;
    const val = preorder[pre++];
    const mid = idx.get(val)!;
    const node: TreeNode = { val, left: null, right: null };
    node.left = build(lo, mid - 1);
    node.right = build(mid + 1, hi);
    return node;
  };
  return build(0, inorder.length - 1);
}
`,

  "redo-increasing-paths": `
function countPaths(grid: number[][]): number {
  const MOD = 1_000_000_007;
  const m = grid.length, n = grid[0].length;
  const memo: number[][] = Array.from({ length: m }, () => Array<number>(n).fill(-1));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dfs = (r: number, c: number): number => {
    if (memo[r][c] !== -1) return memo[r][c];
    let total = 1;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < m && nc >= 0 && nc < n && grid[nr][nc] > grid[r][c]) total = (total + dfs(nr, nc)) % MOD;
    }
    memo[r][c] = total;
    return total;
  };
  let ans = 0;
  for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) ans = (ans + dfs(r, c)) % MOD;
  return ans;
}
`,

  "redo-bishop-bfs": `
function minBishopMoves(start: number, target: number): number {
  if (start === target) return 0;
  const dist = new Array(64).fill(-1);
  dist[start] = 0;
  const q: number[] = [start];
  const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  while (q.length) {
    const cur = q.shift()!;
    const r = Math.floor(cur / 8), c = cur % 8;
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const ni = nr * 8 + nc;
        if (dist[ni] === -1) {
          dist[ni] = dist[cur] + 1;
          if (ni === target) return dist[ni];
          q.push(ni);
        }
        nr += dr; nc += dc;
      }
    }
  }
  return dist[target];
}
`,

  // ── Backend (stateful, evolving) track ──
  "backend-cache-ttl-lru": `
class Cache {
  private store = new Map<string, { value: number; expiresAt: number | null }>();
  private maxSize: number;
  private now: () => number;
  private hits = 0;
  private misses = 0;
  constructor(options: { maxSize?: number; now?: () => number } = {}) {
    this.maxSize = options.maxSize ?? Infinity;
    this.now = options.now ?? (() => Date.now());
  }
  private isExpired(e: { expiresAt: number | null }): boolean {
    return e.expiresAt !== null && this.now() >= e.expiresAt;
  }
  private purge(): void {
    for (const [k, e] of this.store) if (this.isExpired(e)) this.store.delete(k);
  }
  set(key: string, value: number, ttlMs?: number): void {
    this.purge();
    if (this.store.has(key)) this.store.delete(key);
    const expiresAt = ttlMs != null ? this.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }
  get(key: string): number | undefined {
    const e = this.store.get(key);
    if (!e || this.isExpired(e)) {
      if (e) this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, e);
    this.hits++;
    return e.value;
  }
  has(key: string): boolean {
    const e = this.store.get(key);
    if (!e) return false;
    if (this.isExpired(e)) { this.store.delete(key); return false; }
    return true;
  }
  delete(key: string): boolean {
    return this.store.delete(key);
  }
  size(): number { this.purge(); return this.store.size; }
  keys(): string[] { this.purge(); return [...this.store.keys()]; }
  stats(): { hits: number; misses: number } { return { hits: this.hits, misses: this.misses }; }
}
`,

  "backend-rate-limiter": `
class RateLimiter {
  private limit: number;
  private windowMs: number;
  private log = new Map<string, number[]>();
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  private prune(key: string, nowMs: number): number[] {
    const arr = this.log.get(key) ?? [];
    const cutoff = nowMs - this.windowMs;
    let i = 0;
    while (i < arr.length && arr[i] <= cutoff) i++;
    const kept = i > 0 ? arr.slice(i) : arr;
    this.log.set(key, kept);
    return kept;
  }
  allow(key: string, nowMs: number): boolean {
    const arr = this.prune(key, nowMs);
    if (arr.length < this.limit) { arr.push(nowMs); return true; }
    return false;
  }
  remaining(key: string, nowMs: number): number {
    return Math.max(0, this.limit - this.prune(key, nowMs).length);
  }
  retryAfterMs(key: string, nowMs: number): number {
    const arr = this.prune(key, nowMs);
    if (arr.length < this.limit) return 0;
    return arr[0] + this.windowMs - nowMs;
  }
}
`,

  "backend-metrics-aggregator": `
interface Ev { ts: number; value: number; user: string | null; }
class MetricsStore {
  private events = new Map<string, Ev[]>();
  record(name: string, ts: number, value: number = 1, user?: string): void {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name)!.push({ ts, value, user: user ?? null });
  }
  private inWindow(name: string, start: number, end: number): Ev[] {
    return (this.events.get(name) ?? []).filter((e) => e.ts >= start && e.ts < end);
  }
  count(name: string, start: number, end: number): number {
    return this.inWindow(name, start, end).length;
  }
  sum(name: string, start: number, end: number): number {
    return this.inWindow(name, start, end).reduce((s, e) => s + e.value, 0);
  }
  average(name: string, start: number, end: number): number {
    const w = this.inWindow(name, start, end);
    if (w.length === 0) return 0;
    return w.reduce((s, e) => s + e.value, 0) / w.length;
  }
  uniqueUsers(name: string, start: number, end: number): number {
    const set = new Set<string>();
    for (const e of this.inWindow(name, start, end)) if (e.user !== null) set.add(e.user);
    return set.size;
  }
  topEvents(start: number, end: number, k: number): string[] {
    const counts: Array<[string, number]> = [];
    for (const name of this.events.keys()) {
      const c = this.count(name, start, end);
      if (c > 0) counts.push([name, c]);
    }
    counts.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
    return counts.slice(0, k).map((x) => x[0]);
  }
}
`,

  "backend-booking": `
interface Booking { id: string; resource: string; user: string; start: number; end: number; }
class BookingSystem {
  private capacity: number;
  private bookings = new Map<string, Booking>();
  private seq = 0;
  constructor(capacity: number = 1) { this.capacity = capacity; }
  private forResource(resource: string): Booking[] {
    return [...this.bookings.values()].filter((b) => b.resource === resource);
  }
  private maxConcurrency(resource: string, s: number, e: number): number {
    const pts: Array<[number, number]> = [];
    for (const b of this.forResource(resource)) {
      if (b.end <= s || b.start >= e) continue;
      pts.push([Math.max(b.start, s), 1]);
      pts.push([Math.min(b.end, e), -1]);
    }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, mx = 0;
    for (const [, d] of pts) { cur += d; if (cur > mx) mx = cur; }
    return mx;
  }
  isAvailable(resource: string, start: number, end: number): boolean {
    if (start >= end) return false;
    return this.maxConcurrency(resource, start, end) < this.capacity;
  }
  book(resource: string, user: string, start: number, end: number): string | null {
    if (!this.isAvailable(resource, start, end)) return null;
    const id = "b" + (++this.seq);
    this.bookings.set(id, { id, resource, user, start, end });
    return id;
  }
  cancel(id: string): boolean { return this.bookings.delete(id); }
  listByResource(resource: string): Array<{ id: string; user: string; start: number; end: number }> {
    return this.forResource(resource)
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
      .map((b) => ({ id: b.id, user: b.user, start: b.start, end: b.end }));
  }
  listByUser(user: string): string[] {
    return [...this.bookings.values()].filter((b) => b.user === user).map((b) => b.id);
  }
}
`,

  "backend-scheduler": `
interface Task { id: string; runAt: number; payload: string; priority: number; intervalMs: number | null; seq: number; }
class Scheduler {
  private tasks = new Map<string, Task>();
  private seq = 0;
  schedule(id: string, runAt: number, payload: string, priority: number = 0): void {
    this.tasks.set(id, { id, runAt, payload, priority, intervalMs: null, seq: this.seq++ });
  }
  scheduleRecurring(id: string, firstRunAt: number, intervalMs: number, payload: string): void {
    this.tasks.set(id, { id, runAt: firstRunAt, payload, priority: 0, intervalMs, seq: this.seq++ });
  }
  cancel(id: string): boolean { return this.tasks.delete(id); }
  pending(): number { return this.tasks.size; }
  getDue(now: number): string[] {
    const due = [...this.tasks.values()].filter((t) => t.runAt <= now);
    due.sort((a, b) => a.runAt - b.runAt || b.priority - a.priority || a.seq - b.seq);
    for (const t of due) {
      if (t.intervalMs !== null) {
        let next = t.runAt + t.intervalMs;
        while (next <= now) next += t.intervalMs;
        t.runAt = next;
      } else {
        this.tasks.delete(t.id);
      }
    }
    return due.map((t) => t.payload);
  }
}
`,

  "backend-session-store": `
interface Msg { role: string; content: string; tokens: number; }
class SessionStore {
  private sessions = new Map<string, { msgs: Msg[]; lastActive: number }>();
  private idleTtlMs: number;
  private now: () => number;
  constructor(options: { idleTtlMs?: number; now?: () => number } = {}) {
    this.idleTtlMs = options.idleTtlMs ?? Infinity;
    this.now = options.now ?? (() => Date.now());
  }
  private live(session: string): { msgs: Msg[]; lastActive: number } | undefined {
    const s = this.sessions.get(session);
    if (!s) return undefined;
    if (this.now() - s.lastActive >= this.idleTtlMs) { this.sessions.delete(session); return undefined; }
    return s;
  }
  addMessage(session: string, role: string, content: string, tokens: number): void {
    const existing = this.live(session);
    if (existing) {
      existing.msgs.push({ role, content, tokens });
      existing.lastActive = this.now();
    } else {
      this.sessions.set(session, { msgs: [{ role, content, tokens }], lastActive: this.now() });
    }
  }
  getHistory(session: string, maxTokens?: number): Msg[] {
    const s = this.live(session);
    if (!s) return [];
    if (maxTokens === undefined) return s.msgs.map((m) => ({ ...m }));
    const out: Msg[] = [];
    let total = 0;
    for (let i = s.msgs.length - 1; i >= 0; i--) {
      if (total + s.msgs[i].tokens > maxTokens) break;
      total += s.msgs[i].tokens;
      out.push({ ...s.msgs[i] });
    }
    out.reverse();
    return out;
  }
  tokenCount(session: string): number {
    const s = this.live(session);
    if (!s) return 0;
    return s.msgs.reduce((t, m) => t + m.tokens, 0);
  }
  clear(session: string): boolean { return this.sessions.delete(session); }
}
`,

  "backend-inmemory-db": `
class InMemoryDB {
  private store = new Map<string, Map<string, { value: string; expiresAt: number | null }>>();
  private now: () => number;
  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
  }
  private rec(key: string): Map<string, { value: string; expiresAt: number | null }> {
    let r = this.store.get(key);
    if (!r) { r = new Map(); this.store.set(key, r); }
    return r;
  }
  private isLive(e: { expiresAt: number | null }): boolean {
    return e.expiresAt === null || this.now() < e.expiresAt;
  }
  set(key: string, field: string, value: string): void {
    this.rec(key).set(field, { value, expiresAt: null });
  }
  setWithTtl(key: string, field: string, value: string, ttlMs: number): void {
    this.rec(key).set(field, { value, expiresAt: this.now() + ttlMs });
  }
  get(key: string, field: string): string | null {
    const e = this.store.get(key)?.get(field);
    return e && this.isLive(e) ? e.value : null;
  }
  delete(key: string, field: string): boolean {
    const r = this.store.get(key);
    const e = r?.get(field);
    if (!e || !this.isLive(e)) { if (e) r!.delete(field); return false; }
    r!.delete(field);
    return true;
  }
  private liveFields(key: string): Array<[string, string]> {
    const r = this.store.get(key);
    if (!r) return [];
    const out: Array<[string, string]> = [];
    for (const [f, e] of r) if (this.isLive(e)) out.push([f, e.value]);
    out.sort((a, b) => a[0].localeCompare(b[0]));
    return out;
  }
  scan(key: string): string[] {
    return this.liveFields(key).map(([f, v]) => f + "(" + v + ")");
  }
  scanByPrefix(key: string, prefix: string): string[] {
    return this.liveFields(key).filter(([f]) => f.startsWith(prefix)).map(([f, v]) => f + "(" + v + ")");
  }
  fieldCount(key: string): number {
    return this.liveFields(key).length;
  }
}
`,

  "backend-kv-transactions": `
class TransactionalStore {
  private data = new Map<string, string>();
  private counts = new Map<string, number>();
  private tx: Array<Array<{ key: string; prev: string | null }>> = [];
  private lowSet(key: string, value: string): void {
    const old = this.data.get(key);
    if (old !== undefined) this.counts.set(old, (this.counts.get(old) ?? 1) - 1);
    this.data.set(key, value);
    this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
  }
  private lowUnset(key: string): void {
    const old = this.data.get(key);
    if (old === undefined) return;
    this.counts.set(old, (this.counts.get(old) ?? 1) - 1);
    this.data.delete(key);
  }
  private record(key: string): void {
    if (this.tx.length === 0) return;
    const prev = this.data.has(key) ? this.data.get(key)! : null;
    this.tx[this.tx.length - 1].push({ key, prev });
  }
  set(key: string, value: string): void { this.record(key); this.lowSet(key, value); }
  unset(key: string): void { this.record(key); this.lowUnset(key); }
  get(key: string): string | null { return this.data.has(key) ? this.data.get(key)! : null; }
  count(value: string): number { return this.counts.get(value) ?? 0; }
  begin(): void { this.tx.push([]); }
  rollback(): boolean {
    const log = this.tx.pop();
    if (!log) return false;
    for (let i = log.length - 1; i >= 0; i--) {
      const { key, prev } = log[i];
      if (prev === null) this.lowUnset(key);
      else this.lowSet(key, prev);
    }
    return true;
  }
  commit(): boolean {
    if (this.tx.length === 0) return false;
    this.tx = [];
    return true;
  }
}
`,

  "backend-file-system": `
interface FsNode { isFile: boolean; content: string; children: Map<string, FsNode>; }
class FileSystem {
  private root: FsNode = { isFile: false, content: "", children: new Map() };
  private parts(path: string): string[] { return path.split("/").filter((p) => p.length > 0); }
  private walk(parts: string[]): FsNode | null {
    let node: FsNode = this.root;
    for (const p of parts) {
      const next = node.children.get(p);
      if (!next) return null;
      node = next;
    }
    return node;
  }
  private ensureDir(parts: string[]): FsNode {
    let node = this.root;
    for (const p of parts) {
      let next = node.children.get(p);
      if (!next) { next = { isFile: false, content: "", children: new Map() }; node.children.set(p, next); }
      node = next;
    }
    return node;
  }
  writeFile(path: string, content: string): void {
    const parts = this.parts(path);
    const name = parts.pop()!;
    const dir = this.ensureDir(parts);
    dir.children.set(name, { isFile: true, content, children: new Map() });
  }
  mkdir(path: string): void { this.ensureDir(this.parts(path)); }
  readFile(path: string): string | null {
    const node = this.walk(this.parts(path));
    return node && node.isFile ? node.content : null;
  }
  ls(path: string): string[] {
    const parts = this.parts(path);
    const node = this.walk(parts);
    if (!node) return [];
    if (node.isFile) return [parts[parts.length - 1]];
    return [...node.children.keys()].sort();
  }
  delete(path: string): boolean {
    const parts = this.parts(path);
    if (parts.length === 0) return false;
    const name = parts.pop()!;
    const parent = this.walk(parts);
    if (!parent || !parent.children.has(name)) return false;
    parent.children.delete(name);
    return true;
  }
  find(prefix: string): string[] {
    const out: string[] = [];
    const dfs = (node: FsNode, path: string): void => {
      if (node.isFile) { out.push(path); return; }
      for (const [name, child] of node.children) dfs(child, path + "/" + name);
    };
    dfs(this.root, "");
    return out.filter((p) => p.startsWith(prefix)).sort();
  }
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
