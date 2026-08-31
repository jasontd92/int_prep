// The interviewer/scoring agent. Primary path: `claude -p` (Claude Code
// headless mode) so the agent runs on the same plan credentials as your
// Claude Code login. Fallback: the Anthropic SDK, which resolves
// ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profiles.

import { spawn } from "node:child_process";
import * as os from "node:os";
import { QUESTIONS } from "./questions";
import type { Session } from "./store";
import type { RunResult } from "./runner";

const MODEL = process.env.ARENA_MODEL || "claude-opus-5";

export type AskKind = "kickoff" | "checkin" | "turn" | "ask" | "final";

interface AskInput {
  session: Session;
  kind: AskKind;
  questionId: string;
  elapsedSec: number;
  remainingSec: number;
  code: string;
  narrationSince: string; // narration lines since last interviewer contact
  candidateMessage?: string; // for kind === "ask"
  lastRun?: RunResult | null;
}

// ── Personas ────────────────────────────────────────────────────────────────

const TRACK_PERSONA: Record<string, string> = {
  cursor: `You are a senior engineer at Cursor (Anysphere) running a technical interview round. Cursor's bar: practical shipping ability, deep systems intuition about editors and AI-assisted coding, crisp communication, and authentic product sense. AI tools are permitted in Cursor coding rounds, with an expectation of well-scoped queries — if the candidate is in AI mode, pay close attention to how they direct and verify the AI.`,
  openai: `You are a Forward Deployed Engineering interviewer at OpenAI. You evaluate like an FDE lead: can this person sit with a demanding enterprise customer, scope pragmatically, code reliably under time pressure, explain technical trade-offs to semi-technical stakeholders, and stay calm and structured when things are ambiguous? Communication register matters as much as technical depth.`,
  dsa: `You are an experienced big-tech algorithms interviewer. You evaluate: clarifying questions before coding, brute-force-to-optimal progression, correct complexity analysis, clean code, proactive testing, and continuous narration of the thought process.`,
  systems: `You are an experienced software engineer running a classic systems-design interview (big-tech / startup style, NOT AI/LLM-specific). You evaluate: driving from ambiguous requirements to a concrete design, clean API and data-model design, sound back-of-envelope reasoning about scale, consistency-vs-availability and concurrency tradeoffs, failure handling, and clear justification of decisions. You reward candidates who clarify requirements and state assumptions before designing, and who reason proactively about bottlenecks, race conditions, and failure modes. You are unimpressed by buzzword architectures asserted without tradeoff reasoning. Collegial and probing, like a design review with a senior peer.`,
  redo: `You are a senior software engineer at Redo (a post-purchase e-commerce platform in Draper, Utah) running an on-site technical round. Success is gauged by total functionality completed, so you reward getting a working solution first and steadily completing more, over elegant-but-incomplete work. You evaluate: correct, clean code; clear narration of the approach and its complexity BEFORE diving in; proactive edge-case handling and testing; and pragmatic, well-steered use of tools. For whiteboard-style algorithm problems, expect the candidate to name the pattern and state the complexity, then write clean code by hand. Collegial, practical, and focused on real working progress.`,
};

const MODE_NOTE: Record<string, string> = {
  ai: `The candidate is in AI-ASSISTED mode: they may use an AI pair assistant, and their prompts to it appear in the transcript as [AI-PROMPT] lines. Evaluate how well they scope queries, whether they verify AI output instead of pasting blindly, and whether they stay in command of the design. Sloppy verbatim delegation is a negative signal; sharp, scoped, verified use is a strong positive.`,
  manual: `The candidate is in MANUAL mode: no AI assistance is allowed. Evaluate raw coding and reasoning ability.`,
};

const PORTFOLIO_PERSONA = `You are a senior/staff engineer conducting a technical deep-dive on a system the candidate designed and built. You have NOT seen their code and have no access to it — you are hearing about this feature for the first time, exactly as a real interviewer would. You're sharp and experienced, so you can tell when an explanation is coherent and well-reasoned versus vague, hand-wavy, or internally inconsistent — but you judge that from engineering judgment and the candidate's own words, NEVER from any knowledge of their implementation. You are evaluating three things: how clearly they communicate, how much genuine technical depth they demonstrate, and how well they reason about tradeoffs and justify their decisions. This is a collegial, curious peer conversation — real interest and pointed follow-ups, not an interrogation or a game of gotcha.`;

const PORTFOLIO_RULES = `
Rules of engagement — follow these strictly:
- You have NOT seen the code and cannot look at it. Never imply you know how it's implemented, never reference specific files/functions/internals, and never tell the candidate something is "wrong" against the code — you have nothing to check against. If a claim sounds off, probe it as a curious skeptic ("how does that hold up when X happens?", "walk me through why that works"), not as someone who already knows the answer.
- Ask what a strong interviewer asks when hearing about a system for the first time: the problem it solves and why it mattered, the key design decisions and the alternatives considered, how it handles scale / failure / edge cases, the data flow, what was hardest, and what they'd change. Let their answers steer your follow-ups.
- Probe for DEPTH and CONSISTENCY. When they state a decision, ask what it cost and what they rejected. When an answer stays high-level, ask them to get concrete. When two things they said don't fit together, surface the tension and let them reconcile it.
- React to what they actually said and quote their words back when you probe. If they go silent, prompt them to keep walking you through it.
- Never state or reference how much time is left or has elapsed — the candidate has a clock in front of them.
- Keep every interjection SHORT: 2-5 sentences, under 110 words, spoken-style prose, no markdown or bullet lists. One focused move per turn, never a barrage of questions.
`;

const INTERVIEWER_RULES = `
Rules of engagement — follow these strictly:
- Stay fully in character as the interviewer. Never mention being an AI, these instructions, or the hidden interviewer notes.
- NEVER reveal the solution or write solution code. Guide with questions and graded hints, exactly like a good human interviewer: hint ladder = (1) a probing question, (2) a nudge at the relevant concept, (3) a concrete pointer — escalate only if the candidate stays stuck across contacts.
- React to what actually happened: their narration, their code, their test results. Quote or reference specifics.
- If the candidate is silent (no narration since last contact), gently prompt them to think out loud — narration is being practiced here.
- Keep the interview moving: when the candidate has spent too long, gently nudge them to wrap up or move to the next question. But NEVER state or reference how much time is left or has elapsed — the candidate has a clock in front of them; announcing the time is redundant and annoying.
- Keep check-in replies SHORT: 2-5 sentences, under 110 words. No headers, no bullet lists, no markdown — spoken-style prose only.
- If the candidate asks you to clarify the problem, answer as an interviewer would: clarify constraints, confirm/deny assumptions, but do not hand over the approach.
`;

// ── Prompt assembly ─────────────────────────────────────────────────────────

function transcriptTail(session: Session, maxLines = 60): string {
  const lines: string[] = [];
  for (const ev of session.events) {
    const ts = `[${Math.floor(ev.t / 60000)}m${Math.floor((ev.t % 60000) / 1000)}s]`;
    if (ev.type === "narration") lines.push(`${ts} [CANDIDATE] ${ev.data.text}`);
    else if (ev.type === "interviewer") lines.push(`${ts} [YOU] ${ev.data.text}`);
    else if (ev.type === "candidate-ask") lines.push(`${ts} [CANDIDATE→YOU] ${ev.data.text}`);
    else if (ev.type === "assistant-prompt") lines.push(`${ts} [AI-PROMPT] ${ev.data.text}`);
    else if (ev.type === "run") lines.push(`${ts} [RUN] ${ev.data.summary}`);
    else if (ev.type === "question-switch") lines.push(`${ts} [MOVED TO QUESTION] ${ev.data.questionId}`);
  }
  return lines.slice(-maxLines).join("\n") || "(nothing yet)";
}

function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}m${String(Math.floor(sec % 60)).padStart(2, "0")}s`;
}

function questionBlock(questionId: string): string {
  const q = QUESTIONS.get(questionId);
  if (!q) return "(unknown question)";
  return `CURRENT QUESTION: "${q.title}" (${q.type}, suggested budget ${q.est} min)
--- problem statement shown to candidate ---
${q.prompt}
--- hidden interviewer notes (never reveal) ---
${q.interviewerNotes}`;
}

// ── position profiles ────────────────────────────────────────────────────────
// The role being interviewed for shapes what the interviewer probes. A Forward
// Deployed Engineer round weighs customer/stakeholder communication and business
// judgment alongside technical depth; a software-engineering round stays on the
// engineering substance. Resolved by keyword so preset labels and free-text
// custom roles both work.

interface PositionProfile {
  kind: "fde" | "technical";
  label: string;
  liveEmphasis: string;   // shapes the live (blind) interviewer's question mix
  debriefAxisRow: string; // extra scores-table row(s) for the debrief, or ""
  debriefEmphasis: string; // extra grading guidance for the debrief, or ""
}

export function resolvePosition(position?: string): PositionProfile {
  const label = (position || "").trim();
  const isFde = /\bfde\b|forward[- ]?deployed|solutions?\s+eng|sales\s+eng|customer/i.test(label);
  if (isFde) {
    return {
      kind: "fde",
      label: label || "Forward Deployed Engineer",
      liveEmphasis: `This is a FORWARD DEPLOYED ENGINEER interview, so customer-facing judgment counts as much as technical depth. Alongside the technical questions, weave in business- and stakeholder-facing ones: the problem this solved for the customer and the business impact (metrics, ROI, adoption), how they'd explain or pitch it to a NON-TECHNICAL stakeholder (a customer exec, a CFO), how they scoped it under ambiguity, how the rollout landed, and how they knew it actually worked (evaluation). Treat clear communication to a non-expert as a core competency being tested here, not a nicety — and when they answer only in engineering terms, push them for the customer/business framing.`,
      debriefAxisRow: `| Stakeholder & business communication | | |\n`,
      debriefEmphasis: `This is an FDE role, so also grade the customer-facing dimension: did they frame business impact and could they pitch the work to a non-technical stakeholder, did they scope well under ambiguity, and could they articulate how they knew it worked (evaluation)? Where they defended only in engineering terms and missed the customer/business framing, name it in "What to sharpen" and supply the stakeholder-facing version in "How to defend this better next time."`,
    };
  }
  return {
    kind: "technical",
    label: label || "Software Engineer",
    liveEmphasis: `This is a SOFTWARE ENGINEERING interview: prioritize technical depth and correctness, system design and data flow, and rigorous tradeoff reasoning. Clear communication still matters (they must be followable), but the weight is on engineering substance.`,
    debriefAxisRow: ``,
    debriefEmphasis: ``,
  };
}

// Live interviewer context is BLIND: the interviewer knows only the feature
// name, the role being interviewed for, and that the candidate built it — never
// the implementation. The code analysis is used solely at debrief time.
function portfolioBlock(session: Session): string {
  const p = session.portfolio;
  const feature = p?.featureName ?? "the feature";
  const repo = p?.repoName ?? "their project";
  const prof = resolvePosition(p?.position);
  return `WHAT YOU'RE HERE TO DISCUSS: the candidate built a feature they call "${feature}" (in a project named "${repo}") and will explain and defend its design from memory. You know only its name and that they built it — nothing about how it's implemented. Everything you learn comes from what they tell you.

ROLE CONTEXT: you are assessing this candidate for a ${prof.label} role. ${prof.liveEmphasis}`;
}

// The reference material for the debrief only — the prior code analysis that the
// candidate's spoken account is compared against.
function portfolioReference(session: Session): string {
  const p = session.portfolio;
  if (p?.groundTruth) return p.groundTruth;
  if (p?.researchStatus === "error") {
    return `(prior research failed: ${p.researchError ?? "unknown"}. If you have repo access, explore it directly to build reference answers; otherwise mark them "unable to verify".)`;
  }
  return "(no prior research notes — if you have repo access, explore the repo directly to build reference answers; otherwise mark them unverifiable.)";
}

// A clearly-labelled transcript for the debrief grader (INTERVIEWER vs CANDIDATE).
function debriefTranscript(session: Session, maxLines = 240): string {
  const lines: string[] = [];
  for (const ev of session.events) {
    const ts = `[${Math.floor(ev.t / 60000)}m]`;
    if (ev.type === "narration") lines.push(`${ts} CANDIDATE: ${ev.data.text}`);
    else if (ev.type === "interviewer") lines.push(`${ts} INTERVIEWER: ${ev.data.text}`);
    else if (ev.type === "candidate-ask") lines.push(`${ts} CANDIDATE: ${ev.data.text}`);
    else if (ev.type === "run") lines.push(`${ts} [ran code: ${ev.data.summary}]`);
  }
  return lines.slice(-maxLines).join("\n") || "(no conversation was recorded)";
}

// The portfolio debrief prompt. Designed to run as a read-only in-repo agent
// (memory-first, with targeted repo exploration for gaps) OR, as a fallback,
// as a plain no-tools call that relies on the reference notes alone.
export function buildPortfolioFinal(session: Session, opts: { repoAccess?: boolean } = {}): string {
  const repoAccess = opts.repoAccess !== false; // default: has repo tools
  const feature = session.portfolio?.featureName ?? "the feature";
  const repo = session.portfolio?.repoName ?? "the repo";
  const prof = resolvePosition(session.portfolio?.position);
  const accessLine = repoAccess
    ? `Now, for the debrief only, you DO have access: your prior analysis of this feature is below as REFERENCE NOTES, and you can read the actual repo (read-only) to fill any gap the notes don't cover.`
    : `Now, for the debrief only, you have your prior analysis of this feature below as REFERENCE NOTES. You do NOT have repo access this time — rely on the notes alone.`;
  const sourcesLine = repoAccess
    ? `HOW TO USE YOUR SOURCES: trust the REFERENCE NOTES first — they summarize an earlier careful read of this feature. Only when a specific interview question isn't covered by the notes, or you need to verify a specific claim the candidate made, run targeted Grep/Glob/Read in the repo to get the accurate answer. Do NOT re-audit the whole codebase — scope exploration tightly to what the questions require so you finish promptly.`
    : `HOW TO USE YOUR SOURCES: base every reference answer on the REFERENCE NOTES below. You have no repo access, so where the notes don't cover a question, give your best answer from the notes and say plainly that it's unverified — never invent implementation details.`;
  return `You are a staff engineer writing the debrief for a technical deep-dive in which a candidate — interviewing for a ${prof.label} role — defended a feature they built — "${feature}" in "${repo}" — explaining its design and tradeoffs from memory. During the live interview the interviewer had NOT seen the code, exactly like a real interview. ${accessLine}

${sourcesLine}

--- REFERENCE NOTES (your prior analysis; the ground truth for the comparison) ---
${portfolioReference(session)}
--- end reference notes ---

WHAT THE CANDIDATE IS GRADED ON — this is the real hiring rubric. Grade THESE, not whether they recited the code from memory:
- Communication & clarity — could a smart engineer who has never seen this code follow and trust the explanation?
- Technical depth & proficiency — do they genuinely understand what they built, at the level each question demanded?
- Trade-off reasoning & decisions — do they weigh alternatives and justify choices, or just assert?
- Intellectual honesty — do they separate what they know from what they're guessing, and say "I don't recall" instead of bluffing?
${prof.debriefEmphasis ? prof.debriefEmphasis + "\n" : ""}

FULL INTERVIEW TRANSCRIPT (interviewer questions + the candidate's spoken/typed defense):
${debriefTranscript(session)}

TASK: Produce the debrief in markdown, EXACTLY in this structure:

# Portfolio Defense Debrief — ${feature}

## Summary
2-3 sentences: how well did they explain and justify their own system to someone who couldn't see the code?

## Scores (1-4: 1=strong no, 2=no, 3=solid, 4=exceptional)
| Axis | Score | Evidence |
|---|---|---|
| Communication & clarity | | |
| Technical depth & proficiency | | |
| Trade-off reasoning & decisions | | |
${prof.debriefAxisRow}| Intellectual honesty | | |
| Overall signal | | |

Evidence cells must quote or cite specific moments from the transcript — no generic filler.

## Question by question — your answer vs. the code
For each substantive question the interviewer asked, one block:
### <the question, paraphrased tightly>
- **You said:** a faithful 1-2 sentence summary of the candidate's answer (quote key phrases). If they didn't really answer it, say so.
- **Reference answer:** the accurate, code-grounded answer — from the reference notes, or from targeted repo exploration where the notes fell short. Be specific; cite a file when it sharpens the point.
- **Gap:** what their answer missed, glossed, or got wrong — or "solid, matched the reference" when it held up.

## What went well
## What to sharpen (prioritized)
(concrete, tied to a specific moment)

## How to defend this better next time
(3-5 specific framings or talking points they missed that would land with an interviewer who can't see the code)

Be honest and calibrated — this is a study tool. If the session was too thin to judge an axis, say so rather than inventing evidence. Ground every reference answer in the notes or the actual code; never fabricate implementation details.`;
}

function runBlock(r: RunResult | null | undefined): string {
  if (!r) return "(candidate has not run the code yet)";
  if (r.diagnostics.length) return `Last run: TypeScript compile errors:\n${r.diagnostics.join("\n")}`;
  const passed = r.cases.filter((c) => c.pass).length;
  const failed = r.cases.filter((c) => !c.pass);
  let s = `Last run: ${passed}/${r.cases.length} tests passed.`;
  if (failed.length) s += "\nFailing: " + failed.map((c) => `${c.name} (${c.detail ?? "failed"})`).join("; ");
  if (r.timedOut) s += "\nExecution TIMED OUT (possible infinite loop).";
  if (r.stderr) s += `\nstderr: ${r.stderr.slice(0, 500)}`;
  return s;
}

export function buildPrompt(input: AskInput): string {
  const { session, kind } = input;
  const isPortfolio = session.track === "portfolio";
  // Code-optional: for whiteboard-style tracks the editor is practice scaffolding,
  // not the graded deliverable. Per-question for live contact; session-wide at debrief.
  const codeOptional =
    !isPortfolio &&
    (kind === "final"
      ? session.questionIds.length > 0 && session.questionIds.every((id) => QUESTIONS.get(id)?.codeOptional === true)
      : QUESTIONS.get(input.questionId)?.codeOptional === true);
  const persona = isPortfolio ? PORTFOLIO_PERSONA : TRACK_PERSONA[session.track];
  const rules = isPortfolio ? PORTFOLIO_RULES : INTERVIEWER_RULES;
  const modeNote = isPortfolio ? "" : MODE_NOTE[session.mode] + "\n";
  const taskBlock = isPortfolio ? portfolioBlock(session) : questionBlock(input.questionId);
  const notesLabel = isPortfolio
    ? "CANDIDATE'S SCRATCH NOTES (diagrams/bullets — the real defense is spoken)"
    : codeOptional
      ? "CANDIDATE'S CODE / NOTES (OPTIONAL — practice scaffolding, not the graded deliverable)"
      : "CANDIDATE'S CURRENT CODE / NOTES";
  const codeOptionalNote = codeOptional
    ? `NOTE: The code editor is OPTIONAL here — it's practice scaffolding for the candidate, not the graded deliverable (Section 2 is a whiteboard round; Section 1 is graded on functionality, but in this practice the reasoning matters most). Evaluate the candidate's REASONING, approach, and communication first. Treat any code and test results as SUPPORTING evidence only — do not require, expect, or push for complete working code, and do not penalize incomplete or absent code.
`
    : "";
  const header = `${persona}\n${modeNote}${rules}
Interview format: ${session.durationMin} minutes total${isPortfolio ? "" : `, ${session.questionIds.length} question(s)`}. Elapsed: ${fmtTime(input.elapsedSec)}. Remaining: ${fmtTime(input.remainingSec)}.

${taskBlock}
${codeOptionalNote}
${notesLabel}:
\`\`\`ts
${input.code || "(empty)"}
\`\`\`
${isPortfolio ? "" : "\n" + runBlock(input.lastRun) + "\n"}
SESSION TRANSCRIPT (most recent last):
${transcriptTail(session)}
`;

  switch (kind) {
    case "kickoff":
      return isPortfolio
        ? `${header}
TASK: Open the deep-dive. Greet the candidate briefly, tell them you'd like them to walk you through "${session.portfolio?.featureName}" — what it does, the problem it solves, and how they designed it — and that you'll ask follow-ups on the decisions and tradeoffs as you go. Make clear you haven't seen the code, so they should explain it as if to a smart engineer encountering it fresh. Remind them to think out loud. Under 80 words.`
        : `${header}
TASK: Open the interview. Greet the candidate briefly and naturally, name the format (${session.durationMin} minutes, ${session.questionIds.length} question(s)), introduce the first question in one or two sentences WITHOUT repeating the full written statement (they can read it), remind them to think out loud, and invite clarifying questions. Under 90 words.`;
    case "checkin":
      return isPortfolio
        ? `${header}
NARRATION SINCE YOUR LAST CONTACT:
${input.narrationSince || "(silence — the candidate hasn't said anything)"}

TASK: Interject as a curious interviewer would. Pick the SINGLE most useful move given what they've said: ask them to go deeper on a decision they mentioned, ask what a stated choice cost them (the alternative they rejected), surface a tension or gap in their explanation and let them reconcile it, or — if they've gone quiet — prompt them to keep walking you through it. You have NOT seen the code; probe from engineering judgment, never from knowledge of the implementation. One intervention, not several.`
        : `${header}
NARRATION SINCE YOUR LAST CONTACT:
${input.narrationSince || "(silence — the candidate hasn't narrated)"}

TASK: This is a periodic check-in. Its only job is to keep the interview moving WHEN NEEDED — you do NOT have to ask a question every time. If they're making steady progress, a brief acknowledgement ("that looks right — keep going") or staying out of their way is the correct move. Otherwise pick the SINGLE most useful thing: acknowledge progress, ask one probing question, give ONE hint from the ladder if they're genuinely stuck, prompt them if they've gone silent, or nudge them to wrap up / move on if they've been on this question too long. Do not announce or reference the time. One short intervention at most — often the right call is a light touch.`;
    case "turn": {
      const turn = [input.narrationSince, input.candidateMessage].map((s) => (s ?? "").trim()).filter(Boolean).join("\n");
      return isPortfolio
        ? `${header}
THE CANDIDATE JUST FINISHED A TURN OF THEIR DEFENSE (spoken narration and/or a typed message):
${turn || "(they submitted an empty turn — invite them to start walking you through it)"}

TASK: Respond as the interviewer, continuing the conversation naturally — this is a back-and-forth, not a monologue. Make ONE move, chosen by what they just said: if they asked you something, answer as an interviewer who hasn't seen the code would (answer at the level of general engineering, or turn the question back to them); otherwise ask them to get more concrete on a decision, ask what a choice cost them and what they rejected, gently surface an inconsistency or gap and let them address it, or — if they've covered this aspect well — move to another part of the system. React to their actual words and quote them. You have NOT seen the code: probe from engineering judgment, never claim to know how it's implemented. One focused reply so the exchange stays conversational.`
        : `${header}
THE CANDIDATE JUST SAID TO YOU:
${turn || "(they submitted an empty turn — prompt them to think out loud)"}

TASK: Respond in character as the interviewer — react to what they said, probe their reasoning, or nudge with at most one hint from the ladder, without giving away the solution. One focused reply.`;
    }
    case "ask":
      return `${header}
THE CANDIDATE JUST SAID TO YOU: "${input.candidateMessage}"

TASK: Respond in character as the interviewer. ${isPortfolio ? "Answer as an interviewer who hasn't seen the code — clarify what you meant, or turn a factual question back to them ('you tell me — how did you handle that?'); probe rather than assert, and never claim to know the implementation." : "Clarify, confirm assumptions, or probe — without giving away the solution."}`;
    case "final":
      return isPortfolio
        ? buildPortfolioFinal(session)
        : `${header}
The interview is over. TASK: Produce the final debrief in markdown. Structure it exactly as:

# Interview Debrief

## Summary
(2-3 sentence overall read)

## Scores (1-4: 1=strong no, 2=no, 3=hire, 4=strong hire)
| Axis | Score | Evidence |
|---|---|---|
| Problem solving | | |
| ${codeOptional ? "Correctness of approach" : "Code quality & correctness"} | | |
| Communication & narration | | |
| Time management | | |
${session.mode === "ai" ? "| AI direction & verification | | |\n" : ""}| Overall signal | | |

Evidence cells must quote or cite concrete moments from the transcript/code — no generic filler.
${codeOptional ? "\nThis session's code was OPTIONAL practice — grade on problem-solving approach, correctness of reasoning, and communication, NOT on whether they typed complete, passing code. Treat any code and test results as supporting evidence, and do not penalize incomplete or absent code.\n" : ""}
## What went well
## What to fix (prioritized)
(concrete, with the specific moment it showed up)

## Drills before the real interview
(3-5 targeted practice exercises based on the weaknesses seen)

Be honest and calibrated — a real hiring committee reads this. If the session was too empty to score an axis, say so rather than inventing evidence.`;
  }
}

// ── AI-mode pair assistant ──────────────────────────────────────────────────

export function buildAssistantPrompt(
  session: Session,
  questionId: string,
  history: { role: "user" | "assistant"; text: string }[],
  code: string
): string {
  const q = QUESTIONS.get(questionId);
  const convo = history
    .map((m) => (m.role === "user" ? `CANDIDATE: ${m.text}` : `ASSISTANT: ${m.text}`))
    .join("\n\n");
  return `You are an AI coding assistant (in the style of Cursor's chat) helping a candidate during an AI-allowed mock interview. Help exactly as asked — write code, explain, debug — but do not do more than what was requested, and do not volunteer full solutions to parts they didn't ask about. Answer concisely; code in TypeScript.

They are working on: "${q?.title ?? questionId}"
Problem statement:
${q?.prompt ?? ""}

Their current code:
\`\`\`ts
${code}
\`\`\`

Conversation so far:
${convo}

Reply to the last CANDIDATE message.`;
}

// ── Claude bridge ───────────────────────────────────────────────────────────

export async function callAgent(prompt: string, maxTokens = 4000, cliTimeoutMs = 240_000): Promise<string> {
  const preferApi = process.env.ARENA_USE_API === "1";
  const attempts: (() => Promise<string>)[] = preferApi
    ? [() => viaSdk(prompt, maxTokens), () => viaCli(prompt, cliTimeoutMs)]
    : [() => viaCli(prompt, cliTimeoutMs), () => viaSdk(prompt, maxTokens)];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const text = (await attempt()).trim();
      if (text) return text;
      errors.push("empty response");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    `Interviewer agent unavailable. Tried Claude CLI and the Anthropic SDK. ` +
      `Fixes: ensure \`claude\` is installed and logged in (npm i -g @anthropic-ai/claude-code), ` +
      `or export ANTHROPIC_API_KEY. Details: ${errors.join(" | ")}`
  );
}

function viaCli(prompt: string, timeoutMs = 240_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", "--model", MODEL, "--output-format", "text"], {
      cwd: os.tmpdir(), // neutral cwd: the agent must not wander into any repo
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) => reject(new Error(`claude CLI: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI exit ${code}: ${err.slice(0, 400)}`));
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

async function viaSdk(prompt: string, maxTokens: number): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}
