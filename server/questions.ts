// Question bank for the interview arena.
// Cursor track sourced from ombharatiya/AI-Engineer-Interview-Questions
// (14-company-interview-questions/cursor-anysphere.md); OpenAI FDE and DSA
// tracks curated from public interview reports and classic question sets.

import { slugify, repoName } from "./memory";

export type Track = "cursor" | "backend" | "openai" | "dsa" | "systems" | "redo" | "portfolio";
export type QuestionType = "coding" | "design" | "scenario" | "defense";

export interface Question {
  id: string;
  track: Track;
  type: QuestionType;
  title: string;
  /** Suggested minutes for this question. */
  est: number;
  /**
   * When true, the code editor is optional practice scaffolding, not the graded
   * deliverable — the interviewer and debrief evaluate reasoning/approach and
   * treat any code as supporting evidence. Used for whiteboard-style rounds.
   */
  codeOptional?: boolean;
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
  /** Optional plain-JavaScript starter, shown when the candidate picks JavaScript. */
  starterCodeJs?: string;
  /** Optional Python starter, shown when the candidate picks Python. */
  starterCodePy?: string;
  /**
   * Python test harness. Must define `def __harness_main():` and use the
   * __check / __checkSet helpers from the Python prelude. Present only for
   * questions that support Python.
   */
  harnessPy?: string;
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
    id: "backend",
    name: "Cursor FDE — Stateful Backend (evolving)",
    blurb:
      "The actual Cursor FDE 45-min live-coding format: a small in-memory backend that starts simple and grows as the interviewer layers on new requirements. Maps, lists, queues, and time — later parts reuse your earlier objects, and finishing every part is NOT expected. Defaults to JavaScript; narrate constantly and inject the clock so behavior stays testable.",
    defaultPick: ["backend-cache-ttl-lru", "backend-rate-limiter"],
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
  {
    id: "systems",
    name: "Classic Systems Design (SWE)",
    blurb:
      "Design real backend systems from scratch — API, data model, consistency, concurrency, failure handling, and scale. Classical software-engineering design rounds (not AI/LLM-specific). Best in manual mode with full narration.",
    defaultPick: ["systems-url-shortener", "systems-news-feed"],
  },
  {
    id: "redo",
    name: "Redo (Senior SWE) — real question bank",
    blurb:
      "The actually-reported Redo on-site questions: a stubbed Othello CLI game (Section 1), plus the whiteboard graph/memoization/tree problems (Section 2) — LC 105, LC 2328, and bishop-BFS. Practice in Manual mode (no AI tooling in their first round). For Section 3 AI-product design use the OpenAI/Cursor tracks; for Section 4 use Portfolio Defense (Software Engineer).",
    defaultPick: ["redo-othello", "redo-build-tree"],
  },
  {
    id: "portfolio",
    name: "Portfolio Defense (your repos)",
    blurb:
      "Defend a feature YOU built. Name a repo and a feature; a research agent reads the actual code (cached in memory files) and the interviewer grades your verbal defense against ground truth — accuracy, tradeoff depth, and honesty.",
    defaultPick: [],
  },
];

/**
 * Builds the synthetic "question" for a portfolio-defense session. Unlike the
 * static tracks, the prompt is generated from the named feature; ground truth
 * comes from the research agent, not from hand-written interviewer notes.
 */
export function portfolioQuestion(
  repoPath: string,
  featureName: string
): { id: string; title: string; type: QuestionType; est: number; prompt: string; starterCode: string } {
  const slug = slugify(featureName);
  const repo = repoName(repoPath);
  return {
    id: `defend:${slug}`,
    title: `Defend: ${featureName}`,
    type: "defense",
    est: 20,
    prompt: `**Portfolio defense — \`${repo}\`**

Walk me through **${featureName}** — what it does, how you built it, and the key architecture decisions behind it. I have the code in front of me, so be precise: I'll push on anything that doesn't match what's actually there.

Then defend your choices. Why this design over the alternatives? What did you optimize for, and what did you trade away? What would you do differently now?

Use the notes panel on the right for diagrams, component lists, or bullet points — but the defense itself is spoken, so **narrate out loud**.`,
    starterCode: `// Scratch space — sketch the architecture of "${featureName}", list its
// components, jot the tradeoffs you want to hit. You're defending it out loud;
// this panel is just for diagrams and notes.
`,
  };
}

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

  // ────────────────────── CLASSIC SYSTEMS DESIGN (SWE) ──────────────────────
  // Discussion rounds: design a real backend from scratch. No test harness —
  // the editor is a whiteboard. Best practiced in manual mode with narration.
  {
    id: "systems-url-shortener",
    track: "systems",
    type: "design",
    title: "Design a URL shortener (TinyURL / bit.ly)",
    est: 35,
    prompt: `Design the backend for a URL shortener: users submit a long URL and get back a short code; visiting the short link redirects to the original.

Drive the design end to end:
- **Requirements** — clarify functional (custom aliases? expiry? analytics?) and non-functional (read:write ratio, latency, availability) before designing.
- **API** — define the create and redirect endpoints (shapes, status codes).
- **Short-code generation** — how do you produce short, unique codes? Compare approaches (hash+truncate, counter+base62, random) and their collision/coordination tradeoffs.
- **Data model & storage** — schema, choice of store, and why.
- **Redirect path** — make it fast (caching), and decide 301 vs 302 (and what that costs you in analytics).
- **Scale & failure** — back-of-envelope for storage/QPS; what breaks first and how you'd shard.

Sketch API shapes and the schema in the editor. Narrate your reasoning and tradeoffs out loud.`,
    interviewerNotes: `Canonical warm-up systems-design question — tests whether they clarify first, design a clean API/schema, and reason about the ID-generation tradeoff. Strong answers: nail read-heavy profile (reads >> writes) and cache the redirect (short_code -> long_url) hot path; ID generation via a counter + base62 (needs a distributed counter / ranges, e.g. per-node blocks or a ticket server) OR random 7-char base62 with collision-retry (discuss birthday-collision math), and can articulate why hash+truncate risks collisions and is deterministic (dup URLs collapse — pro or con); KV or relational store keyed on short_code, low write amplification; 302 (temporary) to preserve analytics vs 301 (cacheable, faster, but browsers cache and you lose click counts); sharding by short_code hash; expiry via TTL. Hint ladder: (1) "what's the read/write ratio, and what does that imply?" (2) "how do you guarantee codes are unique without a central bottleneck?" (3) "301 vs 302 — what does each cost you?" Red flags: jumping to architecture before requirements; ignoring collisions; no caching on the redirect path.`,
    starterCode: `// Whiteboard — API shapes, schema, ID-generation approach, cache plan.
// POST /shorten { url, alias? } -> { shortCode }
// GET  /:code -> 302 Location: <longUrl>
// table links(short_code PK, long_url, created_at, expires_at?, clicks)
`,
  },
  {
    id: "systems-news-feed",
    track: "systems",
    type: "design",
    title: "Design a social news feed / timeline",
    est: 40,
    prompt: `Design the backend for a home feed: each user sees a timeline of posts from accounts they follow, newest-relevant first.

Cover:
- **Requirements** — clarifying questions (chronological vs ranked? how fresh? follower-count distribution?).
- **API** — get-feed (pagination), create-post.
- **Data model** — users, follows, posts, and how the feed is assembled.
- **The core decision: fanout-on-write vs fanout-on-read** — precompute each user's feed on post, or assemble at read time? Discuss the tradeoff and where each wins.
- **The celebrity / hot-key problem** — a user with 10M followers breaks naive fanout-on-write. How do you handle it (hybrid)?
- **Ranking, caching, pagination** (stable cursors, not offset), and how you keep it fast.

Sketch the write path and read path. Narrate the tradeoffs.`,
    interviewerNotes: `Classic feed design — the signal is the fanout tradeoff and the celebrity hybrid. Strong answers: fanout-on-write (push) precomputes per-follower feed lists (fast reads, expensive/wasteful writes, bad for celebrities & inactive users) vs fanout-on-read (pull) assembles at query time (cheap writes, expensive reads, bad for users following many); the real answer is HYBRID — push for normal accounts, pull for celebrities/high-fanout, merge at read time; feed stored as a capped list of post-ids in a fast store (Redis) per user; cursor-based pagination (post_id/timestamp cursor, not OFFSET) for stability; ranking as a later layer over the candidate set; cache hot feeds, backfill inactive users lazily. Bonus: dedupe, handling unfollow/delete (tombstones or read-time filter). Hint ladder: (1) "walk me through what happens when a user with 10M followers posts" (2) "would you precompute feeds or build them on read — what does each cost?" (3) "how do you paginate so items don't shift when new posts arrive?" Red flags: OFFSET pagination; single fanout strategy with no celebrity handling; no read/write ratio reasoning.`,
    starterCode: `// Whiteboard — write path vs read path, feed storage, fanout strategy.
// GET /feed?cursor=... -> { posts[], nextCursor }
// POST /posts { text } -> fanout...
// follows(follower_id, followee_id) ; feeds: per-user list of post_ids (capped)
`,
  },
  {
    id: "systems-chat",
    track: "systems",
    type: "design",
    title: "Design a real-time chat / messaging system",
    est: 40,
    prompt: `Design a 1:1 and group messaging backend (think WhatsApp / Slack DMs): messages deliver in near-real-time, survive offline recipients, and arrive in order.

Cover:
- **Requirements** — 1:1 vs groups, delivery/read receipts, offline delivery, history retention.
- **Connection layer** — how clients receive messages in real time (WebSocket/long-poll), and how you route a message to the right connection across many servers.
- **Data model & ordering** — how messages are stored and how you guarantee per-conversation ordering.
- **Delivery semantics** — at-least-once vs exactly-once, dedup (client message IDs), and the sent/delivered/read state machine.
- **Offline & fanout** — recipient offline: how does the message wait and get delivered on reconnect? Group fanout.
- **Scale** — presence, connection state, and what shards by what.

Sketch the message flow and schema. Narrate tradeoffs.`,
    interviewerNotes: `Tests connection routing, ordering, and delivery semantics. Strong answers: persistent connections (WebSocket) terminated by gateway servers; a way to find which gateway holds a user's connection (session registry / pub-sub by user_id, e.g. Redis) so a message from server A reaches recipient on server B; messages persisted first (durability) then pushed — inbox/mailbox model so offline users get messages on reconnect (pull unacked since last-seen cursor); per-conversation ordering via a monotonic sequence number issued per conversation (not global); at-least-once delivery + client-generated message IDs for idempotent dedup; state machine sent->delivered->read via acks; group = fan out to members' inboxes. Bonus: presence via heartbeats + TTL, push notifications for offline, message history pagination. Hint ladder: (1) "server A receives a message for a user connected to server B — how does it get there?" (2) "how do you guarantee messages show in the same order for everyone in a conversation?" (3) "recipient is offline — walk me through send then reconnect." Red flags: assuming one server holds all connections; global ordering; no persistence before delivery; ignoring dedup.`,
    starterCode: `// Whiteboard — connection/gateway layer, routing, message store, ordering.
// clients <-WS-> gateways -> message service -> store + fanout to inboxes
// messages(conv_id, seq, sender_id, body, ts, client_msg_id)
`,
  },
  {
    id: "systems-notifications",
    track: "systems",
    type: "design",
    title: "Design a notification / fan-out service",
    est: 35,
    prompt: `Design a service that other systems call to notify users across channels (push, email, SMS, in-app). It must absorb bursts, not double-send, and respect user preferences.

Cover:
- **API** — how producers enqueue a notification (single + fan-out to many users).
- **Pipeline** — decoupling producers from delivery (queues/workers), and per-channel adapters.
- **Reliability** — retries with backoff, dead-letter handling, and **idempotency / dedup** so a retried or duplicate request doesn't notify twice.
- **User preferences & rate limiting** — opt-outs, quiet hours, per-user caps, digesting.
- **Scale & isolation** — bursty producers, a slow channel (e.g. email provider) not blocking others, priority.
- **Observability** — how you know a notification was actually delivered.

Sketch the pipeline and data model. Narrate tradeoffs.`,
    interviewerNotes: `Tests async pipeline design, idempotency, and failure handling. Strong answers: producers write to a durable queue; workers pull and dispatch to per-channel adapters (push/email/SMS/in-app), each isolated so one slow/broken provider doesn't back up others (separate queues per channel/priority); at-least-once processing + idempotency keys (dedup on producer-supplied notification id within a window) to avoid double-send; retries with exponential backoff and a dead-letter queue for poison messages; preference service checked before send (opt-out, quiet hours, frequency caps, digest batching); templating/localization; delivery tracking via provider callbacks/webhooks -> status store. Bonus: fan-out (one event -> many users) done in a fan-out worker to keep the API fast; priority lanes (OTP vs marketing). Hint ladder: (1) "a producer retries the same request — how do you avoid notifying twice?" (2) "the email provider is down for an hour — what happens to push notifications?" (3) "how do you enforce 'no more than 5 marketing pushes a day'?" Red flags: synchronous send in the API call; no dedup; single queue for all channels; no DLQ.`,
    starterCode: `// Whiteboard — API, queues/workers, channel adapters, idempotency, prefs.
// POST /notify { userId(s), template, data, idempotencyKey, channel? , priority }
// producer -> queue -> fanout worker -> per-channel queues -> adapters -> providers
`,
  },
  {
    id: "systems-booking",
    track: "systems",
    type: "design",
    title: "Design a booking system (no double-booking)",
    est: 40,
    prompt: `Design a reservation/booking backend — seats, rooms, or appointment slots — where a finite inventory must never be double-booked, even under heavy concurrent demand (think concert tickets or restaurant tables).

Cover:
- **Requirements** — hold/checkout flow? temporary reservations? overselling tolerance?
- **API** — search availability, hold, confirm, cancel.
- **Data model** — inventory, holds, bookings.
- **The core problem: concurrency** — two users try to grab the last seat at the same instant. How do you guarantee exactly one wins? Compare approaches (DB transaction + row lock / SELECT … FOR UPDATE, optimistic concurrency with version check, conditional update, distributed lock) and their tradeoffs.
- **Holds & expiry** — reserve a seat for N minutes during checkout, then release if abandoned. How do you implement expiry reliably?
- **Idempotency & payments** — confirm is called twice (double-click / retry) — no double charge, no double booking.
- **Scale** — hot events (everyone hits one show at 10am).

Sketch the schema and the critical section. Narrate tradeoffs.`,
    interviewerNotes: `The best pure-SWE systems question here — it's really about correctness under concurrency, not just scale. Strong answers: model the atomic decrement as a single transactional step — either SELECT ... FOR UPDATE on the inventory row then decrement, or a conditional UPDATE (UPDATE inventory SET remaining = remaining - 1 WHERE id = ? AND remaining > 0) and check rows-affected, or optimistic concurrency (version column, retry on conflict); the invariant is that the availability check and the decrement happen atomically — never check-then-act with a gap; temporary holds as rows with expires_at, and expiry handled by (a) a sweeper job releasing expired holds AND/OR (b) treating availability as active-holds-aware at query time (don't rely on the sweeper alone); idempotency keys on confirm so retries/double-clicks don't double-book or double-charge; payment as a separate step with the hold guaranteeing the seat during checkout; for hot events, per-seat/section contention mitigation (queue/waiting room, shard inventory, in-memory reservation service backed by durable store). Hint ladder: (1) "two requests for the last seat arrive at the same millisecond — how does exactly one win?" (2) "where exactly is the critical section, and what's protecting it?" (3) "the user starts checkout but never pays — how does the seat come back?" Red flags: check-availability-then-book as two separate steps (TOCTOU race); relying only on a cron to free holds; no idempotency on confirm; app-level locking that doesn't survive multiple servers.`,
    starterCode: `// Whiteboard — schema, the atomic reserve step, holds/expiry, idempotency.
// POST /hold { slotId, userId, idemKey } -> { holdId, expiresAt }
// POST /confirm { holdId, paymentToken, idemKey }
// inventory(slot_id, remaining, version) ; holds(id, slot_id, user_id, expires_at, status)
`,
  },
  {
    id: "systems-kv-store",
    track: "systems",
    type: "design",
    title: "Design a distributed key-value store / cache",
    est: 40,
    prompt: `Design a distributed key-value store (or a distributed cache like a self-hosted Redis) that scales beyond one machine and survives node failures.

Cover:
- **API & semantics** — get/put/delete; what consistency do you promise (strong vs eventual)?
- **Partitioning** — how keys map to nodes. Why is naive \`hash(key) % N\` bad when N changes, and what fixes it (consistent hashing / hash ring, virtual nodes)?
- **Replication** — how many copies, and how writes/reads use them (quorum: R + W > N). CAP tradeoff under partition.
- **Failure handling** — node down, node added: how does data move (rebalancing), and how do replicas reconcile (read-repair, hinted handoff, vector clocks / last-write-wins)?
- **Cache specifics (if framed as a cache)** — eviction (LRU/LFU/TTL), and cache-aside vs write-through.

Sketch the ring and the read/write paths. Narrate the consistency tradeoffs.`,
    interviewerNotes: `Tests distributed-systems fundamentals: partitioning, replication, consistency. Strong answers: consistent hashing with virtual nodes so adding/removing a node only remaps ~1/N of keys (vs modulo remapping nearly everything); replication factor N with tunable quorums — W + R > N gives read-your-writes / strong-ish consistency, smaller W/R gives availability & speed (Dynamo-style); explicit CAP stance under partition (AP with eventual consistency + conflict resolution, or CP refusing writes); conflict handling via last-write-wins (needs synced clocks, can lose data) vs vector clocks / version vectors (accurate causality, more complex) + read-repair and hinted handoff for transient failures; rebalancing moves only affected ranges. For cache framing: eviction policies (LRU via hashmap+DLL, LFU, TTL), cache-aside vs write-through/back, thundering-herd/stampede protection (locks, request coalescing), and hot-key mitigation. Hint ladder: (1) "you add a 5th node to 4 — how much data moves, and how do you keep it small?" (2) "how do you stay available during a network partition, and what do you give up?" (3) "two clients write the same key on different replicas — how do you reconcile?" Red flags: hash % N; single-leader with no failover story; claiming both strong consistency and full availability under partition.`,
    starterCode: `// Whiteboard — hash ring, replication/quorum, failure & reconciliation.
// get(k) / put(k, v) ; ring of virtual nodes; N replicas; R + W > N
// conflict resolution: LWW vs vector clocks ; read-repair, hinted handoff
`,
  },
  {
    id: "systems-rate-limiter",
    track: "systems",
    type: "design",
    title: "Design a distributed rate limiter",
    est: 35,
    prompt: `Design a rate limiter that caps each client (API key / user / IP) to N requests per window, enforced consistently across a **fleet** of API servers (not just one process).

Cover:
- **Requirements** — per-key limits, the window semantics, and what happens on limit (reject 429 vs queue).
- **Algorithm** — compare fixed window, sliding window (log & counter), token bucket, leaky bucket; which you'd pick and why (burstiness, boundary spikes, memory).
- **Distribution** — the limit is global but requests hit many servers. Where does the counter live so all servers agree (centralized store like Redis, atomic increments/Lua), and how do you keep that fast?
- **Failure & tradeoffs** — the counter store is slow or down: fail open or closed? Local approximation vs strict global accuracy.
- **Details** — clock/window boundaries, key cardinality, response headers (limit/remaining/reset).

Sketch the check path and data. Narrate tradeoffs.`,
    interviewerNotes: `Tests algorithm choice + the distributed-counter problem. Strong answers: token bucket (smooths bursts, simple, common) or sliding-window counter (avoids fixed-window's 2x boundary burst by weighting the previous window); fixed window is simplest but allows edge spikes; sliding-window log is exact but memory-heavy; the crux is the SHARED counter — a central store (Redis) with atomic INCR/EXPIRE or a Lua script/token-bucket done atomically so concurrent servers don't race; latency mitigation via local token buckets that sync/lease from the central store (approximate but fast) — name the accuracy-vs-latency tradeoff; on store failure decide fail-open (availability, risk abuse) vs fail-closed (safety, risk outage) and justify; per-key TTLs to bound memory; return standard headers. Hint ladder: (1) "fixed-window counter — what happens right at the window boundary?" (2) "ten servers each hold their own counter — how do you enforce a global limit?" (3) "Redis is down — do you allow or block traffic, and why?" Red flags: per-process in-memory counter presented as global; ignoring atomicity (read-then-write race); no failure stance.`,
    starterCode: `// Whiteboard — algorithm, shared counter, atomicity, failure mode.
// allow(key): bool  // check + decrement atomically
// central store: INCR key + EXPIRE, or token-bucket via Lua ; optional local lease
`,
  },

  // ─────────────────────── REDO (Senior SWE) — real bank ────────────────────
  // The actual reported Redo on-site questions, mapped to the invite's sections.
  // Section 1 = a stubbed CLI game (Othello); Section 2 = whiteboard graph /
  // memoization / tree-traversal problems. No fabricated e-commerce prompts.
  {
    id: "redo-othello",
    track: "redo",
    type: "coding",
    title: "Section 1 — Othello / Reversi (CLI game logic)",
    est: 60,
    codeOptional: true,
    prompt: `**Redo Section 1 simulation.** On the real on-site you get a *stubbed CLI game* and 90 minutes to complete as much functionality as possible (your machine, your IDE, Cursor allowed). Redo has used **Othello/Reversi** before. Here you implement the game's core logic; the tests grade functionality, just like the real round.

### Rules of Othello (Reversi)

Two players — **Black (\`"B"\`)** and **White (\`"W"\`)** — alternate turns on an 8×8 board.

- **Setup.** Four discs start in the center: \`(3,3)=W\`, \`(3,4)=B\`, \`(4,3)=B\`, \`(4,4)=W\` (row, col; 0-indexed). **Black moves first.**
- **A legal move** places one of your discs on an **empty** square so that it *outflanks* opponent discs: in at least one of the **8 directions** (horizontal, vertical, or diagonal) there must be an unbroken line of **one or more** opponent discs, starting on the square adjacent to where you place, and ending at one of **your own** discs. A move that outflanks nothing is **not legal**.
- **Flipping.** When you place a disc, **every** opponent disc you outflank flips to your color — in **all** outflanking directions at once, not just one.
- **Passing.** If you have no legal move, you **pass** and the opponent moves again. If **neither** player has a legal move, the game is **over**.
- **End & result.** The game also ends when the board is full. The winner is whoever has **more** discs; an equal count is a tie.

### What to implement

On an 8×8 board (row-major; \`"B"\`, \`"W"\`, \`"."\` for empty):

- \`initialBoard()\` — the standard starting board described above.
- \`legalMoves(board, player)\` — every legal move for \`player\`, as \`[row, col]\` pairs.
- \`applyMove(board, player, r, c)\` — return a **new** board with the disc placed and **all** outflanked discs flipped, in every valid direction. Don't mutate the input; you may assume the move is legal.
- \`isGameOver(board)\` — true when **neither** player has a legal move.
- \`score(board)\` — disc counts \`{ B, W }\`.

**Strategy (real round and here): get a minimal working game first, then layer edge cases.** The 8-direction scan is the reusable primitive — write it once and reuse it for move generation, validation, and flipping.`,
    interviewerNotes: `Redo's reported Section-1 game (console Othello). Tests whether the candidate builds a working core fast and reuses one 8-direction primitive. Strong: a single DIRS array reused across legalMoves/applyMove; legalMoves scans each empty cell in 8 dirs for a run of >=1 opponent piece terminated by the player's own piece; applyMove flips every such run in EVERY direction and returns a fresh board (no mutation); isGameOver = neither side has a move (a stuck player passes; game ends only when BOTH are stuck); score counts. Classic bugs: a move must flip >=1 (empty-adjacent isn't legal), flipping only the first direction found, mutating in place. Coaching: reward getting initialBoard+legalMoves+applyMove working before edge cases — over-elaboration before a playable core is the known failure mode. Hints: (1) "what makes a move legal in Othello?" (2) "write one helper that scans a single direction from (r,c) — what does it return?" (3) "applyMove must flip in EVERY valid direction, not just one."`,
    starterCode: `type Player = "B" | "W";
type Cell = Player | ".";
type Board = Cell[][]; // 8x8, row-major; "." = empty

const N = 8;
// The 8 directions as [dr, dc]. Reuse this for validation AND flipping.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function opponent(p: Player): Player {
  return p === "B" ? "W" : "B";
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

// Fresh 8x8 board with the four standard center pieces.
function initialBoard(): Board {
  // TODO
  return [];
}

// Every legal move for player as [row, col] pairs.
function legalMoves(board: Board, player: Player): Array<[number, number]> {
  // TODO
  return [];
}

// New board with the move applied and all flanked pieces flipped.
// Assume (r, c) is legal for player. Do NOT mutate board.
function applyMove(board: Board, player: Player, r: number, c: number): Board {
  // TODO
  return board;
}

// True when NEITHER player has a legal move.
function isGameOver(board: Board): boolean {
  // TODO
  return false;
}

function score(board: Board): { B: number; W: number } {
  // TODO
  return { B: 0, W: 0 };
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const empty = (): Cell[][] => Array.from({ length: 8 }, () => Array<Cell>(8).fill("."));
  const key = (ms: Array<[number, number]>) => ms.map((m) => m[0] + "," + m[1]);

  const b0 = initialBoard();
  __check("initial center", [b0[3][3], b0[3][4], b0[4][3], b0[4][4]], ["W", "B", "B", "W"]);
  __check("initial score", score(b0), { B: 2, W: 2 });
  __check("game not over at start", isGameOver(b0), false);

  __checkSet("black opening moves", key(legalMoves(b0, "B")), ["2,3", "3,2", "4,5", "5,4"]);
  __checkSet("white opening moves", key(legalMoves(b0, "W")), ["2,4", "4,2", "3,5", "5,3"]);

  const b1 = applyMove(b0, "B", 2, 3);
  __check("apply places + flips", [b1[2][3], b1[3][3], b1[4][3]], ["B", "B", "B"]);
  __check("apply score", score(b1), { B: 4, W: 1 });
  __check("apply does not mutate original", score(b0), { B: 2, W: 2 });

  // multi-direction flip: B at (0,0) flanks right (0,1),(0,2) and down (1,0)
  const bm = empty();
  bm[0][1] = "W"; bm[0][2] = "W"; bm[0][3] = "B";
  bm[1][0] = "W"; bm[2][0] = "B";
  __check("legal move present", key(legalMoves(bm, "B")).includes("0,0"), true);
  const bm2 = applyMove(bm, "B", 0, 0);
  __check("multi-direction flip", [bm2[0][0], bm2[0][1], bm2[0][2], bm2[1][0]], ["B", "B", "B", "B"]);

  const full = Array.from({ length: 8 }, () => Array<Cell>(8).fill("B"));
  __check("no moves on full board", legalMoves(full, "W"), []);
  __check("full board is game over", isGameOver(full), true);
  __check("full board score", score(full), { B: 64, W: 0 });
}
`,
    starterCodeJs: `// 8x8 board as arrays of "B", "W", or "." (empty).
// Reuse this 8-direction list for validation AND flipping.
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function opponent(p) {
  return p === "B" ? "W" : "B";
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// Fresh 8x8 board with the four standard center pieces.
function initialBoard() {
  // TODO
  return [];
}

// Every legal move for player as [row, col] pairs.
function legalMoves(board, player) {
  // TODO
  return [];
}

// New board with the move applied and all flanked pieces flipped.
// Assume (r, c) is legal for player. Do NOT mutate board.
function applyMove(board, player, r, c) {
  // TODO
  return board;
}

// True when NEITHER player has a legal move.
function isGameOver(board) {
  // TODO
  return false;
}

function score(board) {
  // TODO
  return { B: 0, W: 0 };
}
`,
    starterCodePy: `# 8x8 board as a list of lists; cells are "B", "W", or "." (empty).
# Reuse this 8-direction list for validation AND flipping.
DIRS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def opponent(p):
    return "W" if p == "B" else "B"


def in_bounds(r, c):
    return 0 <= r < 8 and 0 <= c < 8


def initial_board():
    # TODO: fresh 8x8 board with the four standard center pieces
    # (3,3)=W, (3,4)=B, (4,3)=B, (4,4)=W
    return []


def legal_moves(board, player):
    # TODO: list of [r, c] legal moves for player
    return []


def apply_move(board, player, r, c):
    # TODO: return a NEW board with the piece placed and all flanked pieces
    # flipped, in every valid direction. Do NOT mutate board. Assume legal.
    return board


def is_game_over(board):
    # TODO: True when NEITHER player has a legal move
    return False


def score(board):
    # TODO: return {"B": count, "W": count}
    return {"B": 0, "W": 0}
`,
    harnessPy: `
def __harness_main():
    def empty():
        return [["." for _ in range(8)] for _ in range(8)]

    def key(ms):
        return [str(m[0]) + "," + str(m[1]) for m in ms]

    b0 = initial_board()
    __check("initial center", [b0[3][3], b0[3][4], b0[4][3], b0[4][4]], ["W", "B", "B", "W"])
    __check("initial score", score(b0), {"B": 2, "W": 2})
    __check("game not over at start", is_game_over(b0), False)

    __checkSet("black opening moves", key(legal_moves(b0, "B")), ["2,3", "3,2", "4,5", "5,4"])
    __checkSet("white opening moves", key(legal_moves(b0, "W")), ["2,4", "4,2", "3,5", "5,3"])

    b1 = apply_move(b0, "B", 2, 3)
    __check("apply places + flips", [b1[2][3], b1[3][3], b1[4][3]], ["B", "B", "B"])
    __check("apply score", score(b1), {"B": 4, "W": 1})
    __check("apply does not mutate original", score(b0), {"B": 2, "W": 2})

    bm = empty()
    bm[0][1] = "W"; bm[0][2] = "W"; bm[0][3] = "B"
    bm[1][0] = "W"; bm[2][0] = "B"
    __check("legal move present", "0,0" in key(legal_moves(bm, "B")), True)
    bm2 = apply_move(bm, "B", 0, 0)
    __check("multi-direction flip", [bm2[0][0], bm2[0][1], bm2[0][2], bm2[1][0]], ["B", "B", "B", "B"])

    full = [["B" for _ in range(8)] for _ in range(8)]
    __check("no moves on full board", legal_moves(full, "W"), [])
    __check("full board is game over", is_game_over(full), True)
    __check("full board score", score(full), {"B": 64, "W": 0})
`,
  },
  {
    id: "redo-build-tree",
    track: "redo",
    type: "coding",
    title: "Section 2 — Build binary tree from preorder & inorder (LC 105)",
    est: 20,
    codeOptional: true,
    prompt: `**Redo Section 2 (whiteboard).** Reported at Redo more than once — done on a real whiteboard. Given \`preorder\` and \`inorder\` traversals of a binary tree with **distinct** values, reconstruct the tree and return its root.

\`\`\`ts
function buildTree(preorder: number[], inorder: number[]): TreeNode | null
\`\`\`

Key idea: \`preorder[0]\` is the root; its position in \`inorder\` splits the left and right subtrees; recurse. State your complexity, and know the hashmap optimization for the inorder lookup. In the real round you write this **by hand** — practice the index bookkeeping without autocomplete.`,
    interviewerNotes: `Reported Redo whiteboard question (LC 105). Strong: preorder[0] = root; find it in inorder (O(1) via a value->index map, else O(n) scan); everything left of it in inorder is the left subtree, right is the right; recurse with correct index ranges; O(n) time/space with the map, O(n^2) without. Watch for: off-by-one in index ranges, rebuilding the inorder index each call, not handling empty input. On a whiteboard, reward stating the recurrence and complexity before coding. Hints: (1) "what does preorder[0] tell you?" (2) "once you find the root in inorder, what do the two sides represent?" (3) "how do you avoid re-scanning inorder every call?"`,
    starterCode: `interface TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

// preorder and inorder of a tree with DISTINCT values. Return the root.
function buildTree(preorder: number[], inorder: number[]): TreeNode | null {
  // TODO
  return null;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const pre = (n: TreeNode | null): number[] => (n ? [n.val, ...pre(n.left), ...pre(n.right)] : []);
  const ino = (n: TreeNode | null): number[] => (n ? [...ino(n.left), n.val, ...ino(n.right)] : []);
  const cases: Array<[number[], number[]]> = [
    [[3, 9, 20, 15, 7], [9, 3, 15, 20, 7]],
    [[-1], [-1]],
    [[1, 2, 3, 4], [2, 1, 4, 3]],
    [[1, 2, 3], [1, 2, 3]],
    [[3, 2, 1], [1, 2, 3]],
  ];
  for (const [p, i] of cases) {
    const t = buildTree([...p], [...i]);
    __check("preorder " + JSON.stringify(p), pre(t), p);
    __check("inorder " + JSON.stringify(p), ino(t), i);
  }
  __check("empty tree", buildTree([], []), null);
}
`,
    starterCodeJs: `// Tree nodes are plain objects: { val, left, right } (left/right default null).
// preorder and inorder of a tree with DISTINCT values. Return the root (or null).
function buildTree(preorder, inorder) {
  // TODO
  return null;
}
`,
    starterCodePy: `class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


# preorder and inorder of a tree with DISTINCT values. Return the root (or None).
def build_tree(preorder, inorder):
    # TODO
    return None
`,
    harnessPy: `
def __harness_main():
    def pre(n):
        return [n.val] + pre(n.left) + pre(n.right) if n else []

    def ino(n):
        return ino(n.left) + [n.val] + ino(n.right) if n else []

    cases = [
        ([3, 9, 20, 15, 7], [9, 3, 15, 20, 7]),
        ([-1], [-1]),
        ([1, 2, 3, 4], [2, 1, 4, 3]),
        ([1, 2, 3], [1, 2, 3]),
        ([3, 2, 1], [1, 2, 3]),
    ]
    for p, i in cases:
        t = build_tree(list(p), list(i))
        __check("preorder " + json.dumps(p), pre(t), p)
        __check("inorder " + json.dumps(p), ino(t), i)
    __check("empty tree", build_tree([], []), None)
`,
  },
  {
    id: "redo-increasing-paths",
    track: "redo",
    type: "coding",
    title: "Section 2 — Number of increasing paths in a grid (LC 2328)",
    est: 25,
    codeOptional: true,
    prompt: `**Redo Section 2 (memoization).** Reported at Redo (LC 2328). Given an \`m x n\` grid, count paths where each step moves to a 4-directionally adjacent cell with a **strictly greater** value. A single cell is a path of length 1. Return the count modulo \`1e9 + 7\`.

\`\`\`ts
function countPaths(grid: number[][]): number
\`\`\`

This is your **memoization** bucket: DFS from each cell, memo on \`(r, c)\` = number of increasing paths **starting** there. Be ready to state why memo collapses the exponential to \`O(m·n)\`.`,
    interviewerNotes: `Reported Redo question (LC 2328) — the "memoization" bucket. Strong: dp(r,c) = number of strictly-increasing paths starting at (r,c) = 1 + sum of dp(nr,nc) for neighbors with a greater value; memoize on (r,c) (strictly-increasing => a DAG => memo is safe); answer = sum over all cells, mod 1e9+7; O(mn) time/space. Watch for: forgetting the +1 (each cell itself is a path), inconsistent modulo, using >= instead of > (must be STRICT), no memo (exponential). Hints: (1) "define the subproblem for a single cell" (2) "why is it safe to memoize — could you revisit a cell within one path?" (3) "don't forget each cell alone counts."`,
    starterCode: `// Count strictly-increasing 4-directional paths; each single cell counts.
// Return the total modulo 1e9 + 7.
function countPaths(grid: number[][]): number {
  // TODO
  return 0;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("2x2 example", countPaths([[1, 1], [3, 4]]), 8);
  __check("single cell", countPaths([[1]]), 1);
  __check("row increasing", countPaths([[1, 2, 3]]), 6);
  __check("row decreasing", countPaths([[3, 2, 1]]), 6);
  __check("2x2 distinct", countPaths([[1, 2], [3, 4]]), 10);
  __check("all equal 2x2", countPaths([[5, 5], [5, 5]]), 4);
}
`,
    starterCodeJs: `// Count strictly-increasing 4-directional paths; each single cell counts.
// Return the total modulo 1e9 + 7.
function countPaths(grid) {
  // TODO
  return 0;
}
`,
    starterCodePy: `# Count strictly-increasing 4-directional paths; each single cell counts.
# Return the total modulo 1e9 + 7.
def count_paths(grid):
    # TODO
    return 0
`,
    harnessPy: `
def __harness_main():
    __check("2x2 example", count_paths([[1, 1], [3, 4]]), 8)
    __check("single cell", count_paths([[1]]), 1)
    __check("row increasing", count_paths([[1, 2, 3]]), 6)
    __check("row decreasing", count_paths([[3, 2, 1]]), 6)
    __check("2x2 distinct", count_paths([[1, 2], [3, 4]]), 10)
    __check("all equal 2x2", count_paths([[5, 5], [5, 5]]), 4)
`,
  },
  {
    id: "redo-bishop-bfs",
    track: "redo",
    type: "coding",
    title: "Section 2 — Bishop minimum moves (BFS shortest path)",
    est: 25,
    codeOptional: true,
    prompt: `**Redo Section 2 (graph / BFS).** Reported at Redo. On an 8×8 chessboard, squares are indexed \`0..63\` as \`row * 8 + col\`. A **bishop** moves any number of squares along a diagonal (empty board, no blockers). Return the **minimum number of moves** to get from \`start\` to \`target\`, or \`-1\` if impossible. Same square ⇒ \`0\`.

\`\`\`ts
function minBishopMoves(start: number, target: number): number
\`\`\`

Model the board as a graph and **BFS** for the shortest path — each move jumps to any square reachable along the four diagonals. (A bishop only ever reaches squares of its own color, so mismatched colors are \`-1\`.)`,
    interviewerNotes: `Reported Redo question — the "graph problems" bucket, BFS shortest path. Strong: BFS from start; neighbors = every square along the 4 diagonal rays to the board edge; return the distance when target is first dequeued; if unreachable (opposite square color) return -1; same square is 0. On an empty board the answer is 0/1/2 for same-colored squares and -1 for opposite color — a candidate who reasons that out (and proves min-2 for same-color-non-same-diagonal) is strong, but BFS is the general, safe solution. Watch for: enumerating only the adjacent diagonal cell instead of the full ray (the bishop slides), not marking visited, off-by-one on index (row*8+col). Hints: (1) "what squares can a bishop reach in one move from here?" (2) "why might the target be unreachable?" (3) "BFS gives shortest path in an unweighted graph — what are your nodes and edges?"`,
    starterCode: `// 8x8 board; square index = row * 8 + col (0..63). Bishop slides any distance
// along a diagonal. Min moves start -> target, or -1 if impossible; same = 0.
function minBishopMoves(start: number, target: number): number {
  // TODO
  return -1;
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  __check("same square", minBishopMoves(0, 0), 0);
  __check("along main diagonal", minBishopMoves(0, 63), 1);
  __check("one diagonal step", minBishopMoves(0, 9), 1);
  __check("anti-diagonal corner", minBishopMoves(56, 7), 1);
  __check("same color two moves", minBishopMoves(0, 2), 2);
  __check("same color two moves b", minBishopMoves(0, 11), 2);
  __check("opposite color impossible", minBishopMoves(0, 1), -1);
  __check("opposite color corner", minBishopMoves(0, 7), -1);
}
`,
    starterCodeJs: `// 8x8 board; square index = row * 8 + col (0..63). Bishop slides any distance
// along a diagonal. Min moves start -> target, or -1 if impossible; same = 0.
function minBishopMoves(start, target) {
  // TODO
  return -1;
}
`,
    starterCodePy: `# 8x8 board; square index = row * 8 + col (0..63). Bishop slides any distance
# along a diagonal. Min moves start -> target, or -1 if impossible; same = 0.
def min_bishop_moves(start, target):
    # TODO
    return -1
`,
    harnessPy: `
def __harness_main():
    __check("same square", min_bishop_moves(0, 0), 0)
    __check("along main diagonal", min_bishop_moves(0, 63), 1)
    __check("one diagonal step", min_bishop_moves(0, 9), 1)
    __check("anti-diagonal corner", min_bishop_moves(56, 7), 1)
    __check("same color two moves", min_bishop_moves(0, 2), 2)
    __check("same color two moves b", min_bishop_moves(0, 11), 2)
    __check("opposite color impossible", min_bishop_moves(0, 1), -1)
    __check("opposite color corner", min_bishop_moves(0, 7), -1)
`,
  },

  // ───────────── CURSOR FDE — STATEFUL BACKEND (evolving) ─────────────
  // The real 45-min format: a small in-memory backend that starts simple and
  // grows as the interviewer adds requirements. Each prompt is written in PARTS
  // (v1 -> v4); the harness tests the final combined API. The interviewer notes
  // tell the agent to reveal parts progressively and reward extend-don't-rewrite.
  // Time-based problems inject the clock (a `now` fn or a `nowMs` arg) so behavior
  // is deterministic. Ships TypeScript + JavaScript starters (JS is the default).
  {
    id: "backend-cache-ttl-lru",
    track: "backend",
    type: "coding",
    title: "In-memory cache: TTL + LRU (builds in parts)",
    est: 40,
    prompt: `Build an in-memory cache. This is the highest-frequency Cursor-FDE-style problem: it starts as a two-method wrapper over a map and grows into a real cache. **Get each part working and running before you look at the next one — later parts must not break earlier ones.**

\`\`\`ts
class Cache {
  // now() is injected so TTL is testable ("pretend it's time X").
  constructor(options?: { maxSize?: number; now?: () => number })
  set(key: string, value: number, ttlMs?: number): void
  get(key: string): number | undefined   // undefined if absent or expired; counts as a use
}
\`\`\`

- **Part 1 — basics.** \`set\` / \`get\` over a \`Map\`. Overwriting a key updates its value.
- **Part 2 — TTL.** \`set(key, value, ttlMs)\` expires the entry \`ttlMs\` after it was written (use the injected \`now()\`). An entry with no \`ttlMs\` never expires. Expire **lazily** on read. Add \`has(key): boolean\` (live presence, does *not* count as a use) and \`delete(key): boolean\`.
- **Part 3 — bounded size + LRU.** Honor \`maxSize\`: when a \`set\` pushes the cache over capacity, evict the **least-recently-used** live entry. \`get\` and a \`set\` that updates an existing key both count as uses. (Ask yourself what a JS \`Map\`'s insertion order gives you for free.) Expired entries must never be evicted in place of a live one.
- **Part 4 — introspection.** \`size(): number\` (live entries only), \`keys(): string[]\` (live keys, least- to most-recently-used), and \`stats(): { hits: number; misses: number }\` (a \`get\` hit vs miss).

Narrate the data-structure choices and the edge cases (missing key, already-expired, negative/zero TTL, capacity 1). Close with what you'd change for production (a real clock source, bounded memory, eager vs lazy sweep, persistence, concurrency).`,
    interviewerNotes: `The flagship evolving-state problem — reveal ONE part at a time; do not hand them Part 3 until Part 1+2 run. Strong: (Part 1) trivial Map. (Part 2) store {value, expiresAt|null}; _isExpired helper comparing this.now(); lazy delete on get; has() checks liveness without touching recency. (Part 3) the classic JS-Map LRU trick — Map preserves insertion order, so delete+re-set on use moves a key to MRU, and map.keys().next().value is the LRU; evict in a while(size>maxSize) loop AFTER purging expired so a live entry isn't evicted while a dead one lingers. (Part 4) size/keys purge expired first; stats counts hit/miss in get. Reward: extending the entry shape and adding helpers instead of rewriting; stable public API as internals grow. Probe: "what does Map insertion order buy you?", "when do you expire — on write, on read, or on a timer?", "capacity 1 — walk me through it", "negative TTL?". Red flags: a second parallel structure that drifts from the Map; eager O(n) sweep every op with no acknowledgement of the cost; forgetting update-counts-as-use. Hint ladder: (a) "how do you know an entry is stale without a background timer?" (b) "which end of the Map is least-recently-used, and how did a key get there?" (c) "before evicting, what should you clear out first?". Production close: real monotonic clock, memory bounds, metrics, shard/Redis for scale.`,
    starterCode: `class Cache {
  constructor(options: { maxSize?: number; now?: () => number } = {}) {
    // TODO: remember maxSize (default Infinity) and now (default () => Date.now())
  }
  set(key: string, value: number, ttlMs?: number): void {
    // TODO
  }
  get(key: string): number | undefined {
    // TODO
    return undefined;
  }
  // Part 2:
  has(key: string): boolean {
    // TODO
    return false;
  }
  delete(key: string): boolean {
    // TODO
    return false;
  }
  // Part 4:
  size(): number {
    // TODO
    return 0;
  }
  keys(): string[] {
    // TODO
    return [];
  }
  stats(): { hits: number; misses: number } {
    // TODO
    return { hits: 0, misses: 0 };
  }
}
`,
    starterCodeJs: `class Cache {
  constructor(options = {}) {
    // options.maxSize (default Infinity), options.now (default () => Date.now())
    // TODO
  }
  set(key, value, ttlMs) {
    // TODO
  }
  get(key) {
    // TODO
    return undefined;
  }
  // Part 2:
  has(key) {
    // TODO
    return false;
  }
  delete(key) {
    // TODO
    return false;
  }
  // Part 4:
  size() {
    // TODO
    return 0;
  }
  keys() {
    // TODO
    return [];
  }
  stats() {
    // TODO
    return { hits: 0, misses: 0 };
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  let T = 0;
  const now = () => T;

  // Part 1 — basics
  const c = new Cache();
  c.set("a", 1);
  c.set("b", 2);
  __check("get existing", c.get("a"), 1);
  __check("get missing", c.get("z"), undefined);
  c.set("a", 10);
  __check("overwrite updates value", c.get("a"), 10);

  // Part 2 — TTL
  const t = new Cache({ now });
  T = 0;
  t.set("k", 5, 100);
  __check("live before expiry", t.get("k"), 5);
  T = 99;
  __check("live just before expiry", t.get("k"), 5);
  T = 100;
  __check("expired at ttl boundary", t.get("k"), undefined);
  T = 0;
  t.set("perm", 7);
  T = 10_000;
  __check("no-ttl entry never expires", t.get("perm"), 7);
  T = 0;
  t.set("h", 1, 50);
  __check("has() live", t.has("h"), true);
  T = 50;
  __check("has() expired", t.has("h"), false);
  T = 0;
  t.set("d", 9);
  __check("delete present", t.delete("d"), true);
  __check("delete missing", t.delete("d"), false);

  // Part 3 — bounded size + LRU
  T = 0;
  const l = new Cache({ maxSize: 2, now });
  l.set("a", 1);
  l.set("b", 2);
  l.get("a");            // a is now most-recently-used
  l.set("c", 3);         // evicts LRU = b
  __check("LRU evicts b", l.get("b"), undefined);
  __check("LRU keeps a", l.get("a"), 1);
  __check("LRU keeps c", l.get("c"), 3);

  const l2 = new Cache({ maxSize: 2, now });
  l2.set("a", 1);
  l2.set("b", 2);
  l2.set("a", 100);      // update counts as a use -> a is MRU
  l2.set("c", 3);        // evicts b
  __check("update refreshes recency", l2.get("b"), undefined);
  __check("updated value survives", l2.get("a"), 100);

  T = 0;
  const l3 = new Cache({ maxSize: 2, now });
  l3.set("old", 1, 100);
  l3.set("keep", 2);
  T = 100;               // "old" now expired
  l3.set("new", 3);      // purge old first; do NOT evict the live "keep"
  __check("expired purged, live kept", l3.get("keep"), 2);
  __check("new entry present", l3.get("new"), 3);

  const one = new Cache({ maxSize: 1, now });
  one.set("x", 1);
  one.set("y", 2);
  __check("capacity 1 evicts", one.get("x"), undefined);
  __check("capacity 1 keeps latest", one.get("y"), 2);

  // Part 4 — introspection
  const s = new Cache({ now });
  T = 0;
  s.set("a", 1);
  s.get("a");            // hit
  s.get("a");            // hit
  s.get("nope");         // miss
  __check("stats hits/misses", s.stats(), { hits: 2, misses: 1 });

  const k = new Cache({ now });
  T = 0;
  k.set("a", 1);
  k.set("b", 2);
  k.set("c", 3);
  k.get("a");            // a -> MRU ; order becomes b, c, a
  __check("keys LRU->MRU order", k.keys(), ["b", "c", "a"]);
  k.set("tmp", 9, 10);
  T = 10;               // tmp expired
  __check("keys excludes expired", k.keys(), ["b", "c", "a"]);
  __check("size excludes expired", k.size(), 3);
}
`,
  },
  {
    id: "backend-rate-limiter",
    track: "backend",
    type: "coding",
    title: "Sliding-window rate limiter (builds in parts)",
    est: 35,
    prompt: `A service needs per-client rate limiting. Build it up in parts; the clock is injected as \`nowMs\` (always monotonically non-decreasing across calls) so the tests are deterministic.

\`\`\`ts
class RateLimiter {
  // limit requests per rolling window of windowMs, per key.
  constructor(limit: number, windowMs: number)
  allow(key: string, nowMs: number): boolean
}
\`\`\`

- **Part 1 — fixed count.** \`allow(key, nowMs)\` returns \`true\` and records the request if the key is under \`limit\`, else \`false\`. Each key is independent.
- **Part 2 — true sliding window.** Make the window *rolling*, not a fixed bucket: a request counts only if it falls within the last \`windowMs\`. Keep a per-key log of timestamps (a list) and drop the ones that have aged out. A request exactly \`windowMs\` old has left the window.
- **Part 3 — remaining.** \`remaining(key, nowMs): number\` — how many more requests the key could make right now.
- **Part 4 — retry hint.** \`retryAfterMs(key, nowMs): number\` — if the key is currently allowed, \`0\`; otherwise the number of ms until the **oldest in-window request** ages out and frees a slot.

Talk through: burst vs sustained rate, how this compares to a token bucket, what "1M keys" does to memory (and how you'd bound it / GC idle keys), and what breaks if a client's clock is skewed. Close with production notes (shared/atomic counter across a fleet, fail-open vs fail-closed).`,
    interviewerNotes: `Distinct from the token-bucket question (openai-rate-limiter) on purpose: this is the sliding-window-LOG design — arrays of timestamps in a Map. Reveal parts progressively. Strong: Map<key, number[]>; a _prune(key, now) that drops timestamps <= now - windowMs (strictly outside the rolling window); allow = prune then (log.length < limit ? push(now), true : false); remaining = max(0, limit - prunedLen); retryAfterMs = allowed ? 0 : oldest + windowMs - now. Reward keeping the log sorted for free by exploiting monotonic nowMs (append-only), and pruning from the front. Probe: window boundary convention (is a request exactly windowMs old in or out — be consistent, tests treat it as OUT); memory unbounded with many keys -> lazy prune on access + evict empty logs, or a periodic sweep; token-bucket comparison (bucket = O(1) state, smooths bursts to a rate; log = exact count, more memory); clock skew (server clock is the truth; injected now makes it testable). Red flags: fixed-window counter presented as sliding (allows 2x burst at the boundary — call it out); recomputing by scanning all keys; off-by-one on the boundary. Hint ladder: (a) "what state per key lets you count requests in the last N ms exactly?" (b) "when a new request comes in, which old ones no longer matter?" (c) "for retry-after, which single timestamp determines when the next slot opens?".`,
    starterCode: `class RateLimiter {
  constructor(limit: number, windowMs: number) {
    // TODO
  }
  allow(key: string, nowMs: number): boolean {
    // TODO
    return false;
  }
  // Part 3:
  remaining(key: string, nowMs: number): number {
    // TODO
    return 0;
  }
  // Part 4:
  retryAfterMs(key: string, nowMs: number): number {
    // TODO
    return 0;
  }
}
`,
    starterCodeJs: `class RateLimiter {
  constructor(limit, windowMs) {
    // TODO
  }
  allow(key, nowMs) {
    // TODO
    return false;
  }
  // Part 3:
  remaining(key, nowMs) {
    // TODO
    return 0;
  }
  // Part 4:
  retryAfterMs(key, nowMs) {
    // TODO
    return 0;
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  const rl = new RateLimiter(3, 1000); // 3 requests / rolling 1000ms

  __check("1st allowed", rl.allow("u", 0), true);
  __check("2nd allowed", rl.allow("u", 100), true);
  __check("3rd allowed", rl.allow("u", 200), true);
  __check("4th denied (over limit)", rl.allow("u", 300), false);
  __check("remaining is 0 when full", rl.remaining("u", 300), 0);
  __check("retryAfter = oldest + window - now", rl.retryAfterMs("u", 300), 700);

  // at t=1000 the first request (t=0) has aged out -> one slot frees
  __check("slot frees as window slides", rl.allow("u", 1000), true);
  __check("still limited right after", rl.allow("u", 1000), false);

  // keys are independent
  __check("other key independent", rl.allow("v", 1000), true);

  // a fresh key: full budget, no wait
  __check("fresh key remaining", rl.remaining("w", 5000), 3);
  __check("fresh key retryAfter 0", rl.retryAfterMs("w", 5000), 0);

  // partial usage reports remaining accurately
  const r2 = new RateLimiter(5, 100);
  r2.allow("k", 0);
  r2.allow("k", 10);
  __check("remaining after 2 of 5", r2.remaining("k", 20), 3);
  __check("allowed when under limit", r2.allow("k", 20), true);
  __check("remaining after 3 of 5", r2.remaining("k", 20), 2);

  // window boundary: a request exactly windowMs old has left the window
  const r3 = new RateLimiter(1, 100);
  __check("boundary: first ok", r3.allow("k", 0), true);
  __check("boundary: 99ms still blocked", r3.allow("k", 99), false);
  __check("boundary: 100ms frees", r3.allow("k", 100), true);
}
`,
  },
  {
    id: "backend-metrics-aggregator",
    track: "backend",
    type: "coding",
    title: "Event metrics aggregator over time windows (builds in parts)",
    est: 35,
    prompt: `Build a lightweight in-memory time-series metrics store: events stream in with timestamps, and callers query aggregates over time windows. Grow it in parts.

\`\`\`ts
class MetricsStore {
  // value defaults to 1 (so a plain event is a counter tick); user is optional.
  record(name: string, ts: number, value?: number, user?: string): void
  count(name: string, start: number, end: number): number   // events in [start, end)
}
\`\`\`

All windows are half-open **[start, end)** — inclusive start, exclusive end.

- **Part 1 — record & count.** Store events per name; \`count\` returns how many landed in the window. Missing name -> \`0\`.
- **Part 2 — sum & average.** \`sum(name, start, end)\` totals the values in the window; \`average(name, start, end)\` is sum/count (\`0\` when the window is empty).
- **Part 3 — unique users.** \`uniqueUsers(name, start, end)\` — the number of distinct \`user\`s among events in the window (events recorded without a user don't count).
- **Part 4 — top events.** \`topEvents(start, end, k)\` — the \`k\` event names with the most events in the window, most-frequent first; break ties alphabetically.

Events can arrive out of order. Narrate the storage choice (\`Map<name, event[]>\` + filter is fine at this scale) and — when asked to scale — how you'd pre-aggregate into time buckets or keep the arrays sorted for binary-searched ranges. Close with production notes (bounded retention, pre-aggregation, approximate distinct counts like HyperLogLog).`,
    interviewerNotes: `Time-windowed aggregation — maps + lists + a set, evolving. Reveal parts progressively. Strong: Map<name, Array<{ts,value,user}>>; record defaults value to 1 and user to null; a shared _inWindow(name,start,end) helper filtering ts>=start && ts<end reused by every query; sum via reduce; average guards divide-by-zero -> 0; uniqueUsers builds a Set skipping null users; topEvents counts each name in the window, sorts by count desc then name asc, slices k. Reward the reused window helper and correct half-open semantics. Probe: out-of-order arrivals (filter handles it; sorted-insert + binary search is the scale answer); what to pre-aggregate if this were 1B events (fixed time buckets: minute/hour rollups, trade granularity for memory); distinct-count at scale (HLL, approximate); rounding for average (keep raw, round at the edge). Red flags: inclusive-inclusive or off-by-one window; per-event recomputation of everything; forgetting missing-name -> 0/empty. Hint ladder: (a) "what's the one filtering step every query shares?" (b) "average of an empty window — what do you return?" (c) "for top-k, do you need a full sort of all names or just the ones with events?".`,
    starterCode: `class MetricsStore {
  record(name: string, ts: number, value: number = 1, user?: string): void {
    // TODO
  }
  count(name: string, start: number, end: number): number {
    // TODO
    return 0;
  }
  // Part 2:
  sum(name: string, start: number, end: number): number {
    // TODO
    return 0;
  }
  average(name: string, start: number, end: number): number {
    // TODO
    return 0;
  }
  // Part 3:
  uniqueUsers(name: string, start: number, end: number): number {
    // TODO
    return 0;
  }
  // Part 4:
  topEvents(start: number, end: number, k: number): string[] {
    // TODO
    return [];
  }
}
`,
    starterCodeJs: `class MetricsStore {
  record(name, ts, value = 1, user) {
    // TODO
  }
  count(name, start, end) {
    // TODO
    return 0;
  }
  // Part 2:
  sum(name, start, end) {
    // TODO
    return 0;
  }
  average(name, start, end) {
    // TODO
    return 0;
  }
  // Part 3:
  uniqueUsers(name, start, end) {
    // TODO
    return 0;
  }
  // Part 4:
  topEvents(start, end, k) {
    // TODO
    return [];
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  // Part 1 — record & count
  const m = new MetricsStore();
  m.record("login", 10);
  m.record("login", 20);
  m.record("login", 100);
  __check("count in [0,50)", m.count("login", 0, 50), 2);
  __check("count is half-open", m.count("login", 10, 20), 1); // 10 in, 20 out
  __check("count all", m.count("login", 0, 1000), 3);
  __check("count missing name", m.count("nope", 0, 1000), 0);

  // Part 2 — sum & average (values arrive out of order too)
  m.record("purchase", 25, 300);
  m.record("purchase", 5, 100);
  m.record("purchase", 15, 200);
  __check("sum all", m.sum("purchase", 0, 100), 600);
  __check("sum window", m.sum("purchase", 10, 30), 500); // 200 + 300
  __check("average", m.average("purchase", 0, 100), 200);
  __check("average empty window -> 0", m.average("purchase", 1000, 2000), 0);

  // Part 3 — unique users
  m.record("view", 1, undefined, "alice");
  m.record("view", 2, undefined, "bob");
  m.record("view", 3, undefined, "alice");
  m.record("view", 50, undefined, "carol");
  m.record("view", 60); // no user -> not counted
  __check("unique users in window", m.uniqueUsers("view", 0, 10), 2);
  __check("unique users all", m.uniqueUsers("view", 0, 1000), 3);

  // Part 4 — top events (login=3, purchase=3, view=5 in [0,1000))
  __check("topEvents k=2 (tie -> alpha)", m.topEvents(0, 1000, 2), ["view", "login"]);
  __check("topEvents k=1", m.topEvents(0, 1000, 1), ["view"]);
  __check("topEvents narrow window", m.topEvents(0, 4, 3), ["view"]); // only view has events in [0,4)
}
`,
  },
  {
    id: "backend-booking",
    track: "backend",
    type: "coding",
    title: "Resource booking with overlap & capacity (builds in parts)",
    est: 40,
    prompt: `Build a booking system for time-based resources (rooms, GPU slots, tables). Intervals are half-open **[start, end)**, so \`[0,10)\` and \`[10,20)\` do **not** overlap. Grow it in parts.

\`\`\`ts
class BookingSystem {
  constructor(capacity?: number)   // max concurrent bookings per resource; default 1
  // Returns a booking id, or null if it can't be booked.
  book(resource: string, user: string, start: number, end: number): string | null
  isAvailable(resource: string, start: number, end: number): boolean
}
\`\`\`

- **Part 1 — book & availability.** With the default capacity of 1, \`book\` succeeds only if the requested window doesn't overlap an existing booking on that resource; return a unique id on success, \`null\` on conflict (or on an invalid \`start >= end\`). \`isAvailable\` reports whether a window could be booked. Resources are independent.
- **Part 2 — cancel & list.** \`cancel(id): boolean\` frees the slot. \`listByResource(resource)\` returns the resource's bookings \`{ id, user, start, end }\` sorted by start (then end). \`listByUser(user)\` returns that user's booking ids in creation order.
- **Part 3 — capacity > 1.** Honor the constructor \`capacity\`: a resource may hold up to \`capacity\` **concurrently overlapping** bookings. A new booking is allowed only if, at every instant it covers, fewer than \`capacity\` bookings already overlap. \`isAvailable\` reflects this.

Narrate how you detect overlap, and for Part 3 how you check the *maximum concurrency* across the requested window (a sweep over start/end events is the clean way). Discuss what you'd add next — a waitlist, temporary holds that expire during checkout, idempotent confirms — and the production concerns (atomic reserve step / no double-book under concurrency, persistence).`,
    interviewerNotes: `Interval overlap + capacity, evolving. Note: systems-booking is the DESIGN version; this is the coding version. Reveal parts progressively. Strong: store bookings in a Map<id, {resource,user,start,end}>; overlap of [s,e) and [bs,be) is s < be && bs < e (touching endpoints don't conflict). Part 1 capacity-1 = reject if any overlap. Part 3 general: compute max concurrency across the requested window via a sweep — collect (max(bstart,s),+1) and (min(bend,e),-1) for bookings overlapping [s,e), sort by coordinate processing -1 before +1 at ties (so half-open touching doesn't count), track running max; available iff max < capacity. Reward: half-open handled consistently; capacity-1 falling out of the general check; sorted list output; ids stable/unique. Probe: invalid interval (start>=end -> null); why touching intervals are fine; the concurrency invariant ("at no instant may > capacity overlap"); the concurrency/atomicity story for production (check-then-book is a TOCTOU race — the real system needs the reserve to be atomic). Red flags: comparing only endpoints not the whole window; counting touching intervals as overlap; O(n) per check with no path to better; capacity handled by a separate ad-hoc branch that diverges from Part 1. Hint ladder: (a) "what's the boolean test for two half-open intervals overlapping?" (b) "with capacity C, it's no longer yes/no per pair — what quantity across the window matters?" (c) "sweep the start(+1)/end(-1) events — what's the max running sum you'll tolerate?".`,
    starterCode: `class BookingSystem {
  constructor(capacity: number = 1) {
    // TODO
  }
  book(resource: string, user: string, start: number, end: number): string | null {
    // TODO
    return null;
  }
  isAvailable(resource: string, start: number, end: number): boolean {
    // TODO
    return false;
  }
  // Part 2:
  cancel(id: string): boolean {
    // TODO
    return false;
  }
  listByResource(resource: string): Array<{ id: string; user: string; start: number; end: number }> {
    // TODO
    return [];
  }
  listByUser(user: string): string[] {
    // TODO
    return [];
  }
}
`,
    starterCodeJs: `class BookingSystem {
  constructor(capacity = 1) {
    // TODO
  }
  book(resource, user, start, end) {
    // TODO
    return null;
  }
  isAvailable(resource, start, end) {
    // TODO
    return false;
  }
  // Part 2:
  cancel(id) {
    // TODO
    return false;
  }
  listByResource(resource) {
    // TODO
    return [];
  }
  listByUser(user) {
    // TODO
    return [];
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  // Part 1 — book & availability (capacity 1)
  const bs = new BookingSystem();
  const a = bs.book("room1", "alice", 0, 10);
  __check("first booking gets an id", typeof a, "string");
  __check("overlap rejected", bs.book("room1", "bob", 5, 15), null);
  __check("touching interval ok", typeof bs.book("room1", "bob", 10, 20), "string");
  __check("other resource independent", typeof bs.book("room2", "carol", 0, 10), "string");
  __check("invalid interval rejected", bs.book("room1", "x", 5, 5), null);
  __check("isAvailable false on overlap", bs.isAvailable("room1", 5, 8), false);
  __check("isAvailable true on gap", bs.isAvailable("room1", 20, 25), true);

  // Part 2 — cancel & list
  __check("cancel frees slot", bs.cancel(a as string), true);
  __check("cancel missing id", bs.cancel("nope"), false);
  __check("rebook after cancel", typeof bs.book("room1", "dave", 0, 5), "string");

  const q = new BookingSystem();
  q.book("r", "u1", 30, 40);
  q.book("r", "u2", 0, 10);
  q.book("r", "u3", 15, 20);
  __check("listByResource sorted by start", q.listByResource("r").map((b) => b.start), [0, 15, 30]);
  __check("listByResource shape", q.listByResource("r")[0].user, "u2");

  const u = new BookingSystem();
  const s1 = u.book("r1", "sam", 0, 5) as string;
  const s2 = u.book("r2", "sam", 0, 5) as string;
  u.book("r1", "pat", 10, 15);
  __check("listByUser in creation order", u.listByUser("sam"), [s1, s2]);

  // Part 3 — capacity > 1
  const cap = new BookingSystem(2);
  __check("cap2 first overlap ok", typeof cap.book("gpu", "a", 0, 10), "string");
  __check("cap2 second overlap ok", typeof cap.book("gpu", "b", 0, 10), "string");
  __check("cap2 third overlap rejected", cap.book("gpu", "c", 0, 10), null);
  __check("cap2 at capacity not available", cap.isAvailable("gpu", 5, 8), false);
  __check("cap2 non-overlapping ok", typeof cap.book("gpu", "d", 10, 20), "string");
  __check("cap2 partial-overlap respects max concurrency", cap.book("gpu", "e", 8, 12), null);
}
`,
  },
  {
    id: "backend-scheduler",
    track: "backend",
    type: "coding",
    title: "Delayed job scheduler (builds in parts)",
    est: 35,
    prompt: `Build an in-memory scheduler for delayed work. There's no real timer — the caller drives time by passing \`now\` to \`getDue\`. Grow it in parts.

\`\`\`ts
class Scheduler {
  schedule(id: string, runAt: number, payload: string): void
  // Returns the payloads of all tasks due at or before now, in run order,
  // and removes/advances them so each fires once per due time.
  getDue(now: number): string[]
}
\`\`\`

- **Part 1 — schedule & drain.** \`schedule\` registers a one-shot task; \`getDue(now)\` returns the payloads of tasks with \`runAt <= now\`, earliest \`runAt\` first, and removes them (a one-shot fires exactly once). \`pending(): number\` reports how many tasks remain.
- **Part 2 — cancel.** \`cancel(id): boolean\` removes a task before it fires. Re-scheduling an existing id replaces it.
- **Part 3 — priorities.** \`schedule(id, runAt, payload, priority?)\` (default \`0\`). When multiple tasks are due at the same \`runAt\`, higher priority fires first; ties keep insertion order.
- **Part 4 — recurring.** \`scheduleRecurring(id, firstRunAt, intervalMs, payload)\` fires at \`firstRunAt\`, then every \`intervalMs\`. In one \`getDue\` call a recurring task fires **at most once** even if several intervals were missed — after firing, its next run is the first multiple strictly after \`now\`.

Narrate the ordering rules and, when asked to scale, why a min-heap (or a sorted structure) keyed on \`runAt\` beats scanning every task each tick. Close with production notes (a real timer/clock, durability so scheduled work survives a restart, retries/backoff on failure).`,
    interviewerNotes: `Delayed-work scheduler — time-ordered state that evolves. Reveal parts progressively; a scan-and-filter over a Map is fine at this scale, but they should NAME the heap as the scale answer. Strong: Map<id, {id,runAt,payload,priority,intervalMs|null,seq}> with a monotonic seq for stable ties; getDue filters runAt<=now, sorts by runAt asc, then priority desc, then seq asc; one-shots are deleted after firing, recurring advance runAt to firstRun + k*interval (smallest strictly > now) firing once even if multiple intervals elapsed; pending = map size (recurring stay pending). Part 2: cancel = map.delete; re-schedule replaces (same id key). Reward: consistent comparator across parts; the missed-interval "fire once, catch up next" rule; not firing a recurring task multiple times in one drain. Probe: ordering tie-breaks; what "fires once" means for a recurring task after a long gap; heap vs scan complexity (getDue is O(n log n) scan vs O(k log n) heap pops); durability for production. Red flags: recurring task that fires N times for N missed intervals in a single getDue; unstable ordering; forgetting to remove fired one-shots (they'd re-fire). Hint ladder: (a) "how do you return due tasks in the right order?" (b) "a recurring task hasn't been polled for 10 intervals — how many times should it fire this call, and when's its next run?" (c) "at scale, what structure avoids scanning every task each tick?".`,
    starterCode: `class Scheduler {
  schedule(id: string, runAt: number, payload: string, priority: number = 0): void {
    // TODO
  }
  getDue(now: number): string[] {
    // TODO
    return [];
  }
  // Part 1:
  pending(): number {
    // TODO
    return 0;
  }
  // Part 2:
  cancel(id: string): boolean {
    // TODO
    return false;
  }
  // Part 4:
  scheduleRecurring(id: string, firstRunAt: number, intervalMs: number, payload: string): void {
    // TODO
  }
}
`,
    starterCodeJs: `class Scheduler {
  schedule(id, runAt, payload, priority = 0) {
    // TODO
  }
  getDue(now) {
    // TODO
    return [];
  }
  // Part 1:
  pending() {
    // TODO
    return 0;
  }
  // Part 2:
  cancel(id) {
    // TODO
    return false;
  }
  // Part 4:
  scheduleRecurring(id, firstRunAt, intervalMs, payload) {
    // TODO
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  // Part 1 — schedule & drain
  const s = new Scheduler();
  s.schedule("a", 100, "task-a");
  s.schedule("b", 50, "task-b");
  s.schedule("c", 200, "task-c");
  __check("nothing due yet", s.getDue(10), []);
  __check("due in run order", s.getDue(150), ["task-b", "task-a"]);
  __check("one-shots removed after firing", s.getDue(150), []);
  __check("later task still pending", s.pending(), 1);
  __check("drain the rest", s.getDue(200), ["task-c"]);
  __check("pending now 0", s.pending(), 0);

  // Part 2 — cancel & replace
  const s2 = new Scheduler();
  s2.schedule("x", 10, "x");
  s2.schedule("y", 20, "y");
  __check("cancel returns true", s2.cancel("x"), true);
  __check("cancel missing false", s2.cancel("zzz"), false);
  s2.schedule("y", 5, "y2"); // replace y
  __check("reschedule replaces", s2.getDue(100), ["y2"]);

  // Part 3 — priorities at the same runAt
  const s3 = new Scheduler();
  s3.schedule("lo", 10, "lo", 1);
  s3.schedule("hi", 10, "hi", 5);
  s3.schedule("mid", 10, "mid", 3);
  __check("higher priority first", s3.getDue(10), ["hi", "mid", "lo"]);

  // Part 4 — recurring
  const s4 = new Scheduler();
  s4.scheduleRecurring("beat", 0, 100, "beat");
  __check("recurring fires at first run", s4.getDue(0), ["beat"]);
  __check("not due before next interval", s4.getDue(50), []);
  __check("fires next interval", s4.getDue(100), ["beat"]);
  __check("recurring stays pending", s4.pending(), 1);
  __check("missed intervals fire once", s4.getDue(1000), ["beat"]);
  __check("next run is after now", s4.getDue(1050), []);
  __check("fires at the caught-up run", s4.getDue(1100), ["beat"]);
}
`,
  },
  {
    id: "backend-session-store",
    track: "backend",
    type: "coding",
    title: "Conversation/session store with token budget (builds in parts)",
    est: 35,
    prompt: `Very Cursor-flavored: build the store behind an AI chat's conversation memory. Messages accumulate per session; callers fetch history under a token budget; idle sessions expire. Grow it in parts. The clock is injected so expiry is testable.

\`\`\`ts
class SessionStore {
  constructor(options?: { idleTtlMs?: number; now?: () => number })
  addMessage(session: string, role: string, content: string, tokens: number): void
  getHistory(session: string): Array<{ role: string; content: string; tokens: number }>
}
\`\`\`

- **Part 1 — append & read.** \`addMessage\` appends to a session (creating it on first use); \`getHistory\` returns its messages in order. Unknown session -> \`[]\`. Add \`tokenCount(session): number\` (sum of the session's message tokens).
- **Part 2 — token budget.** \`getHistory(session, maxTokens?)\` — when \`maxTokens\` is given, return only the **most recent** messages whose token total fits within the budget, still in chronological order. Take newest-first until the next message wouldn't fit; if even the newest single message exceeds the budget, return \`[]\`.
- **Part 3 — clear.** \`clear(session): boolean\` drops a session.
- **Part 4 — idle expiry.** With \`idleTtlMs\` set, a session expires once \`now() - lastActivity >= idleTtlMs\` (any \`addMessage\` counts as activity and refreshes it). An expired session reads as empty (\`getHistory\` -> \`[]\`, \`tokenCount\` -> \`0\`).

Narrate the trade-off between last-N and token-budget truncation for LLM context, and what production would add (summarizing older turns instead of dropping them, real clock, per-session size caps, persistence). Close on how this maps to Cursor's own chat-context economics.`,
    interviewerNotes: `Session/conversation memory with a token budget and TTL — maps + lists + injected clock, evolving. On-brand for Cursor. Reveal parts progressively. Strong: Map<session, {msgs: Msg[], lastActive: number}>; a _live(session) helper that lazily expires (now()-lastActive >= idleTtlMs -> delete, return undefined) reused by every read; addMessage refreshes lastActive and appends; getHistory with no budget returns a copy in order; with a budget, walk from the newest accumulating tokens, stop before exceeding, reverse to chronological; newest-alone-too-big -> []. tokenCount sums live msgs. Reward: the reused liveness helper; budget truncation from the correct (recent) end; copying so callers can't mutate internal state. Probe: budget boundary (exact fit included; single oversized newest -> []); TTL boundary (>= vs >, and that add refreshes it); last-N vs token-budget for real LLM context (token-budget matches the model's real limit; last-N is cruder); production (summarize-don't-drop, durable store, size caps). Red flags: truncating from the OLD end (drops recent context — wrong); off-by-one on the budget or TTL; expiry that requires a background sweep to work (should be lazy on access). Hint ladder: (a) "which end of the history do you keep when you must cut?" (b) "the newest message alone blows the budget — what comes back?" (c) "how do you expire an idle session without a timer thread?".`,
    starterCode: `class SessionStore {
  constructor(options: { idleTtlMs?: number; now?: () => number } = {}) {
    // TODO: idleTtlMs (default Infinity), now (default () => Date.now())
  }
  addMessage(session: string, role: string, content: string, tokens: number): void {
    // TODO
  }
  getHistory(session: string, maxTokens?: number): Array<{ role: string; content: string; tokens: number }> {
    // TODO
    return [];
  }
  // Part 1:
  tokenCount(session: string): number {
    // TODO
    return 0;
  }
  // Part 3:
  clear(session: string): boolean {
    // TODO
    return false;
  }
}
`,
    starterCodeJs: `class SessionStore {
  constructor(options = {}) {
    // options.idleTtlMs (default Infinity), options.now (default () => Date.now())
    // TODO
  }
  addMessage(session, role, content, tokens) {
    // TODO
  }
  getHistory(session, maxTokens) {
    // TODO
    return [];
  }
  // Part 1:
  tokenCount(session) {
    // TODO
    return 0;
  }
  // Part 3:
  clear(session) {
    // TODO
    return false;
  }
}
`,
    harness: `
async function __harnessMain(): Promise<void> {
  // Part 1 — append & read
  const ss = new SessionStore();
  ss.addMessage("s1", "user", "hi", 5);
  ss.addMessage("s1", "assistant", "hello", 8);
  __check("history in order", ss.getHistory("s1").map((m) => m.content), ["hi", "hello"]);
  __check("token count", ss.tokenCount("s1"), 13);
  __check("unknown session empty", ss.getHistory("none"), []);

  // Part 2 — token budget (keep the most recent that fit)
  const b = new SessionStore();
  b.addMessage("s", "user", "m1", 10);
  b.addMessage("s", "assistant", "m2", 10);
  b.addMessage("s", "user", "m3", 10);
  b.addMessage("s", "assistant", "m4", 10);
  __check("budget keeps newest that fit", b.getHistory("s", 25).map((m) => m.content), ["m3", "m4"]);
  __check("budget exact fit", b.getHistory("s", 20).map((m) => m.content), ["m3", "m4"]);
  __check("budget covers all", b.getHistory("s", 100).map((m) => m.content), ["m1", "m2", "m3", "m4"]);
  __check("budget too small for any", b.getHistory("s", 5), []);

  // Part 3 — clear
  __check("clear returns true", b.clear("s"), true);
  __check("cleared reads empty", b.getHistory("s"), []);

  // Part 4 — idle expiry
  let T = 0;
  const now = () => T;
  const e = new SessionStore({ idleTtlMs: 1000, now });
  T = 0;
  e.addMessage("s", "user", "hi", 3);
  T = 500;
  __check("live before ttl", e.getHistory("s").map((m) => m.content), ["hi"]);
  e.addMessage("s", "user", "again", 4); // refreshes lastActivity to 500
  T = 1499;
  __check("refresh extends life", e.tokenCount("s"), 7);
  T = 1500;
  __check("expired after idle ttl", e.getHistory("s"), []);
  __check("expired token count 0", e.tokenCount("s"), 0);
}
`,
  },
];

export const QUESTIONS: Map<string, Question> = new Map(Q.map((q) => [q.id, q]));

export function questionsForTrack(track: Track): Question[] {
  return Q.filter((q) => q.track === track);
}
