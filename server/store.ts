// Session persistence: every session gets a JSON event log under sessions/,
// plus a markdown debrief at the end. This is the observability record the
// interviewer agent reads from and that you can review after practice.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Track } from "./questions";

export type Mode = "ai" | "manual";

export interface SessionEvent {
  t: number; // ms since session start
  type:
    | "start"
    | "narration" // voice-to-text or typed narration
    | "run" // code run with results summary
    | "snapshot" // periodic code snapshot
    | "interviewer" // interviewer message shown
    | "candidate-ask" // candidate asked the interviewer something
    | "assistant-prompt" // AI-mode: candidate's prompt to the pair assistant
    | "assistant-reply"
    | "question-switch"
    | "research-hit" // portfolio: served fresh from the memory cache
    | "research-refresh" // portfolio: cache stale/missing, agent re-researched
    | "research-error" // portfolio: research failed
    | "ground-truth" // portfolio: the researched writeup (revealed after answering)
    | "end";
  questionId?: string;
  data: Record<string, unknown>;
}

export interface PortfolioConfig {
  repoPath: string;
  repoName: string;
  featureName: string;
  featureSlug: string;
  position?: string; // role being interviewed for (e.g. "Forward Deployed Engineer (FDE)")
  groundTruth?: string; // filled once research completes
  researchStatus?: "pending" | "hit" | "refreshed" | "created" | "error";
  researchError?: string;
  savedTo?: string; // memory file path
}

export interface Session {
  id: string;
  createdAt: string;
  track: Track;
  mode: Mode;
  durationMin: number;
  checkinMin: number;
  questionIds: string[];
  events: SessionEvent[];
  code: Record<string, string>; // latest code per question
  ended: boolean;
  portfolio?: PortfolioConfig; // set only for the portfolio-defense track
}

const ROOT = path.join(__dirname, "..", "sessions");
const sessions = new Map<string, Session>();

export function createSession(
  track: Track,
  mode: Mode,
  durationMin: number,
  checkinMin: number,
  questionIds: string[],
  portfolio?: PortfolioConfig
): Session {
  const id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + track;
  const s: Session = {
    id,
    createdAt: new Date().toISOString(),
    track,
    mode,
    durationMin,
    checkinMin,
    questionIds,
    events: [{ t: 0, type: "start", data: { track, mode, durationMin, checkinMin, questionIds } }],
    code: {},
    ended: false,
    portfolio,
  };
  sessions.set(id, s);
  persist(s);
  return s;
}

/** Records the outcome of background research on a portfolio session. */
export function setPortfolioResearch(
  id: string,
  patch: Partial<PortfolioConfig>
): void {
  const s = sessions.get(id);
  if (!s || !s.portfolio) return;
  s.portfolio = { ...s.portfolio, ...patch };
  persist(s);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

// ── past-session review (reads from disk, survives restarts) ──────────────────

export interface SessionSummary {
  id: string;
  createdAt: string;
  track: Track;
  mode: Mode;
  durationMin: number;
  ended: boolean;
  hasDebrief: boolean;
  title: string;
  elapsedSec: number;
}

function sessionTitle(s: Session): string {
  if (s.track === "portfolio" && s.portfolio) {
    return `${s.portfolio.featureName} · ${s.portfolio.repoName}`;
  }
  const n = s.questionIds.length;
  return `${s.track.toUpperCase()} · ${n} question${n === 1 ? "" : "s"}`;
}

/** Lists every saved session (newest first) by reading the sessions/ dir. */
export function listSessions(): SessionSummary[] {
  if (!fs.existsSync(ROOT)) return [];
  const out: SessionSummary[] = [];
  for (const name of fs.readdirSync(ROOT)) {
    if (!name.endsWith(".json")) continue; // debriefs are .md; skip anything else
    const id = name.slice(0, -".json".length);
    try {
      const s: Session = JSON.parse(fs.readFileSync(path.join(ROOT, name), "utf8"));
      const lastT = s.events?.length ? s.events[s.events.length - 1].t : 0;
      out.push({
        id,
        createdAt: s.createdAt,
        track: s.track,
        mode: s.mode,
        durationMin: s.durationMin,
        ended: !!s.ended,
        hasDebrief: fs.existsSync(path.join(ROOT, `${id}-debrief.md`)),
        title: sessionTitle(s),
        elapsedSec: Math.floor(lastT / 1000),
      });
    } catch {
      /* skip unreadable/partial files */
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Loads a session straight from disk (in-memory map may be empty post-restart). */
export function loadSessionFromDisk(id: string): Session | undefined {
  if (!/^[\w.:-]+$/.test(id)) return undefined; // guard against path escapes
  const p = path.join(ROOT, `${id}.json`);
  if (!fs.existsSync(p)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Session;
  } catch {
    return undefined;
  }
}

/** Returns a session's saved debrief markdown, or null if none was written. */
export function readDebrief(id: string): string | null {
  if (!/^[\w.:-]+$/.test(id)) return null;
  const p = path.join(ROOT, `${id}-debrief.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function addEvent(id: string, ev: SessionEvent): void {
  const s = sessions.get(id);
  if (!s) return;
  s.events.push(ev);
  if (ev.questionId && typeof ev.data.code === "string") {
    s.code[ev.questionId] = ev.data.code;
  }
  persist(s);
}

export function endSession(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.ended = true;
  persist(s);
}

export function writeDebrief(id: string, markdown: string): string {
  fs.mkdirSync(ROOT, { recursive: true });
  const file = path.join(ROOT, `${id}-debrief.md`);
  fs.writeFileSync(file, markdown);
  return file;
}

function persist(s: Session): void {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(path.join(ROOT, `${s.id}.json`), JSON.stringify(s, null, 2));
}

/**
 * Deletes every trace of a session — the in-memory record, the event log, and
 * any debrief already written. Used by "discard & exit" so an abandoned
 * practice run leaves nothing behind.
 */
export function discardSession(id: string): void {
  // Session ids are server-generated; reject anything that could escape ROOT.
  if (!/^[\w.:-]+$/.test(id)) return;
  sessions.delete(id);
  for (const name of [`${id}.json`, `${id}-debrief.md`]) {
    fs.rmSync(path.join(ROOT, name), { force: true });
  }
}
