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
    | "end";
  questionId?: string;
  data: Record<string, unknown>;
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
}

const ROOT = path.join(__dirname, "..", "sessions");
const sessions = new Map<string, Session>();

export function createSession(
  track: Track,
  mode: Mode,
  durationMin: number,
  checkinMin: number,
  questionIds: string[]
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
  };
  sessions.set(id, s);
  persist(s);
  return s;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
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
