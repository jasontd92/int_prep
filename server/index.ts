// Interview arena server: static UI + JSON APIs for running code,
// talking to the interviewer agent, and logging the session.

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { TRACKS, QUESTIONS, questionsForTrack, portfolioQuestion, type Track } from "./questions";
import { runCode, type RunResult } from "./runner";
import {
  createSession,
  getSession,
  addEvent,
  endSession,
  discardSession,
  setPortfolioResearch,
  writeDebrief,
  listSessions,
  loadSessionFromDisk,
  readDebrief,
  type Mode,
  type Session,
} from "./store";
import { buildPrompt, buildAssistantPrompt, buildPortfolioFinal, callAgent, type AskKind } from "./interviewer";
import { researchFeature, runReadonlyRepoAgent } from "./research";
import { repoName, slugify } from "./memory";

const PORT = Number(process.env.ARENA_PORT || 4321);
const ROOT = path.join(__dirname, "..");

const lastRunBySession = new Map<string, RunResult>();
// In-flight background research per portfolio session, so the final debrief can
// await ground truth before grading.
const researchBySession = new Map<string, Promise<void>>();

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

      if (track === "portfolio") return startPortfolio(body, durationMin, checkinMin);

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
          return { id: q.id, title: q.title, type: q.type, est: q.est, prompt: q.prompt, starterCode: q.starterCode, starterCodeJs: q.starterCodeJs, starterCodePy: q.starterCodePy };
        }),
      };
    }

    case "/api/portfolio/status": {
      const session = getSession(String(body.sessionId ?? ""));
      const p = session?.portfolio;
      return { status: p?.researchStatus ?? "pending", error: p?.researchError ?? null, savedTo: p?.savedTo ?? null };
    }

    case "/api/session/discard": {
      const id = String(body.sessionId ?? "");
      discardSession(id);
      lastRunBySession.delete(id);
      return { ok: true };
    }

    case "/api/run": {
      const { sessionId, questionId, code, t, lang } = body;
      const result = runCode(String(questionId), String(code ?? ""), lang === "py" ? "py" : lang === "js" ? "js" : "ts");
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
      if ((kind === "ask" || kind === "turn") && candidateMessage) {
        addEvent(sessionId, { t: Number(t) || 0, type: "candidate-ask", questionId, data: { text: candidateMessage } });
      }
      if (typeof code === "string" && code) {
        addEvent(sessionId, { t: Number(t) || 0, type: "snapshot", questionId, data: { code } });
      }
      // Portfolio final grading needs ground truth — wait for research to land.
      if (kind === "final" && session.track === "portfolio") {
        await researchBySession.get(sessionId)?.catch(() => {});
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
      const text =
        kind === "final" && session.track === "portfolio"
          ? await generatePortfolioDebrief(session)
          : await callAgent(prompt, kind === "final" ? 8000 : 2000);
      addEvent(sessionId, { t: Number(t) || 0, type: "interviewer", questionId, data: { text, kind } });
      if (kind === "final") {
        endSession(sessionId);
        const file = writeDebrief(sessionId, text);
        // Portfolio: reveal the ground truth alongside the debrief (study aid).
        const groundTruth = session.track === "portfolio" ? session.portfolio?.groundTruth ?? "" : undefined;
        return { text, savedTo: path.relative(ROOT, file), groundTruth };
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

    // ── past-session review ──────────────────────────────────────────────────

    case "/api/sessions/list": {
      return { sessions: listSessions() };
    }

    case "/api/sessions/get": {
      const id = String(body.sessionId ?? "");
      const s = loadSessionFromDisk(id);
      if (!s) throw new Error("session not found");
      const qTitles: Record<string, string> = {};
      for (const qid of s.questionIds) {
        const q = QUESTIONS.get(qid);
        if (q) qTitles[qid] = q.title;
      }
      const groundTruth =
        s.track === "portfolio"
          ? s.portfolio?.groundTruth ??
            (s.events.find((e) => e.type === "ground-truth")?.data.body as string | undefined) ??
            null
          : null;
      const lastT = s.events.length ? s.events[s.events.length - 1].t : 0;
      return {
        meta: {
          id: s.id,
          createdAt: s.createdAt,
          track: s.track,
          mode: s.mode,
          durationMin: s.durationMin,
          ended: !!s.ended,
          title:
            s.track === "portfolio" && s.portfolio
              ? `${s.portfolio.featureName} · ${s.portfolio.repoName}`
              : s.track.toUpperCase(),
          position: s.track === "portfolio" ? s.portfolio?.position ?? null : null,
          elapsedSec: Math.floor(lastT / 1000),
        },
        events: s.events.filter((e) => e.type !== "snapshot"), // snapshots are code noise
        qTitles,
        debrief: readDebrief(id),
        groundTruth,
      };
    }

    case "/api/sessions/debrief": {
      // Regenerate a missing debrief for a past session (e.g. one that crashed
      // before "End"). Uses the same final-grading prompt the live app does.
      const id = String(body.sessionId ?? "");
      const s = loadSessionFromDisk(id);
      if (!s) throw new Error("session not found");
      const qid = [...s.events].reverse().find((e) => e.questionId)?.questionId ?? s.questionIds[0] ?? "";
      const lastT = s.events.length ? s.events[s.events.length - 1].t : 0;
      const prompt = buildPrompt({
        session: s,
        kind: "final",
        questionId: qid,
        elapsedSec: Math.floor(lastT / 1000),
        remainingSec: 0,
        code: (qid && s.code?.[qid]) || "",
        narrationSince: "",
        lastRun: null,
      });
      const text =
        s.track === "portfolio"
          ? await generatePortfolioDebrief(s)
          : await callAgent(prompt, 8000);
      const file = writeDebrief(id, text);
      const groundTruth = s.track === "portfolio" ? s.portfolio?.groundTruth ?? null : null;
      return { text, savedTo: path.relative(ROOT, file), groundTruth };
    }

    default:
      throw new Error(`unknown endpoint ${pathname}`);
  }
}

// ── portfolio-defense track ──────────────────────────────────────────────────

// How long the read-only in-repo debrief agent may run before we give up and
// fall back to the fast notes-only debrief. Large repos need more than the old
// 300s; override with ARENA_DEBRIEF_TIMEOUT_MS.
const DEBRIEF_REPO_TIMEOUT_MS = Number(process.env.ARENA_DEBRIEF_TIMEOUT_MS || 600_000);

// Grades a portfolio defense. The interviewer was blind during the live round;
// the code only comes in here. Best path: the read-only in-repo agent grounds
// the A/B reference answers in the real code. If that times out or the CLI tools
// are unavailable, degrade to a FAST notes-only debrief — a distinct prompt with
// no repo-exploration instruction, so the fallback can't stall the way reusing
// the repo prompt did (it would flail trying to explore a repo it can't reach).
async function generatePortfolioDebrief(session: Session): Promise<string> {
  const repoPath = session.portfolio?.repoPath;
  if (repoPath && fs.existsSync(repoPath)) {
    try {
      return await runReadonlyRepoAgent(
        repoPath,
        buildPortfolioFinal(session, { repoAccess: true }),
        DEBRIEF_REPO_TIMEOUT_MS
      );
    } catch (e) {
      console.error(`portfolio debrief: in-repo agent failed, using notes-only fallback — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // A full debrief is a large generation; give the CLI generous headroom so the
  // fallback itself can't be killed mid-write (a big notes-only debrief ~2-3min).
  return callAgent(buildPortfolioFinal(session, { repoAccess: false }), 8000, 420_000);
}

function startPortfolio(body: any, durationMin: number, checkinMin: number): unknown {
  const repoPath = String(body.repoPath ?? "").trim();
  const featureName = String(body.featureName ?? "").trim();
  const position = String(body.position ?? "").trim();
  if (!repoPath) throw new Error("a repo path is required for the portfolio track");
  if (!featureName) throw new Error("name the feature you want to defend");
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error(`repo path not found or not a directory: ${repoPath}`);
  }

  const q = portfolioQuestion(repoPath, featureName);
  const session = createSession("portfolio", "manual", durationMin, checkinMin, [q.id], {
    repoPath,
    repoName: repoName(repoPath),
    featureName,
    featureSlug: slugify(featureName),
    position: position || undefined,
    researchStatus: "pending",
  });

  // Kick off research in the background — cache-first, so usually near-instant.
  const job = (async () => {
    try {
      const r = await researchFeature(repoPath, featureName);
      setPortfolioResearch(session.id, {
        groundTruth: r.groundTruth,
        researchStatus: r.status === "error" ? "error" : r.status,
        researchError: r.error,
        savedTo: r.savedTo,
      });
      const type = r.status === "hit" ? "research-hit" : r.status === "error" ? "research-error" : "research-refresh";
      addEvent(session.id, { t: 0, type, questionId: q.id, data: { status: r.status, savedTo: r.savedTo, error: r.error ?? null } });
      if (r.groundTruth) addEvent(session.id, { t: 0, type: "ground-truth", questionId: q.id, data: { body: r.groundTruth } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPortfolioResearch(session.id, { researchStatus: "error", researchError: msg });
      addEvent(session.id, { t: 0, type: "research-error", questionId: q.id, data: { error: msg } });
    }
  })();
  researchBySession.set(session.id, job);

  return {
    sessionId: session.id,
    questionIds: [q.id],
    portfolio: { repoName: session.portfolio!.repoName, featureName },
    questions: [{ id: q.id, title: q.title, type: q.type, est: q.est, prompt: q.prompt, starterCode: q.starterCode }],
  };
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
