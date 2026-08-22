// Interview arena server: static UI + JSON APIs for running code,
// talking to the interviewer agent, and logging the session.

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { TRACKS, QUESTIONS, questionsForTrack, type Track } from "./questions";
import { runCode, type RunResult } from "./runner";
import {
  createSession,
  getSession,
  addEvent,
  endSession,
  discardSession,
  writeDebrief,
  type Mode,
} from "./store";
import { buildPrompt, buildAssistantPrompt, callAgent, type AskKind } from "./interviewer";

const PORT = Number(process.env.ARENA_PORT || 4321);
const ROOT = path.join(__dirname, "..");

const lastRunBySession = new Map<string, RunResult>();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET") return serveStatic(url.pathname, res);
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      const body = await readBody(req);
      const result = await handleApi(url.pathname, body);
      return json(res, 200, result);
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(res, 500, { error: message });
  }
});

async function handleApi(pathname: string, body: any): Promise<unknown> {
  switch (pathname) {
    case "/api/tracks": {
      return {
        tracks: TRACKS.map((t) => ({
          ...t,
          questions: questionsForTrack(t.id).map((q) => ({
            id: q.id,
            title: q.title,
            type: q.type,
            est: q.est,
          })),
        })),
      };
    }

    case "/api/session/start": {
      const track = body.track as Track;
      const mode = body.mode as Mode;
      const durationMin = clamp(Number(body.durationMin) || 60, 10, 180);
      const checkinMin = clamp(Number(body.checkinMin) || 7, 3, 20);
      let questionIds: string[] = Array.isArray(body.questionIds) ? body.questionIds : [];
      questionIds = questionIds.filter((id) => QUESTIONS.get(id)?.track === track);
      if (questionIds.length === 0) {
        questionIds = TRACKS.find((t) => t.id === track)?.defaultPick ?? [];
      }
      const session = createSession(track, mode, durationMin, checkinMin, questionIds);
      return {
        sessionId: session.id,
        questionIds,
        questions: questionIds.map((id) => {
          const q = QUESTIONS.get(id)!;
          return { id: q.id, title: q.title, type: q.type, est: q.est, prompt: q.prompt, starterCode: q.starterCode };
        }),
      };
    }

    case "/api/session/discard": {
      const id = String(body.sessionId ?? "");
      discardSession(id);
      lastRunBySession.delete(id);
      return { ok: true };
    }

    case "/api/run": {
      const { sessionId, questionId, code, t } = body;
      const result = runCode(String(questionId), String(code ?? ""));
      if (getSession(sessionId)) {
        lastRunBySession.set(sessionId, result);
        const summary = result.diagnostics.length
          ? `compile errors (${result.diagnostics.length})`
          : result.timedOut
            ? "timed out"
            : result.cases.length
              ? `${result.cases.filter((c) => c.pass).length}/${result.cases.length} tests passed`
              : "ran (no tests for this question)";
        addEvent(sessionId, { t: Number(t) || 0, type: "run", questionId, data: { summary, code } });
      }
      return result;
    }

    case "/api/event": {
      const { sessionId, type, questionId, t, data } = body;
      if (getSession(sessionId)) {
        addEvent(sessionId, { t: Number(t) || 0, type, questionId, data: data ?? {} });
      }
      return { ok: true };
    }

    case "/api/interviewer": {
      const { sessionId, kind, questionId, elapsedSec, remainingSec, code, narrationSince, candidateMessage, t } = body;
      const session = getSession(sessionId);
      if (!session) throw new Error("unknown session");
      if (kind === "ask" && candidateMessage) {
        addEvent(sessionId, { t: Number(t) || 0, type: "candidate-ask", questionId, data: { text: candidateMessage } });
      }
      if (typeof code === "string" && code) {
        addEvent(sessionId, { t: Number(t) || 0, type: "snapshot", questionId, data: { code } });
      }
      const prompt = buildPrompt({
        session,
        kind: kind as AskKind,
        questionId,
        elapsedSec: Number(elapsedSec) || 0,
        remainingSec: Number(remainingSec) || 0,
        code: String(code ?? ""),
        narrationSince: String(narrationSince ?? ""),
        candidateMessage,
        lastRun: lastRunBySession.get(sessionId) ?? null,
      });
      const text = await callAgent(prompt, kind === "final" ? 8000 : 2000);
      addEvent(sessionId, { t: Number(t) || 0, type: "interviewer", questionId, data: { text, kind } });
      if (kind === "final") {
        endSession(sessionId);
        const file = writeDebrief(sessionId, text);
        return { text, savedTo: path.relative(ROOT, file) };
      }
      return { text };
    }

    case "/api/assistant": {
      const { sessionId, questionId, history, code, t } = body;
      const session = getSession(sessionId);
      if (!session) throw new Error("unknown session");
      if (session.mode !== "ai") throw new Error("assistant is only available in AI mode");
      const hist = (history as { role: "user" | "assistant"; text: string }[]) ?? [];
      const lastUser = [...hist].reverse().find((m) => m.role === "user");
      if (lastUser) {
        addEvent(sessionId, { t: Number(t) || 0, type: "assistant-prompt", questionId, data: { text: lastUser.text } });
      }
      const text = await callAgent(buildAssistantPrompt(session, questionId, hist, String(code ?? "")), 4000);
      addEvent(sessionId, { t: Number(t) || 0, type: "assistant-reply", questionId, data: { text } });
      return { text };
    }

    default:
      throw new Error(`unknown endpoint ${pathname}`);
  }
}

// ── plumbing ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5 * 1024 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: "web/index.html", type: "text/html; charset=utf-8" },
  "/styles.css": { file: "web/styles.css", type: "text/css; charset=utf-8" },
  "/bundle.js": { file: "dist/bundle.js", type: "text/javascript; charset=utf-8" },
  "/bundle.js.map": { file: "dist/bundle.js.map", type: "application/json" },
};

function serveStatic(pathname: string, res: http.ServerResponse): void {
  const entry = STATIC[pathname];
  if (!entry) return json(res, 404, { error: "not found" });
  const full = path.join(ROOT, entry.file);
  if (!fs.existsSync(full)) return json(res, 404, { error: `${entry.file} missing — run npm run build` });
  res.writeHead(200, { "content-type": entry.type });
  fs.createReadStream(full).pipe(res);
}

server.listen(PORT, () => {
  console.log(`\n  Interview arena → http://localhost:${PORT}\n`);
  console.log(`  Interviewer model: ${process.env.ARENA_MODEL || "claude-opus-5"} (override with ARENA_MODEL)`);
  console.log(`  Agent credentials: claude CLI first, Anthropic SDK fallback (ARENA_USE_API=1 to flip)\n`);
});
