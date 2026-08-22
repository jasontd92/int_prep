# Interview Arena

Timed mock-interview practice for **Cursor FDE**, **OpenAI FDE**, and **classic DS&A**, with an AI interviewer that checks in on a clock, hints without spoiling, and writes you a scored debrief.

```bash
npm install
npm run arena      # → http://localhost:4321
```

---

## What's in it

**Three tracks, 26 questions.**

| Track | Questions | Focus |
|---|---|---|
| Cursor FDE | 11 | Merkle diff, text buffers, Tab prediction, monorepo indexing, streaming edits, apply models, eval strategy, agent harnesses, context-window economics, inference cost, the work-trial meta-question |
| OpenAI FDE | 7 | Token-bucket limiter, retry/backoff, cost attribution, enterprise RAG with ACLs, LLM gateway, a "the model got worse" escalation, one-week POC scoping |
| Classic DS&A | 10 | Two Sum, valid parens, merge intervals, LRU cache, binary-search bounds, sliding window, linked lists, islands, top-K, topological sort |

The Cursor set is drawn from [ombharatiya/AI-Engineer-Interview-Questions](https://github.com/ombharatiya/AI-Engineer-Interview-Questions/blob/main/14-company-interview-questions/cursor-anysphere.md) — including the reported work-trial format and the "AI tools allowed, with scoped-query expectations" wrinkle.

**Two modes.**
- **Manual** — you write every line. Raw coding signal.
- **AI** — a pair assistant (Cursor-chat style) is available in its own tab, *and every prompt you send it is logged and scored*. The debrief gets an extra axis: did you scope your queries well and verify the output, or paste blindly? This mirrors how Cursor actually runs coding rounds.

**Real TypeScript compiler.** Your code is typechecked by `tsc` with `strict: true`, then executed in a sandboxed child process (10s timeout, no environment variables passed through). Compile errors are reported against *your* line numbers; errors that land in the hidden test harness are labeled as a signature mismatch instead of a confusing line reference. Coding questions ship with real test suites — 5–15 cases each, including the edge cases an interviewer would probe.

**The interviewer agent** runs on your existing Claude Code login: it shells out to `claude -p` first, and falls back to the Anthropic SDK (`ANTHROPIC_API_KEY`, or an `ant auth login` profile) if the CLI isn't there. It sees your code, your test results, your narration, and the clock — and it holds hidden per-question notes (what good looks like, a three-step hint ladder, the red flags to probe) that it will not reveal.

**Timers and check-ins.** Set duration and check-in cadence at setup (default: 60 minutes, every 7). The interviewer interjects on that schedule the way a real one does — acknowledging progress, probing complexity, dropping *one* hint if you're stuck, prompting you when you go silent, or warning you that you're over budget on question one. The clock turns amber at 5 minutes and red at 2; hitting zero ends the interview and triggers the debrief.

**Voice.** Speech-to-text narration (Web Speech API — Chrome works best) streams your spoken reasoning into the transcript, so the interviewer reacts to what you *said*, not just what you typed. Text-to-speech reads the interviewer's messages aloud. Prefer typing? There's a narration box next to the mic button.

**The debrief.** At the end you get a markdown scorecard: 1–4 scores across problem solving, code quality, communication, time management (plus AI direction in AI mode), each cell citing specific moments from your transcript — then what went well, prioritized fixes, and 3–5 targeted drills. It's saved to `sessions/<id>-debrief.md` alongside the full JSON event log.

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

`npm run verify` is the guard on question quality: it runs a known-good solution through each harness and asserts all cases pass, then asserts that unmodified starter code *fails* — so a harness can never be silently vacuous. All 15 coding harnesses pass.

**Adding a question**: append to `Q` in `server/questions.ts` (`prompt` is what the candidate sees, `interviewerNotes` is hidden and shapes the agent's hints, `harness` defines `__harnessMain` using `__check`/`__checkSet`), add a reference solution to `scripts/verify-harnesses.ts`, and run `npm run verify`.

```
server/questions.ts    question bank + hidden interviewer notes
server/runner.ts       tsc typecheck + sandboxed execution
server/interviewer.ts  personas, prompt assembly, Claude CLI/SDK bridge
server/store.ts        session event log + debrief persistence
web/main.ts            editor, timers, voice, chat panels
```

`sessions/` is gitignored — your transcripts stay local.
