# Interview Arena

Timed mock-interview practice for **Cursor FDE**, **OpenAI FDE**, **classic DS&A / systems design**, and the **Redo** senior-SWE bank, with an AI interviewer that checks in on a clock, hints without spoiling, and writes you a scored debrief.

```bash
npm install
npm run arena      # → http://localhost:4321
```

---

## What's in it

**Seven tracks, 45 static questions (+ your own repos).**

| Track | Questions | Focus |
|---|---|---|
| Cursor FDE | 11 | Merkle diff, text buffers, Tab prediction, monorepo indexing, streaming edits, apply models, eval strategy, agent harnesses, context-window economics, inference cost, the work-trial meta-question |
| Cursor FDE — Stateful Backend | 6 | The **actual 45-min live-coding format**: an in-memory backend that starts simple and grows part by part. TTL+LRU cache, sliding-window rate limiter, metrics aggregator, resource booking, delayed-job scheduler, conversation/session store — maps, lists, queues, and injected clocks. TS + JS starters (JS default). |
| OpenAI FDE | 7 | Token-bucket limiter, retry/backoff, cost attribution, enterprise RAG with ACLs, LLM gateway, a "the model got worse" escalation, one-week POC scoping |
| Classic DS&A | 10 | Two Sum, valid parens, merge intervals, LRU cache, binary-search bounds, sliding window, linked lists, islands, top-K, topological sort |
| Classic Systems Design | 7 | URL shortener, news feed, chat, notification fan-out, booking (no double-book), distributed KV/cache, distributed rate limiter |
| Redo (Senior SWE) | 4 | Stubbed Othello CLI, build-tree from traversals (LC 105), increasing paths (LC 2328), bishop-BFS. TS + JS + Python. |
| Portfolio Defense | *your repos* | Defend a feature **you** built against the actual code — architecture, tradeoffs, decisions. See below. |

The Cursor set is drawn from [ombharatiya/AI-Engineer-Interview-Questions](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/14-company-interview-questions/cursor-anysphere.md) — including the reported work-trial format and the "AI tools allowed, with scoped-query expectations" wrinkle.

The **Stateful Backend** track matches the official Cursor FDE guide most directly: *"live coding on a stateful backend problem … later parts build on earlier ones … requirements will evolve … not finishing every part is expected."* Each prompt is written in incremental parts (v1 → v4); the interviewer reveals them one at a time and rewards **extending** your objects rather than rewriting them. Practice these in JavaScript with constant narration.

**Two modes.**
- **Manual** — you write every line. Raw coding signal.
- **AI** — a pair assistant (Cursor-chat style) is available in its own tab, *and every prompt you send it is logged and scored*. The debrief gets an extra axis: did you scope your queries well and verify the output, or paste blindly? This mirrors how Cursor actually runs coding rounds.

**Real TypeScript compiler.** Your code is typechecked by `tsc` with `strict: true`, then executed in a sandboxed child process (10s timeout, no environment variables passed through). Compile errors are reported against *your* line numbers; errors that land in the hidden test harness are labeled as a signature mismatch instead of a confusing line reference. Coding questions ship with real test suites — 5–15 cases each, including the edge cases an interviewer would probe.

**The interviewer agent** runs on your existing Claude Code login: it shells out to `claude -p` first, and falls back to the Anthropic SDK (`ANTHROPIC_API_KEY`, or an `ant auth login` profile) if the CLI isn't there. It sees your code, your test results, your narration, and the clock — and it holds hidden per-question notes (what good looks like, a three-step hint ladder, the red flags to probe) that it will not reveal.

**Timers and check-ins.** Set duration and check-in cadence at setup (default: 60 minutes, every 7). The interviewer interjects on that schedule the way a real one does — acknowledging progress, probing complexity, dropping *one* hint if you're stuck, prompting you when you go silent, or warning you that you're over budget on question one. The clock turns amber at 5 minutes and red at 2; hitting zero ends the interview and triggers the debrief.

**Voice.** Speech-to-text narration (Web Speech API — Chrome works best) streams your spoken reasoning into the transcript, so the interviewer reacts to what you *said*, not just what you typed. Text-to-speech reads the interviewer's messages aloud, through a **voice picker** in the topbar next to the 🔊 button. Prefer typing? There's a narration box next to the mic button.

**Using macOS Enhanced / Premium / Siri voices for the interviewer.** The default system voice sounds robotic; macOS ships far more natural ones, but they must be *downloaded* before any browser can see them:

1. **System Settings › Accessibility › Spoken Content › System Voice › Manage Voices** (the ⓘ / "Manage Voices…" button).
2. Download an **Enhanced** or **Premium** English voice (e.g. *Ava (Premium)*, *Zoe (Premium)*), or a **Siri** voice. Premium ≈ several hundred MB each and are the most natural.
3. Reload the arena and pick that voice in the topbar dropdown — it previews as you select. The app auto-defaults to the most natural voice it finds (Premium/Enhanced/Siri/Neural first) and remembers your choice.

**Browser matters for which voices appear:** **Safari** exposes the full macOS set including Enhanced/Premium/Siri — use it for the best interviewer voice. Chrome only exposes a subset (its own Google voices plus some system voices) and often hides the Premium ones. So: Chrome for the most reliable *speech-to-text*, Safari for the most natural *interviewer voice* — pick per what you're practicing, or run STT by typing and use Safari for great TTS.

**The debrief.** At the end you get a markdown scorecard: 1–4 scores across problem solving, code quality, communication, time management (plus AI direction in AI mode), each cell citing specific moments from your transcript — then what went well, prioritized fixes, and 3–5 targeted drills. It's saved to `sessions/<id>-debrief.md` alongside the full JSON event log.

---

## Portfolio Defense — defend your own architecture against the code

A different kind of round: instead of a canned problem, you defend a feature **you actually built**, and the interviewer grades your account against the real implementation. It's an A/B — you explain from memory while a research agent reads the code — so vagueness and misremembering get caught.

**How it works.** At setup, pick the *Portfolio Defense* track, give a **repo path on your machine** and the **feature to defend** ("the caching layer", "auth token refresh"). On start:

1. A **research agent** — `claude -p` run *inside that repo* with a **read-only** tool set (Read/Grep/Glob/LS, nothing that can modify the code) — locates and reads the implementation and writes a ground-truth technical summary.
2. The interviewer opens the defense and, using that ground truth as hidden notes, probes your spoken account: when you state a decision it asks what it cost; when you're inaccurate it pushes back **without handing you the answer**.
3. The debrief scores **Accuracy vs. the actual code**, **Tradeoff reasoning & depth**, **Communication**, and **Intellectual honesty**, with a **Corrections** section ("you said X → the code actually does Y"). The agent's ground-truth writeup is then **revealed** below the debrief as a study aid.

**The memory cache.** Research findings persist as markdown "memory files" under a sibling directory — `~/.interview-arena/memory/<repo-name>/<feature-slug>.md` (override with `ARENA_MEMORY_DIR`). Each file carries the technical summary, key file pointers, and tradeoffs, plus frontmatter recording the repo HEAD sha and the git blob sha of every key file. That frontmatter is a real cache:

- **Repeat a question on an unchanged feature → instant.** One `git rev-parse` confirms the writeup is still current; the agent never re-runs.
- **Smart invalidation.** If HEAD moved but no file backing *this* feature changed, it stays fresh. Only when a key file actually changed (committed *or* uncommitted in your working tree) does it re-research — warm-started from the old writeup. Non-git repos fall back to a 14-day TTL.

So practicing the same feature repeatedly is cheap; the agent only pays to re-read when your code has genuinely moved.

**Requirements.** Portfolio Defense needs the `claude` CLI (the research agent uses its tools — the SDK path has no filesystem access). The memory files are yours to read; nothing about your repos is committed to this project.

---

## Using it

Pick a track, set the clock, choose questions (or take the default two), pick a mode, and start. Then:

| | |
|---|---|
| `⌘/Ctrl+Enter` | Run your code |
| Question / Interviewer / Assistant tabs | Prompt, interviewer feed, AI pair (AI mode only) |
| 🎙 Mic | Toggle voice narration |
| 🔊 Voice | Interviewer speaks aloud |
| Ask box | Ask the interviewer a clarifying question, as you would in a real round |
| Next question → | Move on (the interviewer is told) |
| End interview | Stop early and generate the debrief |
| Discard & exit | Bail out with no record — deletes the session log, writes no debrief |

**Narrate constantly.** The interviewer scores silence harshly and the debrief will call it out — which is the entire point of practicing here rather than in a text editor.

Design and scenario questions have no tests; the editor is scratch space for interfaces and notes, and the round is scored on your reasoning and narration.

---

## Configuration

| Env var | Default | |
|---|---|---|
| `ARENA_PORT` | `4321` | Server port |
| `ARENA_MODEL` | `claude-opus-5` | Interviewer model |
| `ARENA_USE_API` | unset | Set to `1` to try the Anthropic SDK before the `claude` CLI |

## Development

```bash
npm run verify      # run reference solutions against every test harness
npm run typecheck   # tsc --noEmit
npm run build       # bundle the frontend
```

`npm run verify` is the guard on question quality: it runs a known-good solution through each harness and asserts all cases pass, then asserts that unmodified starter code *fails* — so a harness can never be silently vacuous. All 25 coding harnesses pass.

**Adding a question**: append to `Q` in `server/questions.ts` (`prompt` is what the candidate sees, `interviewerNotes` is hidden and shapes the agent's hints, `harness` defines `__harnessMain` using `__check`/`__checkSet`), add a reference solution to `scripts/verify-harnesses.ts`, and run `npm run verify`.

```
server/questions.ts    question bank + hidden interviewer notes + portfolio synthetic Q
server/runner.ts       tsc typecheck + sandboxed execution
server/interviewer.ts  personas (incl. portfolio judge), prompt assembly, Claude CLI/SDK bridge
server/research.ts     read-only research agent (the A/B "B" side)
server/memory.ts       memory-file cache + git-sha invalidation
server/store.ts        session event log + debrief persistence
web/main.ts            editor, timers, voice, chat panels
```

**Discard & exit** is for throwaway runs — a false start, a question you'd rather restart, or practice you don't want scored. It deletes the session's event log and any debrief from disk and drops you back at setup. It asks for confirmation first, and cancelling leaves the clock running.

`sessions/` is gitignored — your transcripts stay local.
