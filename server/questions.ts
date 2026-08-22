// Question bank for the interview arena.
// Cursor track sourced from ombharatiya/AI-Engineer-Interview-Questions
// (14-company-interview-questions/cursor-anysphere.md); OpenAI FDE and DSA
// tracks curated from public interview reports and classic question sets.

export type Track = "cursor" | "openai" | "dsa";
export type QuestionType = "coding" | "design" | "scenario";

export interface Question {
  id: string;
  track: Track;
  type: QuestionType;
  title: string;
  /** Suggested minutes for this question. */
  est: number;
  /** Markdown shown to the candidate. */
  prompt: string;
  /** Hidden notes for the interviewer agent: what good looks like, hint ladder. */
  interviewerNotes: string;
  starterCode: string;
  /**
   * Test harness body. Runs after the candidate's code in the same module.
   * Must define `async function __harnessMain(): Promise<void>` and use
   * __check(name, got, want) / __checkSet / __results (provided by the runner prelude).
   */
  harness?: string;
}

export interface TrackInfo {
  id: Track;
  name: string;
  blurb: string;
  /** Default question ids for a 60-minute / 2-question session. */
  defaultPick: string[];
}

export const TRACKS: TrackInfo[] = [
  {
    id: "cursor",
    name: "Cursor FDE / Product Engineer",
    blurb:
      "Practical editor-infra coding + AI-systems design, modeled on Cursor (Anysphere) interview reports. AI tools are allowed in real Cursor rounds — practice scoped queries in AI mode.",
    defaultPick: ["cursor-merkle-diff", "cursor-tab-design"],
  },
  {
    id: "openai",
    name: "OpenAI Forward Deployed Engineer",
    blurb:
      "Customer-embedded engineering: pragmatic coding, LLM platform design, and customer scenarios. Practice narrating trade-offs like you would with a customer's staff engineer in the room.",
    defaultPick: ["openai-rate-limiter", "openai-rag-design"],
  },
  {
    id: "dsa",
    name: "Classic Data Structures & Algorithms",
    blurb:
      "The canon: arrays, hashing, intervals, linked lists, BFS/DFS, heaps, binary search, caches. Best practiced in manual mode with full narration.",
    defaultPick: ["dsa-lru-cache", "dsa-merge-intervals"],
  },
];

const Q: Question[] = [
  // ────────────────────────── CURSOR TRACK ──────────────────────────
  {
    id: "cursor-merkle-diff",
    track: "cursor",
    type: "coding",
    title: "Merkle tree & snapshot diff detection",
    est: 30,
    prompt: `You're given two snapshots of a repository, each a map from file path (e.g. \`"src/app/main.ts"\`) to file content.

**Part 1.** Build a Merkle-style hash tree over a snapshot: each file hashes its content; each directory hashes the combined hashes of its children. Implement:

\`\`\`ts
function buildTree(snapshot: Record<string, string>): MerkleNode
\`\`\`

**Part 2.** Using the trees, implement:

\`\`\`ts
function diffSnapshots(
  before: Record<string, string>,
  after: Record<string, string>
): { added: string[]; removed: string[]; changed: string[] }
\`\`\`

Returned path arrays must be sorted. **Key requirement:** when a subtree's hash matches, you must skip descending into it — don't compare every file's content pairwise. Be ready to explain why this matters for a 100k-file monorepo synced on every keystroke.

A simple deterministic \`hashString\` is provided — treat it as a stand-in for SHA-256.`,
    interviewerNotes: `This is a real reported Cursor question. Strong candidates: (1) build a directory trie, compute child-sorted directory hashes bottom-up; (2) diff by walking both trees top-down, pruning equal-hash subtrees; (3) handle added/removed subtrees by enumerating them wholesale; (4) articulate why hash comparison at the root is O(1) for the unchanged case and cost is proportional to the changed region. Probe: hash collision assumptions; why sort children before hashing; how Cursor might use this for client/server index sync. Hint ladder: (a) "how would you know two whole directories are identical without reading files?" (b) "what determines a directory's hash?" (c) "when hashes differ, what do you recurse into?" Red flags: diffing by iterating all keys of both maps and comparing contents (works for tests but misses the point — probe them on it).`,
    starterCode: `// Provided: deterministic stand-in for a cryptographic hash.
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
  // your fields: children for directories, etc.
}

function buildTree(snapshot: Record<string, string>): MerkleNode {
  // TODO
  throw new Error("not implemented");
}

function diffSnapshots(
  before: Record<string, string>,
  after: Record<string, string>
): { added: string[]; removed: string[]; changed: string[] } {
  // TODO: use buildTree; prune subtrees whose hashes match.
  throw new Error("not implemented");
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const a = {
    "src/main.ts": "console.log('hi')",
    "src/util/x.ts": "export const x = 1;",
    "src/util/y.ts": "export const y = 2;",
    "README.md": "# hello",
  };
  const bSame = { ...a };
  __check("identical snapshots", diffSnapshots(a, bSame), { added: [], removed: [], changed: [] });

  const bChanged = { ...a, "src/util/x.ts": "export const x = 42;" };
  __check("one changed file", diffSnapshots(a, bChanged), { added: [], removed: [], changed: ["src/util/x.ts"] });

  const bAdded = { ...a, "src/new/dir/z.ts": "z", "top.ts": "t" };
  __check("added files", diffSnapshots(a, bAdded), { added: ["src/new/dir/z.ts", "top.ts"], removed: [], changed: [] });

  const bRemoved: Record<string, string> = { ...a };
  delete bRemoved["src/util/y.ts"];
  delete bRemoved["README.md"];
  __check("removed files", diffSnapshots(a, bRemoved), { added: [], removed: ["README.md", "src/util/y.ts"], changed: [] });

  const mixedAfter: Record<string, string> = { ...a, "src/main.ts": "changed", "docs/guide.md": "new" };
  delete mixedAfter["README.md"];
  __check("mixed diff", diffSnapshots(a, mixedAfter), {
    added: ["docs/guide.md"], removed: ["README.md"], changed: ["src/main.ts"],
  });

  const t1 = buildTree(a);
  const t2 = buildTree({ ...a });
  __check("tree hash deterministic", t1.hash, t2.hash);
  const t3 = buildTree({ ...a, "src/main.ts": "different" });
  __check("root hash changes on edit", t1.hash !== t3.hash, true);
}
`,
  },
  {
    id: "cursor-text-buffer",
    track: "cursor",
    type: "coding",
    title: "Text buffer for an editor",
    est: 30,
    prompt: `Design and implement the core text buffer for a code editor.

\`\`\`ts
class TextBuffer {
  constructor(text: string)
  insert(pos: number, text: string): void   // pos = absolute char offset
  delete(pos: number, len: number): void
  getText(): string
  lineCount(): number
  getLine(line: number): string             // 0-indexed, without trailing newline
}
\`\`\`

Correctness first — the tests only check behavior. But narrate the data-structure choice as if this buffer had to handle a 100MB file with fast random-position edits and fast line lookup: what would you use (array of lines? rope? piece table? gap buffer?) and what are the trade-offs? Your implementation may be the simple version; the discussion should cover the scalable one.`,
    interviewerNotes: `Reported Cursor question: implement the core + discuss the real data structure. A simple string or line-array implementation passes tests; what matters is (1) clean off-by-one handling around newlines and offsets, (2) an articulate comparison: naive string O(n) per edit; array-of-lines good line lookup but bad for huge single-line files and mid-line edits still O(line); gap buffer great for localized edits; rope/piece table O(log n) edits + used by real editors (VS Code = piece tree). Probe: how to map absolute offset -> (line, col) efficiently (prefix sums / tree with subtree char counts); what changes when edits come from both user and an AI agent concurrently. Hints: (a) "what operations dominate in an editor?" (b) "how would you avoid copying the whole document per keystroke?"`,
    starterCode: `class TextBuffer {
  constructor(text: string) {
    // TODO
  }
  insert(pos: number, text: string): void {
    // TODO
  }
  delete(pos: number, len: number): void {
    // TODO
  }
  getText(): string {
    // TODO
    return "";
  }
  lineCount(): number {
    // TODO
    return 0;
  }
  getLine(line: number): string {
    // TODO
    return "";
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const b = new TextBuffer("hello\\nworld");
  __check("initial text", b.getText(), "hello\\nworld");
  __check("initial lineCount", b.lineCount(), 2);
  __check("getLine 0", b.getLine(0), "hello");
  __check("getLine 1", b.getLine(1), "world");

  b.insert(5, ", brave");
  __check("insert mid-line", b.getText(), "hello, brave\\nworld");

  b.insert(b.getText().length, "!\\nbye");
  __check("insert at end with newline", b.getText(), "hello, brave\\nworld!\\nbye");
  __check("lineCount after insert", b.lineCount(), 3);
  __check("getLine 2", b.getLine(2), "bye");

  b.delete(5, 7); // remove ", brave"
  __check("delete mid", b.getText(), "hello\\nworld!\\nbye");

  b.delete(5, 1); // remove the newline -> joins lines
  __check("delete newline joins lines", b.getText(), "helloworld!\\nbye");
  __check("lineCount after join", b.lineCount(), 2);

  const empty = new TextBuffer("");
  __check("empty buffer text", empty.getText(), "");
  __check("empty buffer lines", empty.lineCount(), 1);
  empty.insert(0, "a\\nb\\nc");
  __check("insert into empty", empty.getText(), "a\\nb\\nc");
  __check("empty->3 lines", empty.lineCount(), 3);
}
`,
  },
  {
    id: "cursor-tab-design",
    track: "cursor",
    type: "design",
    title: "Design Cursor's Tab (next-edit prediction) system",
    est: 30,
    prompt: `Design the system behind Cursor's **Tab** — next-edit prediction that must feel instant (sub-100ms *perceived* latency) for millions of daily users.

Walk through the complete stack:
- What context is gathered on the client, and how is it kept cheap?
- Request path: debouncing, speculative requests, cancellation, caching.
- Model & serving: model size vs latency, where inference runs, KV-cache reuse, speculative decoding.
- How predictions are anchored to the buffer and invalidated as the user keeps typing.
- What you measure: acceptance rate, latency percentiles, and how you'd A/B a new model.

Use the editor to sketch interfaces, request/response shapes, and notes. Narrate out loud — this round is about your reasoning.`,
    interviewerNotes: `Reported Cursor system-design question. Strong answers cover: client-side context assembly (recent edits, cursor neighborhood, retrieved snippets) with tight token budget; perceived-latency tricks (fire on keystroke with debounce, cancel stale requests, cache last completion and reuse when prefix-compatible, stream first tokens); small specialized model, possibly on-GPU-fleet with continuous batching, prefix/KV cache keyed by document prefix; edit-anchoring (predictions tied to a buffer version, rebased or dropped on user edits); metrics (accept rate, show rate, latency p50/p99, retention proxy) and shadow-mode evals. Probe whichever layer they skip. Time-box: if they ratholes on model training, redirect to serving+client. Hints: "what happens when the user types while a request is in flight?", "what's cacheable across keystrokes?"`,
    starterCode: `// Whiteboard space — sketch interfaces, request flows, and notes here.
// e.g.:
// interface TabRequest { docVersion: number; prefix: string; ... }
// Client flow: keystroke -> debounce(15ms) -> ...
`,
  },
  {
    id: "cursor-index-monorepo",
    track: "cursor",
    type: "design",
    title: "Index a 100k-file monorepo for AI context retrieval",
    est: 30,
    prompt: `Design the indexing system that lets an AI editor retrieve relevant context from a **100k-file monorepo**, keeping the index fresh as the user edits.

Cover:
- Initial indexing: chunking strategy for code, embeddings vs symbol/keyword indexes, cost & time budget.
- Freshness: how edits update the index incrementally (hint: think about how you'd detect what changed cheaply).
- Retrieval: what runs at query time when the agent needs context; ranking signals beyond vector similarity.
- Where the index lives (client vs server), privacy constraints, and multi-developer sync.

Sketch the components and data flow in the editor; narrate trade-offs.`,
    interviewerNotes: `Reported Cursor question; pairs with the Merkle question (change detection for incremental re-index — reward candidates who make that connection). Strong: AST-aware chunking (functions/classes) over fixed windows; hybrid retrieval (embeddings + symbol graph + path/recency heuristics); Merkle-tree change detection so only dirty files re-chunk/re-embed; debounced background re-embedding, dirty-file overlay so un-indexed recent edits still retrievable via in-memory search; client-side encryption/no-plaintext-storage concerns; cost math for embedding 100k files. Hints: "how do you avoid re-embedding the whole repo when one file changes?", "is vector similarity enough for code?"`,
    starterCode: `// Whiteboard space — components, data flow, index schema, notes.
`,
  },
  {
    id: "cursor-streaming-edits",
    track: "cursor",
    type: "design",
    title: "Streaming multi-file edits while the user types",
    est: 25,
    prompt: `The agent streams multi-file edits, but its edits are anchored to a **stale buffer snapshot** — and the user keeps typing in the same files while the stream is in flight.

Design the system that applies streaming model edits without corrupting the buffer:
- How are edits represented and anchored (line numbers? anchors? search/replace blocks?)
- How do you transform or rebase model edits over concurrent user edits (think OT/CRDT-lite)?
- When do you refuse/retry instead of rebasing?
- UX: what does the user see while edits stream in, and how do they reject a partial application?`,
    interviewerNotes: `Reported Cursor question. Strong: version-stamped buffers; edits as anchored ranges with context (search/replace with fuzzy anchor match) rather than raw offsets; operational-transform-style rebasing of pending model edits over user ops; conflict windows where overlap => drop & re-request with fresh snapshot; atomic apply per hunk with preview/diff UI; idempotent application. Probe: what invariant guarantees no corruption (single writer to buffer, all edits transformed through the op log). Hints: "what does Google-Docs-style concurrency teach us?", "what metadata must each streamed edit carry?"`,
    starterCode: `// Whiteboard space — edit representation, rebasing rules, failure cases.
`,
  },
  {
    id: "cursor-apply-edit",
    track: "cursor",
    type: "design",
    title: "Apply a 500-line agent edit fast and reliably",
    est: 25,
    prompt: `An agent model outputs a 500-line edit to a file. Verbatim full-file rewrite is slow (regenerating 500 lines costs tokens/latency) and error-prone (model may drop code).

Design the **apply** system:
- Edit formats: full rewrite vs unified diff vs search/replace blocks vs a specialized "apply model" — trade-offs?
- How do you detect and recover when an edit doesn't apply cleanly?
- How do you make apply feel instant (speculation, parallelism)?
- How do you verify the result (syntax check, lints, tests) before showing it as done?`,
    interviewerNotes: `Reported Cursor question — this is literally Cursor's "apply model" problem. Strong: big model emits lazy/abbreviated edit ("// ...existing code..." markers) and a small fast apply-model (or deterministic merger) reconstructs the full file; fuzzy anchoring for search/replace; validation pipeline (parse, typecheck deltas) with auto-retry on failure; streaming apply per hunk; metrics on apply-failure rate. Probe cost: why not have the big model rewrite the file (tokens ∝ file size, drift/drops). Hints: "who fills in the '...existing code...' gaps?", "what's your fallback chain when an edit fails to apply?"`,
    starterCode: `// Whiteboard space — formats, fallback chain, verification pipeline.
`,
  },
  {
    id: "cursor-eval-model",
    track: "cursor",
    type: "design",
    title: "Evaluate a code-editing model before shipping",
    est: 25,
    prompt: `You're about to ship a new code-editing model powering both **tab edits** and **agent edits**. Design the evaluation strategy — offline and online — covering both surfaces separately.

- Offline: datasets (where from?), metrics for edit quality (exact match? pass@k? AST-aware diff scoring?), regression suites, LLM-as-judge pitfalls.
- Online: shadow mode, A/B design, guardrail metrics (accept rate, revert rate, latency), how long you wait, how you detect subtle regressions.
- What's different about evaluating tab (sub-second, high-volume, low-stakes) vs agent edits (multi-file, high-stakes)?`,
    interviewerNotes: `Reported Cursor question. Strong: mined real accepted/rejected edits as eval data; functional metrics (does it compile, do tests pass) over textual similarity; held-out repos to avoid contamination; judge-model bias awareness; tab = online metrics dominate (accept rate, show-to-accept, latency percentiles) with fast A/B at request granularity; agent = offline task-completion benches (SWE-bench-style) + human review queues + revert tracking; canary + staged rollout; slice analysis by language/repo size. Hints: "what ground truth do you already collect from users every day?", "why is exact-match a bad metric for edits?"`,
    starterCode: `// Whiteboard space — eval datasets, metrics, rollout plan.
`,
  },
  {
    id: "cursor-agent-harness",
    track: "cursor",
    type: "design",
    title: "Agent harness for multi-file changes — with damage control",
    est: 25,
    prompt: `Design the harness that lets an agent make multi-file changes from a natural-language request **without wrecking the codebase**, and iterate (build/test/lint) **without disturbing the user's editor session**.

Cover:
- Isolation: where does the agent run its builds/tests (worktree? shadow checkout? container?) while the user keeps editing?
- Safeguards: file-scope limits, protected paths, diff-size budgets, checkpoints/rollback.
- The iteration loop: how the agent sees errors and self-corrects; when it must stop and ask.
- Merging agent work back into a live editing session.`,
    interviewerNotes: `Combines two reported Cursor questions (agent iteration isolation + safeguards). Strong: shadow git worktree or in-memory FS overlay for agent iteration; user buffer stays authoritative, agent merges via the streaming-edit/rebase machinery; checkpoint commits enabling one-click revert; budget caps (files touched, lines changed, wall-clock, tool calls); allow/deny path rules; tests+lints as the agent's feedback signal; escalation to user on destructive ops. Hints: "what if the user edits a file the agent is mid-refactor on?", "what's your undo story?"`,
    starterCode: `// Whiteboard space — isolation model, safeguard list, loop design.
`,
  },
  {
    id: "cursor-context-window",
    track: "cursor",
    type: "design",
    title: "Debate: drop retrieval, stuff the whole repo in context?",
    est: 20,
    prompt: `Long-context models keep getting bigger. A teammate proposes: *"Kill the retrieval stack — just put the whole repo in the context window."*

Evaluate this seriously. Address:
- Latency: what does prefill cost look like for 1M+ tokens, and what does it do to time-to-first-token?
- Cost: per-request economics at millions of requests/day; what caching changes.
- Attention quality: lost-in-the-middle effects, distractor sensitivity — does more context help or hurt edit quality?
- Where's the actual frontier: hybrid designs (retrieval + big context + prompt caching)?

Take a position and defend it.`,
    interviewerNotes: `Reported Cursor question — tests judgment, not recall. Strong: quantitative instincts (prefill scales ~linearly, 1M tokens = tens of seconds and dollars per request without caching; prompt-cache reuse changes economics but invalidates on repo change — connect to Merkle/incremental ideas); attention degradation with irrelevant context, benchmarks showing retrieval+focused context beats stuffed context for editing; conclusion should be a hybrid with caching, not a flat yes/no. Push back on whatever side they take. Hints: "what's the marginal value of token #900,000?", "what does the KV cache buy you and when does it invalidate?"`,
    starterCode: `// Whiteboard space — cost math, position, hybrid design.
`,
  },
  {
    id: "cursor-inference-cost",
    track: "cursor",
    type: "design",
    title: "Serve a custom completion model to millions of DAU",
    est: 25,
    prompt: `You serve a custom completion model to **millions of daily active users**, each triggering many completions per minute.

- Build the inference-cost model: requests/day, tokens/request (prefill vs decode), GPU-hours, $/day. Rough numbers are fine — show the structure.
- Identify your **top three cost-reduction levers** and estimate each one's impact.
- What would you monitor to keep quality from silently degrading as you optimize cost?`,
    interviewerNotes: `Reported Cursor question. Strong: structured Fermi estimate (e.g. 1M DAU × 500 completions/day × ~2k prefill + 30 decode tokens; prefill-dominated workload); levers: prefix/KV caching across keystrokes (huge for completion workloads), smaller/distilled model + speculative decoding, batching & utilization, quantization, request dropping/debouncing, cheaper hardware mix; each lever tied to a % estimate; guardrails: accept-rate and latency dashboards per lever rollout. Hints: "which dominates for completions, prefill or decode?", "what's shared between two requests 100ms apart?"`,
    starterCode: `// Whiteboard space — cost model, three levers, monitoring.
`,
  },
  {
    id: "cursor-work-trial",
    track: "cursor",
    type: "scenario",
    title: "Work trial: two days, no assigned task",
    est: 20,
    prompt: `Meta-question from Cursor's on-site work trial: **You have two days in the codebase and no assigned task. What do you build, and how do you spend the time?**

Talk through:
- Hour 0–2: how you pick what to build (signals you'd look for in an unfamiliar codebase).
- What makes a good trial project (scoped, shippable, visible, representative of your judgment).
- Concretely: name 2–3 candidate projects you'd consider for a product like Cursor and pick one.
- How you'd de-risk shipping in an unfamiliar codebase, and what "done" looks like by end of day 2.`,
    interviewerNotes: `Reported meta-question about the trial itself; tests scoping and shipping judgment. Strong: explicit exploration budget (read recent PRs, issue tracker, ask engineers what's annoying); pick something end-to-end shippable in <2 days touching the product surface, not a refactor; concrete Cursor-relevant examples (small UX papercut in diff review, a missing lint on apply failures, a debug/telemetry view); mentions demoing to the team, tests, and a written summary. Red flags: grandiose projects, pure infra invisible to users, no cut lines. Probe: "it's noon on day 2 and you're 60% done — what do you cut?"`,
    starterCode: `// Notes space — exploration plan, candidate projects, the pick, cut lines.
`,
  },

  // ────────────────────────── OPENAI FDE TRACK ──────────────────────────
  {
    id: "openai-rate-limiter",
    track: "openai",
    type: "coding",
    title: "Token-bucket rate limiter",
    est: 25,
    prompt: `A customer's integration keeps blowing through their API rate limits. You're building them a client-side limiter.

Implement a **token bucket**:

\`\`\`ts
class TokenBucket {
  // capacity: max tokens the bucket holds (it starts full)
  // refillPerSec: tokens added per second (continuous refill)
  constructor(capacity: number, refillPerSec: number)

  // Attempt to take n tokens at time nowMs (milliseconds).
  // Returns true and deducts if enough tokens are available; false otherwise.
  // nowMs is always monotonically non-decreasing across calls.
  tryRemove(n: number, nowMs: number): boolean
}
\`\`\`

The clock is injected (\`nowMs\`) so behavior is deterministic. Refill is continuous (fractional tokens accumulate); the bucket never exceeds capacity. Then be ready to discuss: burst vs sustained rates, what to do when \`tryRemove\` fails (queue? backoff? shed?), and how this maps to the 429/\`retry-after\` behavior of a real API.`,
    interviewerNotes: `Classic FDE practical. Strong: lazy refill on each call (tokens = min(cap, tokens + elapsed*rate)); store last timestamp; handle fractional accumulation; O(1) state. Discussion depth matters: token bucket allows bursts up to capacity while capping sustained rate; compare to sliding window / leaky bucket; production concerns (per-key buckets, distributed state, jittered retry on 429, honoring retry-after). Hints: (a) "do you need a timer, or can you compute refill on demand?" (b) "what two pieces of state fully determine the bucket?" Edge probes: n > capacity (can never succeed), zero elapsed time.`,
    starterCode: `class TokenBucket {
  constructor(capacity: number, refillPerSec: number) {
    // TODO
  }

  tryRemove(n: number, nowMs: number): boolean {
    // TODO
    return false;
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const b = new TokenBucket(10, 1); // 10 cap, 1 token/sec
  __check("burst up to capacity", b.tryRemove(10, 0), true);
  __check("empty bucket denies", b.tryRemove(1, 0), false);
  __check("after 1s, 1 token", b.tryRemove(1, 1000), true);
  __check("no double spend", b.tryRemove(1, 1000), false);
  __check("fractional accrual (0.5s)", b.tryRemove(1, 1500), false);
  __check("fractional completes (1.0s)", b.tryRemove(1, 2500), true);

  const c = new TokenBucket(5, 10); // fast refill, low cap
  __check("cap respected after long idle", c.tryRemove(6, 100000), false);
  __check("cap amount available", c.tryRemove(5, 100000), true);

  const d = new TokenBucket(3, 2);
  d.tryRemove(3, 0);
  __check("partial refill denies larger n", d.tryRemove(2, 500), false);
  __check("partial refill allows exact n", d.tryRemove(1, 500), true);
  __check("multi-token request accrues", d.tryRemove(2, 1600), true);
}
`,
  },
  {
    id: "openai-retry-backoff",
    track: "openai",
    type: "coding",
    title: "Retry with exponential backoff + jitter",
    est: 25,
    prompt: `A customer's batch pipeline calls the API thousands of times and falls over on transient 429/500s. Build the retry wrapper you'd hand them.

\`\`\`ts
interface RetryOptions {
  retries: number;                    // max retry attempts AFTER the first try
  baseMs: number;                     // backoff base
  sleep: (ms: number) => Promise<void>; // injected for testability
  shouldRetry?: (err: unknown) => boolean; // default: retry everything
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>
\`\`\`

Rules:
- Attempt delays: before retry k (k = 1, 2, 3, …) sleep exactly \`baseMs * 2^(k-1)\` ms (deterministic for the tests — no jitter here).
- If \`shouldRetry\` returns false for an error, rethrow immediately without sleeping.
- After exhausting retries, throw the **last** error.

Then discuss: why add jitter in production (thundering herd), honoring \`Retry-After\` headers, retry budgets, and which errors must never be retried (side-effectful non-idempotent calls, 400s).`,
    interviewerNotes: `Practical async coding + judgment. Strong: clean loop, correct delay schedule (base, 2x, 4x...), no sleep after final failure or before first attempt, rethrow semantics right, typed generically. Discussion: full jitter (random 0..delay) breaks synchronization; cap max delay; distinguish retryable (429, 5xx, network) vs not (4xx validation); idempotency keys for POSTs; retry budgets to avoid amplifying outages. Hints: (a) "walk me through attempt counts: retries=2 means how many total calls?" (b) "where exactly does the sleep go in your loop?" Probe async correctness: are they awaiting properly?`,
    starterCode: `interface RetryOptions {
  retries: number;
  baseMs: number;
  sleep: (ms: number) => Promise<void>;
  shouldRetry?: (err: unknown) => boolean;
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  // TODO
  throw new Error("not implemented");
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); };

  // succeeds first try
  let calls = 0;
  const r1 = await withRetry(async () => { calls++; return "ok"; }, { retries: 3, baseMs: 100, sleep });
  __check("first-try success value", r1, "ok");
  __check("first-try success: 1 call", calls, 1);
  __check("first-try success: no sleeps", sleeps.length, 0);

  // fails twice then succeeds
  sleeps.length = 0; calls = 0;
  const r2 = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new Error("transient " + calls);
    return 42;
  }, { retries: 5, baseMs: 100, sleep });
  __check("eventual success value", r2, 42);
  __check("eventual success: 3 calls", calls, 3);
  __check("backoff schedule", sleeps, [100, 200]);

  // exhausts retries -> last error
  sleeps.length = 0; calls = 0;
  let threw = "";
  try {
    await withRetry(async () => { calls++; throw new Error("boom " + calls); }, { retries: 2, baseMs: 10, sleep });
  } catch (e) { threw = (e as Error).message; }
  __check("exhaustion throws last error", threw, "boom 3");
  __check("exhaustion: retries+1 calls", calls, 3);
  __check("exhaustion: sleeps before each retry only", sleeps, [10, 20]);

  // non-retryable
  sleeps.length = 0; calls = 0; threw = "";
  try {
    await withRetry(async () => { calls++; throw new Error("400 bad request"); }, {
      retries: 5, baseMs: 10, sleep,
      shouldRetry: (e) => !(e as Error).message.startsWith("400"),
    });
  } catch (e) { threw = (e as Error).message; }
  __check("non-retryable rethrows", threw, "400 bad request");
  __check("non-retryable: 1 call", calls, 1);
  __check("non-retryable: no sleeps", sleeps.length, 0);
}
`,
  },
  {
    id: "openai-usage-aggregation",
    track: "openai",
    type: "coding",
    title: "API usage & cost attribution report",
    est: 25,
    prompt: `A customer asks: *"Which teams are burning our API budget?"* You get their raw usage log and a pricing table.

\`\`\`ts
interface UsageEvent {
  team: string;
  model: string;          // e.g. "gpt-large", "gpt-mini"
  inputTokens: number;
  outputTokens: number;
}
// pricing: model -> { inputPerM: $, outputPerM: $ } (dollars per 1M tokens)

function costReport(
  events: UsageEvent[],
  pricing: Record<string, { inputPerM: number; outputPerM: number }>
): {
  byTeam: Record<string, number>;   // team -> total $ cost, rounded to 2 decimals
  topTeam: string | null;           // highest cost; ties -> alphabetically first; null if no events
  unknownModels: string[];          // sorted unique models missing from pricing (their events excluded)
}
\`\`\`

This is FDE bread-and-butter: get it correct, handle the messy parts (unknown models, empty input, ties), and narrate how you'd productionize it (streaming aggregation, where rounding belongs, currency precision).`,
    interviewerNotes: `Data-munging with edge cases — mirrors real FDE work. Strong: single pass accumulation in raw floats, rounding only at the end (per-event rounding compounds error — probe this!); unknown models excluded and reported; tie-break deterministic; empty input -> null topTeam. Discussion: integer micro-cents vs floats for money, incremental aggregation over event streams, per-model/per-day pivots the customer will ask for next. Hints: (a) "when do you round?" (b) "what happens with a model not in the pricing table — fail, skip, or surface?"`,
    starterCode: `interface UsageEvent {
  team: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function costReport(
  events: UsageEvent[],
  pricing: Record<string, { inputPerM: number; outputPerM: number }>
): {
  byTeam: Record<string, number>;
  topTeam: string | null;
  unknownModels: string[];
} {
  // TODO
  throw new Error("not implemented");
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const pricing = {
    "gpt-large": { inputPerM: 10, outputPerM: 30 },
    "gpt-mini": { inputPerM: 0.5, outputPerM: 1.5 },
  };

  const r1 = costReport([
    { team: "search", model: "gpt-large", inputTokens: 1_000_000, outputTokens: 100_000 },
    { team: "search", model: "gpt-mini", inputTokens: 2_000_000, outputTokens: 0 },
    { team: "support", model: "gpt-mini", inputTokens: 4_000_000, outputTokens: 2_000_000 },
  ], pricing);
  __check("byTeam totals", r1.byTeam, { search: 14, support: 5 });
  __check("topTeam", r1.topTeam, "search");
  __check("no unknown models", r1.unknownModels, []);

  const r2 = costReport([
    { team: "a", model: "mystery-1", inputTokens: 999, outputTokens: 999 },
    { team: "a", model: "gpt-mini", inputTokens: 1_000_000, outputTokens: 1_000_000 },
    { team: "b", model: "mystery-2", inputTokens: 5, outputTokens: 5 },
    { team: "b", model: "mystery-1", inputTokens: 5, outputTokens: 5 },
  ], pricing);
  __check("unknown models sorted unique", r2.unknownModels, ["mystery-1", "mystery-2"]);
  __check("unknown events excluded", r2.byTeam, { a: 2, b: 0 });

  const r3 = costReport([], pricing);
  __check("empty events -> null topTeam", r3.topTeam, null);
  __check("empty events -> empty byTeam", r3.byTeam, {});

  // rounding: accumulate raw, round at the end
  const r4 = costReport([
    { team: "x", model: "gpt-mini", inputTokens: 3333, outputTokens: 0 },   // $0.0016665
    { team: "x", model: "gpt-mini", inputTokens: 3333, outputTokens: 0 },
    { team: "x", model: "gpt-mini", inputTokens: 3334, outputTokens: 0 },
  ], pricing); // total 10000 tokens -> $0.005
  __check("round at the end", r4.byTeam, { x: 0.01 });

  // tie -> alphabetical
  const r5 = costReport([
    { team: "zeta", model: "gpt-large", inputTokens: 100_000, outputTokens: 0 },
    { team: "alpha", model: "gpt-large", inputTokens: 100_000, outputTokens: 0 },
  ], pricing);
  __check("tie breaks alphabetically", r5.topTeam, "alpha");
}
`,
  },
  {
    id: "openai-rag-design",
    track: "openai",
    type: "design",
    title: "Enterprise RAG over internal docs",
    est: 30,
    prompt: `You're embedded with a Fortune-500 customer. They want employees to ask questions over **millions of internal documents** (wikis, PDFs, tickets) — with strict access control.

Design the system end to end:
- Ingestion: connectors, chunking, embeddings, keeping the index fresh.
- **Permissions**: a user must never get an answer derived from a doc they can't read. Where do ACLs get enforced?
- Retrieval & generation: hybrid search, reranking, citations, hallucination mitigation.
- Evaluation: how you prove to the customer it works (golden sets, groundedness metrics), and what you monitor in prod.
- Rollout: what you'd ship in week 1 vs month 3 as the embedded engineer.`,
    interviewerNotes: `Core OpenAI FDE design round. Strong: ACL filtering at retrieval time (pre-filter by permitted doc set, never post-filter generated text; permissions replicated into the index with fast invalidation on permission change); hybrid BM25+vector+reranker; citation-grounded generation with "I don't know" behavior; eval = curated golden Q&A per department + groundedness/citation-accuracy scoring + online thumbs+escalation metrics; phased rollout starting with one high-value corpus. Probe hard on the permissions design — it's the differentiator. Also probe: stale permissions race, prompt injection via documents, cost of embedding millions of docs. Hints: "who decides what's retrievable, and when?", "how would you demo trustworthiness to the CISO?"`,
    starterCode: `// Whiteboard space — architecture, ACL enforcement point, eval plan, rollout.
`,
  },
  {
    id: "openai-llm-gateway",
    track: "openai",
    type: "design",
    title: "Design an enterprise LLM gateway",
    est: 30,
    prompt: `The customer has 40 teams all calling LLM APIs directly with scattered keys, no cost visibility, and no controls. Design the **central LLM gateway** you'd build as their FDE.

Cover:
- AuthN/Z: virtual keys per team/app, scopes, key rotation.
- Traffic policy: per-team rate limits & budgets, model allowlists, request/response size caps.
- Reliability: provider fallbacks, retries, timeouts, circuit breakers, streaming passthrough.
- Observability: cost attribution, latency/error dashboards, full request logging vs privacy/PII redaction.
- Caching: what's safely cacheable, semantic caching risks.
- What you explicitly keep **out** of v1.`,
    interviewerNotes: `Very common FDE/platform design. Strong: thin proxy with virtual-key -> (team, budget, allowed models) mapping; token-bucket per key (connect to the coding Q if they did it); budget enforcement with soft/hard limits and alerts; fallback chains with idempotent replay only for safe requests; streaming-aware proxying (SSE passthrough, cost computed from usage in final chunk); log metadata always / bodies opt-in with redaction; exact-match caching only for deterministic temp-0 calls, semantic caching flagged risky; v1 scope discipline (no fine-grained prompt firewall, no queueing). Hints: "how does a request get attributed to a team?", "what breaks when responses stream?"`,
    starterCode: `// Whiteboard space — gateway components, policy model, v1 cut lines.
`,
  },
  {
    id: "openai-quality-regression",
    track: "openai",
    type: "scenario",
    title: "Customer escalation: 'the model got worse'",
    est: 20,
    prompt: `Monday morning, the customer's VP emails: *"Since last week, the assistant's answers are noticeably worse. Fix it."* No other data.

You're the FDE on point. Walk through, concretely:
1. Your first 60 minutes: what you ask, what you pull, how you triage.
2. The hypothesis tree: what are the possible causes? (Think: their changes, your changes, model/provider changes, data drift, load…)
3. How you turn "noticeably worse" into something measurable — fast.
4. How you communicate during the investigation (cadence, what you commit to, what you never say).
5. It turns out to be X — pick two plausible root causes and describe the fix + the prevention.`,
    interviewerNotes: `Classic FDE scenario testing debugging discipline + customer skills. Strong: immediately asks for concrete failing examples with timestamps and request IDs; checks change log on both sides (prompt edits, retrieval index changes, model version/router changes, truncated context from a data growth issue); reproduces with logged requests; builds a quick eval from the complaint examples; regular update cadence, no premature promises or blame; plausible causes: silent prompt-template regression, retrieval index staleness/corruption, model snapshot change, context overflow truncation, a new doc source polluting retrieval. Prevention: pinned model versions, prompt/config versioning + canary evals, logging sufficient to replay. Red flags: jumping to "the model changed" without evidence; no measurement plan. Hints: "what's the very first artifact you ask them for?", "how do you make 'worse' measurable by end of day?"`,
    starterCode: `// Notes space — first hour, hypothesis tree, measurement, comms plan.
`,
  },
  {
    id: "openai-poc-scoping",
    track: "openai",
    type: "scenario",
    title: "Scope a one-week support-automation POC",
    est: 20,
    prompt: `A semi-technical Head of Support wants to see AI triage their tickets — and there's an exec review **in one week**. As the FDE, run the scoping conversation and plan the build.

Cover:
1. The 5 questions you ask first (volume, systems, data access, success bar, constraints).
2. What you'd build in 5 days — be specific about the slice (which ticket types? shadow mode or live? UI or spreadsheet?).
3. Explain to this semi-technical audience — in plain language — how structured outputs / function calling make the automation reliable, and where a human stays in the loop.
4. The demo: what you show in the exec review, what metrics you put on the slide, and how you frame limitations honestly.
5. What you explicitly defer, and the path from POC to production.`,
    interviewerNotes: `Tests customer-facing communication + scoping — the heart of FDE. Strong: narrow slice (e.g. top 3 ticket categories, shadow-mode classification + suggested reply, evaluated against historical resolved tickets — no live customer contact in week 1); crisp plain-language explanation of structured outputs (model fills a fixed form: category, urgency, suggested action — so downstream systems can trust the shape) without jargon; demo shows real customer tickets, accuracy vs their own agents, and failure examples honestly; defers integrations, edge categories, auto-send. Listen for jargon leakage — this round scores communication register heavily. Probe: "the exec asks 'can it just answer the tickets automatically?' — respond." Hints: "what data do you need on day 1?", "shadow mode or live — why?"`,
    starterCode: `// Notes space — scoping questions, 5-day plan, plain-language explainer, demo plan.
`,
  },

  // ────────────────────────── DSA TRACK ──────────────────────────
  {
    id: "dsa-two-sum",
    track: "dsa",
    type: "coding",
    title: "Two Sum",
    est: 15,
    prompt: `Given an array of integers \`nums\` and an integer \`target\`, return the **indices** of the two numbers that add up to \`target\`.

\`\`\`ts
function twoSum(nums: number[], target: number): [number, number]
\`\`\`

- Exactly one solution exists; you may not use the same element twice.
- Return indices in any order.
- Follow-up you should narrate: brute force vs one-pass hash map, time/space trade-off.`,
    interviewerNotes: `Warm-up. Expect O(n) one-pass hash map (value -> index, check complement before insert). Probe: why check-before-insert handles duplicates (e.g. [3,3], 6); complexity O(n)/O(n); what if array were sorted (two pointers, O(1) space). Hints: "can you trade space for time?", "what do you need to have seen already when you reach index i?"`,
    starterCode: `function twoSum(nums: number[], target: number): [number, number] {
  // TODO
  throw new Error("not implemented");
}
`,
    harness: `
function __normPair(p: [number, number]): number[] { return [...p].sort((a, b) => a - b); }
async function __harnessMain(): Promise<void> {
  __check("basic", __normPair(twoSum([2, 7, 11, 15], 9)), [0, 1]);
  __check("later pair", __normPair(twoSum([3, 2, 4], 6)), [1, 2]);
  __check("duplicates", __normPair(twoSum([3, 3], 6)), [0, 1]);
  __check("negatives", __normPair(twoSum([-1, -2, -3, -4, -5], -8)), [2, 4]);
  __check("zero target", __normPair(twoSum([0, 4, 3, 0], 0)), [0, 3]);
  const big = Array.from({ length: 10000 }, (_, i) => i * 2);
  big.push(1); // 20001st element
  __check("large input", __normPair(twoSum(big, 19999)).includes(10000), true);
}
`,
  },
  {
    id: "dsa-valid-parentheses",
    track: "dsa",
    type: "coding",
    title: "Valid Parentheses",
    est: 15,
    prompt: `Given a string containing only \`()[]{}\`, determine whether it is valid: every opener is closed by the same type, in the correct order.

\`\`\`ts
function isValid(s: string): boolean
\`\`\`

Narrate the data structure choice and the invariant it maintains.`,
    interviewerNotes: `Stack fundamentals. Expect: push openers; on closer, pop and match; empty-stack pop and non-empty final stack both invalid. Probe: complexity O(n)/O(n); early exit when closer mismatches; what changes with only one bracket type (counter suffices); streaming variant. Hints: "what must the most recent unclosed bracket be?", "what structure gives you most-recent-first?"`,
    starterCode: `function isValid(s: string): boolean {
  // TODO
  return false;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("simple pair", isValid("()"), true);
  __check("all types", isValid("()[]{}"), true);
  __check("mismatch", isValid("(]"), false);
  __check("interleaved invalid", isValid("([)]"), false);
  __check("nested", isValid("{[]}"), true);
  __check("empty string", isValid(""), true);
  __check("lone closer", isValid("]"), false);
  __check("lone opener", isValid("("), false);
  __check("unclosed tail", isValid("(()"), false);
  __check("deep nesting", isValid("(".repeat(1000) + ")".repeat(1000)), true);
}
`,
  },
  {
    id: "dsa-merge-intervals",
    track: "dsa",
    type: "coding",
    title: "Merge Intervals",
    est: 20,
    prompt: `Given an array of intervals \`[start, end]\`, merge all overlapping intervals and return the result sorted by start.

\`\`\`ts
function merge(intervals: number[][]): number[][]
\`\`\`

Touching intervals (e.g. \`[1,4]\` and \`[4,5]\`) count as overlapping. Don't mutate the input. Narrate the sort-then-sweep idea and its complexity.`,
    interviewerNotes: `Expect: sort by start (on a copy), sweep keeping current merged interval, extend when next.start <= cur.end. Probe: complexity O(n log n); why sorting makes a single pass sufficient; touching-endpoint convention; intervals fully contained in others; follow-ups: insert-interval variant, meeting-rooms variant (min rooms via events/heap). Hints: "what order makes overlaps adjacent?", "when can you commit an interval to the output?"`,
    starterCode: `function merge(intervals: number[][]): number[][] {
  // TODO
  throw new Error("not implemented");
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("basic overlap", merge([[1, 3], [2, 6], [8, 10], [15, 18]]), [[1, 6], [8, 10], [15, 18]]);
  __check("touching endpoints", merge([[1, 4], [4, 5]]), [[1, 5]]);
  __check("unsorted input", merge([[8, 10], [1, 3], [2, 6]]), [[1, 6], [8, 10]]);
  __check("containment", merge([[1, 10], [2, 3], [4, 8]]), [[1, 10]]);
  __check("single interval", merge([[5, 7]]), [[5, 7]]);
  __check("empty", merge([]), []);
  __check("all merge to one", merge([[1, 2], [2, 3], [3, 4], [4, 5]]), [[1, 5]]);
  const input = [[3, 4], [1, 2]];
  merge(input);
  __check("input not mutated", input, [[3, 4], [1, 2]]);
}
`,
  },
  {
    id: "dsa-lru-cache",
    track: "dsa",
    type: "coding",
    title: "LRU Cache",
    est: 25,
    prompt: `Design a Least-Recently-Used cache with **O(1)** \`get\` and \`put\`.

\`\`\`ts
class LRUCache {
  constructor(capacity: number)   // capacity >= 1
  get(key: number): number        // returns value, or -1 if absent; counts as a use
  put(key: number, value: number): void  // insert/update; counts as a use; evict LRU if over capacity
}
\`\`\`

Narrate the data-structure combination that achieves O(1) for both, and what "use" means for recency. (In TypeScript, note what \`Map\` gives you for free — but be ready to explain the classic doubly-linked-list + hash-map design as if \`Map\` didn't preserve order.)`,
    interviewerNotes: `The classic. Two valid paths: (1) exploit JS Map insertion order (delete+re-set to touch; Map.keys().next() for LRU) — accept it but REQUIRE them to explain the DLL+hashmap design and why it's O(1) (Map order is the interview shortcut); (2) hand-rolled doubly linked list with sentinel head/tail + map to nodes. Probe: why singly linked list fails (O(n) removal); get on missing key; update recency on get AND on put-update; eviction order. Hints: "what's slow about an array for recency?", "what lets you unlink a node in O(1)?" Follow-up: thread safety, TTL, LFU sketch.`,
    starterCode: `class LRUCache {
  constructor(capacity: number) {
    // TODO
  }
  get(key: number): number {
    // TODO
    return -1;
  }
  put(key: number, value: number): void {
    // TODO
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const c = new LRUCache(2);
  c.put(1, 1);
  c.put(2, 2);
  __check("get present", c.get(1), 1);
  c.put(3, 3); // evicts 2 (1 was just used)
  __check("evicted LRU", c.get(2), -1);
  c.put(4, 4); // evicts 1
  __check("evicted after use order", c.get(1), -1);
  __check("kept 3", c.get(3), 3);
  __check("kept 4", c.get(4), 4);

  const d = new LRUCache(2);
  d.put(1, 10);
  d.put(2, 20);
  d.put(1, 100); // update counts as use
  d.put(3, 30);  // evicts 2
  __check("update refreshes recency", d.get(2), -1);
  __check("updated value", d.get(1), 100);

  const e = new LRUCache(1);
  e.put(9, 9);
  __check("capacity 1 works", e.get(9), 9);
  e.put(10, 10);
  __check("capacity 1 evicts", e.get(9), -1);
  __check("missing key", e.get(999), -1);
}
`,
  },
  {
    id: "dsa-binary-search-range",
    track: "dsa",
    type: "coding",
    title: "First & Last Position in Sorted Array",
    est: 20,
    prompt: `Given a sorted array of numbers (possibly with duplicates) and a target, return the first and last index of the target, or \`[-1, -1]\` if absent — in **O(log n)**.

\`\`\`ts
function searchRange(nums: number[], target: number): [number, number]
\`\`\`

Narrate your loop invariant precisely — this question is entirely about boundary discipline.`,
    interviewerNotes: `Binary search boundaries — the classic off-by-one gauntlet. Expect two binary searches (lower bound and upper bound) with a clearly stated invariant (e.g. lo = first index that could be >= target). Probe: make them state the invariant and prove termination; why linear scan from a found index breaks O(log n) with many duplicates; lower_bound(target) and lower_bound(target+1)-1 trick. Hints: "can one binary search find both ends?", "define exactly what lo and hi mean mid-loop."`,
    starterCode: `function searchRange(nums: number[], target: number): [number, number] {
  // TODO
  return [-1, -1];
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("basic range", searchRange([5, 7, 7, 8, 8, 10], 8), [3, 4]);
  __check("absent", searchRange([5, 7, 7, 8, 8, 10], 6), [-1, -1]);
  __check("empty array", searchRange([], 0), [-1, -1]);
  __check("single hit", searchRange([1], 1), [0, 0]);
  __check("single miss", searchRange([1], 2), [-1, -1]);
  __check("all duplicates", searchRange([2, 2, 2, 2, 2], 2), [0, 4]);
  __check("target at start", searchRange([1, 1, 2, 3], 1), [0, 1]);
  __check("target at end", searchRange([1, 2, 3, 3], 3), [2, 3]);
  const big: number[] = [];
  for (let i = 0; i < 100000; i++) big.push(Math.floor(i / 10));
  __check("large array range", searchRange(big, 5000), [50000, 50009]);
}
`,
  },
  {
    id: "dsa-longest-substring",
    track: "dsa",
    type: "coding",
    title: "Longest Substring Without Repeating Characters",
    est: 20,
    prompt: `Given a string, find the length of the longest substring without repeating characters.

\`\`\`ts
function lengthOfLongestSubstring(s: string): number
\`\`\`

Narrate the sliding-window invariant: what does the window represent, and when does the left edge move?`,
    interviewerNotes: `Sliding window canonical. Expect O(n) with map of char -> last index (jump left pointer) or a set (shrink one by one) — both fine. Probe: state the invariant (window contains no repeats); why left only moves forward (max(left, lastSeen+1) — catch the bug where a stale lastSeen pulls left backward, test 'abba' covers it); complexity; charset assumptions. Hints: "what makes a window invalid, and what's the cheapest fix?", "what do you remember about characters you've passed?"`,
    starterCode: `function lengthOfLongestSubstring(s: string): number {
  // TODO
  return 0;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("abcabcbb", lengthOfLongestSubstring("abcabcbb"), 3);
  __check("bbbbb", lengthOfLongestSubstring("bbbbb"), 1);
  __check("pwwkew", lengthOfLongestSubstring("pwwkew"), 3);
  __check("empty", lengthOfLongestSubstring(""), 0);
  __check("single char", lengthOfLongestSubstring("a"), 1);
  __check("all unique", lengthOfLongestSubstring("abcdef"), 6);
  __check("abba (stale-index trap)", lengthOfLongestSubstring("abba"), 2);
  __check("tmmzuxt", lengthOfLongestSubstring("tmmzuxt"), 5);
  __check("with spaces", lengthOfLongestSubstring("ab cd ef"), 5);
  __check("space is a repeat", lengthOfLongestSubstring("a b a"), 3);
}
`,
  },
  {
    id: "dsa-reverse-linked-list",
    track: "dsa",
    type: "coding",
    title: "Reverse a Linked List",
    est: 15,
    prompt: `Reverse a singly linked list. The \`ListNode\` class is provided.

\`\`\`ts
function reverseList(head: ListNode | null): ListNode | null
\`\`\`

Do it iteratively in O(1) space, narrating the three-pointer dance. Then be ready to write (or at least narrate) the recursive version and compare stack usage.`,
    interviewerNotes: `Pointer fundamentals. Expect iterative prev/cur/next loop. Probe: draw/narrate the pointer moves in order (save next BEFORE rewiring); empty and single-node cases; recursive version and its O(n) stack; follow-ups: reverse in groups of k, reverse sublist [m,n], detect cycle. Hints: "what do you lose the moment you rewire cur.next?", "what are prev and cur at loop exit?"`,
    starterCode: `class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val: number, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

function reverseList(head: ListNode | null): ListNode | null {
  // TODO
  return null;
}
`,
    harness: `
function __toList(arr: number[]): ListNode | null {
  let head: ListNode | null = null;
  for (let i = arr.length - 1; i >= 0; i--) head = new ListNode(arr[i], head);
  return head;
}
function __toArr(head: ListNode | null): number[] {
  const out: number[] = [];
  let n = head, guard = 0;
  while (n && guard++ < 100000) { out.push(n.val); n = n.next; }
  return out;
}
async function __harnessMain(): Promise<void> {
  __check("basic", __toArr(reverseList(__toList([1, 2, 3, 4, 5]))), [5, 4, 3, 2, 1]);
  __check("two nodes", __toArr(reverseList(__toList([1, 2]))), [2, 1]);
  __check("single node", __toArr(reverseList(__toList([7]))), [7]);
  __check("empty list", reverseList(null), null);
  const big = Array.from({ length: 5000 }, (_, i) => i);
  __check("long list", __toArr(reverseList(__toList(big))), big.slice().reverse());
}
`,
  },
  {
    id: "dsa-number-of-islands",
    track: "dsa",
    type: "coding",
    title: "Number of Islands",
    est: 20,
    prompt: `Given a 2D grid of \`"1"\` (land) and \`"0"\` (water), count the islands. An island is a group of \`1\`s connected horizontally or vertically.

\`\`\`ts
function numIslands(grid: string[][]): number
\`\`\`

You may modify the grid. Narrate your traversal choice (DFS vs BFS), and discuss recursion-depth risk on huge grids.`,
    interviewerNotes: `Grid traversal canonical. Expect: scan cells; on unvisited land, increment count and flood-fill (DFS or BFS), marking visited (sink to '0' or visited set). Probe: complexity O(mn); recursive DFS stack-overflow risk on e.g. 300x300 all-land grid -> iterative stack/BFS; diagonal variant; follow-up: count distinct island shapes, union-find approach for dynamic additions. Hints: "how do you avoid counting a cell twice?", "what happens with a snake-shaped island 90k cells long and recursion?"`,
    starterCode: `function numIslands(grid: string[][]): number {
  // TODO
  return 0;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const g1 = [
    ["1", "1", "1", "1", "0"],
    ["1", "1", "0", "1", "0"],
    ["1", "1", "0", "0", "0"],
    ["0", "0", "0", "0", "0"],
  ];
  __check("one island", numIslands(g1), 1);
  const g2 = [
    ["1", "1", "0", "0", "0"],
    ["1", "1", "0", "0", "0"],
    ["0", "0", "1", "0", "0"],
    ["0", "0", "0", "1", "1"],
  ];
  __check("three islands", numIslands(g2), 3);
  __check("all water", numIslands([["0", "0"], ["0", "0"]]), 0);
  __check("all land", numIslands([["1", "1"], ["1", "1"]]), 1);
  __check("single cell land", numIslands([["1"]]), 1);
  __check("diagonals not connected", numIslands([["1", "0"], ["0", "1"]]), 2);
  const big: string[][] = Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => "1"));
  __check("200x200 all land (stack safety)", numIslands(big), 1);
}
`,
  },
  {
    id: "dsa-top-k-frequent",
    track: "dsa",
    type: "coding",
    title: "Top K Frequent Elements",
    est: 20,
    prompt: `Given an integer array and \`k\`, return the \`k\` most frequent elements, in any order. The answer is guaranteed unique.

\`\`\`ts
function topKFrequent(nums: number[], k: number): number[]
\`\`\`

Narrate the options: full sort, heap of size k, bucket sort by frequency — and their complexities. Aim for better than O(n log n).`,
    interviewerNotes: `Heap/bucket canonical. Accept any correct approach but probe complexity: count map O(n); then full sort O(u log u), min-heap of size k O(u log k), bucket-by-frequency O(n) — push toward bucket for the optimal answer. Probe: why bucket index can't exceed n; heap vs quickselect; streaming variant (heavy hitters / count-min sketch as stretch). Hints: "frequencies are bounded by what?", "do you need a total order of all frequencies or just the top k?"`,
    starterCode: `function topKFrequent(nums: number[], k: number): number[] {
  // TODO
  return [];
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __checkSet("basic", topKFrequent([1, 1, 1, 2, 2, 3], 2), [1, 2]);
  __checkSet("single element", topKFrequent([1], 1), [1]);
  __checkSet("k equals distinct", topKFrequent([5, 5, 6, 6, 7], 3), [5, 6, 7]);
  __checkSet("negatives", topKFrequent([-1, -1, -2, -2, -2, 3], 2), [-2, -1]);
  __checkSet("k=1 clear winner", topKFrequent([4, 4, 4, 4, 9, 9, 2], 1), [4]);
  const big: number[] = [];
  for (let v = 0; v < 1000; v++) for (let c = 0; c <= v % 50; c++) big.push(v);
  const res = topKFrequent(big, 5);
  __check("large input returns k items", res.length, 5);
}
`,
  },
  {
    id: "dsa-course-schedule",
    track: "dsa",
    type: "coding",
    title: "Course Schedule (cycle detection)",
    est: 25,
    prompt: `There are \`numCourses\` courses labeled \`0..numCourses-1\` and a list of prerequisite pairs \`[a, b]\` meaning *"to take course a you must first take course b."* Determine whether you can finish all courses.

\`\`\`ts
function canFinish(numCourses: number, prerequisites: number[][]): boolean
\`\`\`

This is cycle detection in a directed graph. Narrate your choice: Kahn's algorithm (BFS topological sort) or DFS coloring — and the complexity.`,
    interviewerNotes: `Topological sort canonical. Expect adjacency list + either Kahn's (in-degree queue; finishable iff processed == numCourses) or DFS with white/gray/black coloring (gray hit = cycle). Probe: complexity O(V+E); why visited-set-only DFS is insufficient (needs on-path marking); duplicate edges and self-loops ([1,1]); follow-up: return an actual ordering (Course Schedule II), parallel semesters (levels of Kahn's). Hints: "what structurally makes it impossible?", "in DFS, what distinguishes 'seen before' from 'currently on my path'?"`,
    starterCode: `function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  // TODO
  return false;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("simple chain", canFinish(2, [[1, 0]]), true);
  __check("two-cycle", canFinish(2, [[1, 0], [0, 1]]), false);
  __check("no prerequisites", canFinish(3, []), true);
  __check("diamond dag", canFinish(4, [[1, 0], [2, 0], [3, 1], [3, 2]]), true);
  __check("long cycle", canFinish(4, [[1, 0], [2, 1], [3, 2], [0, 3]]), false);
  __check("self-loop", canFinish(2, [[1, 1]]), false);
  __check("disconnected with cycle", canFinish(5, [[1, 0], [3, 2], [2, 3]]), false);
  const edges: number[][] = [];
  for (let i = 1; i < 5000; i++) edges.push([i, i - 1]);
  __check("long chain 5000", canFinish(5000, edges), true);
}
`,
  },
];

export const QUESTIONS: Map<string, Question> = new Map(Q.map((q) => [q.id, q]));

export function questionsForTrack(track: Track): Question[] {
  return Q.filter((q) => q.track === track);
}
