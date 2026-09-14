// Interview arena frontend: setup screen → timed arena (editor, interviewer
// feed, optional AI assistant, voice narration) → debrief.

import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { marked } from "marked";

// ── types ───────────────────────────────────────────────────────────────────

interface QuestionMeta { id: string; title: string; type: string; est: number }
interface TrackMeta { id: string; name: string; blurb: string; defaultPick: string[]; questions: QuestionMeta[] }
interface SessionQuestion extends QuestionMeta { prompt: string; starterCode: string; starterCodeJs?: string; starterCodePy?: string }

interface RunResult {
  ok: boolean; diagnostics: string[]; stdout: string; stderr: string;
  cases: { name: string; pass: boolean; detail?: string }[];
  timedOut: boolean; durationMs: number;
}

// past-session review
interface SessionSummary {
  id: string; createdAt: string; track: string; mode: string;
  durationMin: number; ended: boolean; hasDebrief: boolean; title: string; elapsedSec: number;
}
interface ReviewEvent { t: number; type: string; questionId?: string; data: Record<string, any> }
interface SessionDetail {
  meta: { id: string; createdAt: string; track: string; mode: string; durationMin: number; ended: boolean; title: string; position?: string | null; elapsedSec: number };
  events: ReviewEvent[];
  qTitles: Record<string, string>;
  debrief: string | null;
  groundTruth: string | null;
}

// ── tiny dom helper ─────────────────────────────────────────────────────────

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, unknown> = {}, ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") (el as any)[k.toLowerCase()] = v;
    else if (v != null) el.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

const app = document.getElementById("app")!;

// ── global session state ────────────────────────────────────────────────────

const S = {
  sessionId: "",
  track: "",
  mode: "manual" as "ai" | "manual",
  durationMin: 60,
  checkinMin: 7,
  questions: [] as SessionQuestion[],
  current: 0,
  lang: "ts" as "ts" | "js" | "py",
  code: {} as Record<string, string>, // keyed by `${questionId}::${lang}`
  startMs: 0,
  narrationBuffer: [] as string[], // since last interviewer contact
  interviewerBusy: false,
  assistantHistory: [] as { role: "user" | "assistant"; text: string }[],
  ended: false,
  ttsEnabled: true,
  checkinTimer: 0 as unknown as ReturnType<typeof setTimeout>,
  clockTimer: 0 as unknown as ReturnType<typeof setInterval>,
  questionStartMs: 0,
  // portfolio-defense track
  portfolioRepo: "",
  portfolioFeature: "",
  portfolioPosition: "",
  researchStatus: "pending" as "pending" | "hit" | "refreshed" | "created" | "error",
  researchTimer: 0 as unknown as ReturnType<typeof setInterval>,
};

const now = () => Date.now() - S.startMs;
const elapsedSec = () => Math.floor(now() / 1000);
const remainingSec = () => Math.max(0, S.durationMin * 60 - elapsedSec());
const curQ = () => S.questions[S.current];
// Code is stored per (question, language) so switching languages preserves both.
const codeKey = (qid: string = curQ()?.id ?? "", lang: "ts" | "js" | "py" = S.lang) => `${qid}::${lang}`;
const starterFor = (q: SessionQuestion, lang: "ts" | "js" | "py") =>
  lang === "py" ? q.starterCodePy ?? "" : lang === "js" ? q.starterCodeJs ?? "" : q.starterCode;

// ════════════════════════════ SETUP SCREEN ══════════════════════════════════

async function showSetup() {
  app.innerHTML = "";
  const { tracks } = await (await fetch("/api/tracks", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json() as { tracks: TrackMeta[] };

  let selTrack = tracks[0];
  let mode: "ai" | "manual" = "manual";
  const checked = new Set<string>(selTrack.defaultPick);

  const trackGrid = h("div", { class: "tracks" });
  const qlist = h("div", { class: "qlist" });
  const modeBtns: HTMLButtonElement[] = [];

  function renderQuestions() {
    qlist.innerHTML = "";
    qlist.append(h("div", { class: "hint", style: "margin:0 0 8px" }, "Pick your questions (or keep the default set):"));
    for (const q of selTrack.questions) {
      const cb = h("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = checked.has(q.id);
      cb.onchange = () => (cb.checked ? checked.add(q.id) : checked.delete(q.id));
      qlist.append(h("label", {}, cb, h("span", { class: "qtype" }, q.type), `${q.title} (~${q.est}m)`));
    }
  }

  function renderTracks() {
    trackGrid.innerHTML = "";
    for (const t of tracks) {
      trackGrid.append(
        h("div", {
          class: "track-card" + (t.id === selTrack.id ? " selected" : ""),
          onclick: () => {
            selTrack = t;
            checked.clear();
            for (const id of t.defaultPick) checked.add(id);
            renderTracks(); renderQuestions(); updateTrackUI();
          },
        }, h("h3", {}, t.name), h("p", {}, t.blurb))
      );
    }
  }

  const durationInput = h("input", { type: "number", value: "60", min: "10", max: "180", style: "width:80px" }) as HTMLInputElement;
  const checkinInput = h("input", { type: "number", value: "7", min: "3", max: "20", style: "width:80px" }) as HTMLInputElement;

  const modeWrap = h("div", { class: "mode-toggle" });
  for (const m of ["manual", "ai"] as const) {
    const b = h("button", {
      class: m === mode ? "active" : "",
      onclick: () => { mode = m; modeBtns.forEach((x) => x.classList.remove("active")); b.classList.add("active"); },
    }, m === "manual" ? "Manual mode — you write everything" : "AI mode — pair-assistant allowed (prompts are scored)") as HTMLButtonElement;
    modeBtns.push(b);
    modeWrap.append(b);
  }
  const modeLabel = h("label", {}, "Mode", modeWrap);
  const checkinLabel = h("label", {}, "Interviewer check-in every (minutes)", checkinInput);

  // Portfolio-defense config (repo + feature), shown only for that track.
  // These live on the host machine (localStorage) since your defense target
  // rarely changes — prefill from the last run so you don't retype the path.
  let savedRepo = "", savedFeature = "", savedPosition = "";
  try {
    savedRepo = localStorage.getItem("arena.portfolioRepo") || "";
    savedFeature = localStorage.getItem("arena.portfolioFeature") || "";
    savedPosition = localStorage.getItem("arena.portfolioPosition") || "";
  } catch { /* private mode */ }
  const repoInput = h("input", { value: savedRepo, placeholder: "/absolute/path/to/your/repo", style: "width:340px" }) as HTMLInputElement;
  const featureInput = h("input", { value: savedFeature, placeholder: 'e.g. "the caching layer" or "auth token refresh"', style: "width:340px" }) as HTMLInputElement;

  // Position/role being interviewed for — shapes what the interviewer probes
  // (an FDE round adds stakeholder/business-case questions). Presets + custom.
  const POSITION_PRESETS = ["Software Engineer", "Forward Deployed Engineer (FDE)"];
  const positionSelect = h("select", {
    style: "width:340px",
    onchange: () => { positionCustomWrap.style.display = positionSelect.value === "__custom__" ? "" : "none"; },
  }) as HTMLSelectElement;
  for (const p of POSITION_PRESETS) positionSelect.append(h("option", { value: p }, p));
  positionSelect.append(h("option", { value: "__custom__" }, "Custom role…"));
  const positionCustom = h("input", { placeholder: "e.g. Solutions Engineer, Senior Backend Engineer", style: "width:340px" }) as HTMLInputElement;
  const positionCustomWrap = h("label", { style: "display:none;flex-direction:column;gap:6px;margin-top:12px" }, "Custom role", positionCustom);
  if (savedPosition) {
    if (POSITION_PRESETS.includes(savedPosition)) positionSelect.value = savedPosition;
    else { positionSelect.value = "__custom__"; positionCustom.value = savedPosition; positionCustomWrap.style.display = "flex"; }
  }
  const positionValue = () => (positionSelect.value === "__custom__" ? positionCustom.value.trim() : positionSelect.value);

  const portfolioForm = h("div", { class: "qlist", style: "display:none" },
    h("div", { class: "hint", style: "margin:0 0 10px" },
      "Defend a feature you built. A research agent reads the actual code in this repo (read-only) and caches its findings under ~/.interview-arena/memory/. The interviewer runs the live round BLIND (like a real interviewer who hasn't seen your code); the code is used only at the debrief, where your answers are compared against it question-by-question. It's a back-and-forth: narrate or type your point, hit Respond →, and the interviewer reacts — no timed check-ins."),
    h("label", { style: "display:flex;flex-direction:column;gap:6px;margin-bottom:12px" }, "Repo path (on this machine)", repoInput),
    h("label", { style: "display:flex;flex-direction:column;gap:6px;margin-bottom:12px" }, "Feature to defend", featureInput),
    h("label", { style: "display:flex;flex-direction:column;gap:6px" }, "Interviewing for (role)", positionSelect),
    positionCustomWrap,
  );

  function updateTrackUI() {
    const isPortfolio = selTrack.id === "portfolio";
    qlist.style.display = isPortfolio ? "none" : "";
    portfolioForm.style.display = isPortfolio ? "" : "none";
    modeLabel.style.display = isPortfolio ? "none" : "";
    // Portfolio is turn-based (you Respond when ready), so a check-in cadence
    // doesn't apply — hide it.
    checkinLabel.style.display = isPortfolio ? "none" : "";
    startBtn.textContent = isPortfolio ? "Start defense" : "Start interview";
  }

  const startBtn = h("button", {
    class: "primary", style: "font-size:15px;padding:10px 28px",
    onclick: async () => {
      const isPortfolio = selTrack.id === "portfolio";
      if (isPortfolio && (!repoInput.value.trim() || !featureInput.value.trim())) {
        alert("Enter both a repo path and the feature you want to defend.");
        return;
      }
      const label = startBtn.textContent;
      startBtn.textContent = isPortfolio ? "Researching…" : "Starting…";
      (startBtn as HTMLButtonElement).disabled = true;
      try {
        await startSession({
          track: selTrack.id,
          mode,
          durationMin: Number(durationInput.value),
          checkinMin: Number(checkinInput.value),
          questionIds: [...checked],
          repoPath: isPortfolio ? repoInput.value.trim() : undefined,
          featureName: isPortfolio ? featureInput.value.trim() : undefined,
          position: isPortfolio ? positionValue() : undefined,
        });
        // Persist a working defense target so it's prefilled next time.
        if (isPortfolio) {
          try {
            localStorage.setItem("arena.portfolioRepo", repoInput.value.trim());
            localStorage.setItem("arena.portfolioFeature", featureInput.value.trim());
            localStorage.setItem("arena.portfolioPosition", positionValue());
          } catch { /* private mode */ }
        }
      } catch (e) {
        alert(String(e));
        startBtn.textContent = label;
        (startBtn as HTMLButtonElement).disabled = false;
      }
    },
  }, "Start interview") as HTMLButtonElement;

  renderTracks(); renderQuestions(); updateTrackUI();
  app.append(
    h("div", { class: "setup" },
      h("div", { class: "setup-head" },
        h("h1", {}, "Interview Arena"),
        h("button", { onclick: () => void showSessions() }, "Past sessions →"),
      ),
      h("div", { class: "sub" }, "Timed mock interviews with an AI interviewer that checks in, scores you, and debriefs you. Narrate out loud — that's the point."),
      trackGrid,
      h("div", { class: "setup-row" },
        h("label", {}, "Duration (minutes)", durationInput),
        checkinLabel,
        modeLabel,
      ),
      qlist,
      portfolioForm,
      startBtn,
      h("div", { class: "hint" },
        "Voice narration uses your browser's speech recognition (best in Chrome — you'll be asked for mic permission). ",
        "The interviewer agent runs through your local `claude` CLI (or ANTHROPIC_API_KEY). ",
        "Run code with Ctrl/Cmd+Enter. Session logs and the debrief are saved under sessions/."),
    )
  );
}

// ════════════════════════════ ARENA ═════════════════════════════════════════

let editor: EditorView | null = null;
let outputEl: HTMLElement;
let interviewerFeed: HTMLElement;
let assistantFeed: HTMLElement | null = null;
let timerEl: HTMLElement;
let qTimerEl: HTMLElement;
let liveEl: HTMLElement;
let micBtn: HTMLButtonElement;
let tabBtns: Record<string, HTMLButtonElement> = {};
let tabPanels: Record<string, HTMLElement> = {};
let promptEl: HTMLElement;
let qNavEl: HTMLElement;
let researchBadge: HTMLElement | null = null;

interface StartOpts {
  track: string;
  mode: "ai" | "manual";
  durationMin: number;
  checkinMin: number;
  questionIds: string[];
  repoPath?: string;
  featureName?: string;
  position?: string;
}

async function startSession(opts: StartOpts) {
  const res = await api<{ sessionId: string; questions: SessionQuestion[] }>("/api/session/start", opts);
  S.sessionId = res.sessionId;
  S.track = opts.track;
  S.mode = opts.mode;
  S.durationMin = opts.durationMin;
  S.checkinMin = Math.max(3, Math.min(20, opts.checkinMin || 7));
  S.questions = res.questions;
  S.current = 0;
  // Redo and the stateful-backend track model real CoderPad rounds where you'd
  // reach for JS, so default those to JavaScript.
  S.lang = opts.track === "redo" || opts.track === "backend" ? "js" : "ts";
  S.code = {};
  for (const q of res.questions) {
    S.code[`${q.id}::ts`] = q.starterCode;
    if (q.starterCodeJs != null) S.code[`${q.id}::js`] = q.starterCodeJs;
    if (q.starterCodePy != null) S.code[`${q.id}::py`] = q.starterCodePy;
  }
  S.startMs = Date.now();
  S.questionStartMs = Date.now();
  S.narrationBuffer = [];
  S.assistantHistory = [];
  S.ended = false;
  S.portfolioRepo = opts.repoPath ?? "";
  S.portfolioFeature = opts.featureName ?? "";
  S.portfolioPosition = opts.position ?? "";
  S.researchStatus = "pending";

  renderArena();
  startClock();
  scheduleCheckin();
  if (opts.track === "portfolio") startResearchPolling();
  void contactInterviewer("kickoff");
}

function renderArena() {
  app.innerHTML = "";
  tabBtns = {}; tabPanels = {};
  const isPortfolio = S.track === "portfolio";

  // ── topbar ──
  timerEl = h("div", { class: "timer" }, "--:--");
  qTimerEl = h("div", { class: "qtimer" }, "");
  const runBtn = h("button", { class: "primary", onclick: () => void runCurrent() }, "▶ Run (⌘/Ctrl+Enter)");
  const nextBtn = h("button", { onclick: () => nextQuestion() }, "Next question →");
  // Language picker — TypeScript always; JavaScript / Python when the track's
  // questions ship those variants (only shown when there's a real choice).
  let langSelect: HTMLSelectElement | null = null;
  if (!isPortfolio) {
    const opts = [h("option", { value: "ts" }, "TypeScript")];
    if (S.questions.some((q) => q.starterCodeJs != null)) opts.push(h("option", { value: "js" }, "JavaScript"));
    if (S.questions.some((q) => q.starterCodePy != null)) opts.push(h("option", { value: "py" }, "Python"));
    if (opts.length > 1) {
      const sel = h("select", {
        title: "Language for the coding editor",
        onchange: () => setLang(sel.value === "py" ? "py" : sel.value === "js" ? "js" : "ts"),
      }, ...opts) as HTMLSelectElement;
      sel.value = S.lang;
      langSelect = sel;
    }
  }
  const ttsBtn = h("button", {
    class: S.ttsEnabled ? "active" : "",
    onclick: () => { S.ttsEnabled = !S.ttsEnabled; ttsBtn.classList.toggle("active", S.ttsEnabled); if (!S.ttsEnabled) speechSynthesis.cancel(); },
    title: "Interviewer speaks messages aloud",
  }, "🔊 Voice");
  const endBtn = h("button", {
    class: "danger",
    onclick: () => { if (confirm(isPortfolio ? "End the defense and get your debrief?" : "End the interview and get your debrief?")) void finishInterview("ended early by candidate"); },
  }, isPortfolio ? "End defense" : "End interview");
  const discardBtn = h("button", {
    title: "Exit without saving — deletes the session log, no debrief",
    onclick: () => {
      if (confirm("Discard this session?\n\nYour transcript and session log are deleted. No debrief is generated. This can't be undone.")) {
        void discardAndExit();
      }
    },
  }, "Discard & exit");

  const badges: (Node | string)[] = isPortfolio
    ? [
        h("span", { class: "badge" }, "PORTFOLIO"),
        h("span", { class: "badge", title: S.portfolioRepo }, `${S.portfolioRepo.split("/").filter(Boolean).pop() || "repo"} · ${S.portfolioFeature}`),
        ...(S.portfolioPosition ? [h("span", { class: "badge", title: "Role being interviewed for" }, S.portfolioPosition)] : []),
        (researchBadge = h("span", { class: "badge", title: "The research agent is reading the code" }, "◐ researching…")),
      ]
    : [
        h("span", { class: "badge" }, S.track.toUpperCase()),
        h("span", { class: "badge" }, S.mode === "ai" ? "AI MODE" : "MANUAL"),
      ];

  const topbar = h("div", { class: "topbar" },
    ...badges,
    timerEl, qTimerEl,
    h("div", { class: "spacer" }),
    ...(isPortfolio ? [] : [langSelect, runBtn, nextBtn]),
    ttsBtn, buildVoiceSelect(), discardBtn, endBtn,
  );

  // ── left: tabs ──
  const tabs = h("div", { class: "tabs" });
  const left = h("div", { class: "left" }, tabs);
  const tabNames = S.mode === "ai" ? ["Question", "Interviewer", "Assistant"] : ["Question", "Interviewer"];
  for (const name of tabNames) {
    const btn = h("button", { onclick: () => selectTab(name) }, name, h("span", { class: "dot" })) as HTMLButtonElement;
    tabBtns[name] = btn;
    tabs.append(btn);
    const panel = h("div", { class: "tabpanel hidden" });
    tabPanels[name] = panel;
    left.append(panel);
  }

  // question panel
  promptEl = h("div", { class: "qprompt" });
  qNavEl = h("div", { class: "qnav" });
  tabPanels["Question"].append(qNavEl, promptEl);

  // interviewer panel + ask box
  interviewerFeed = h("div", { class: "feed" });
  tabPanels["Interviewer"].append(interviewerFeed);
  // Coding tracks: a free-form "Ask" box. Portfolio is turn-based, so its
  // composer lives in the narration bar below (mic + Respond) instead.
  if (!isPortfolio) {
    const askInput = h("input", { placeholder: "Ask the interviewer a question…" }) as HTMLInputElement;
    const askSend = h("button", { class: "primary", onclick: () => void askInterviewer(askInput) }, "Ask");
    askInput.onkeydown = (e) => { if (e.key === "Enter") void askInterviewer(askInput); };
    tabPanels["Interviewer"].append(h("div", { class: "chat-input", style: "position:sticky;bottom:-16px;margin:16px -16px -16px" }, askInput, askSend));
  }

  // assistant panel (AI mode)
  if (S.mode === "ai") {
    assistantFeed = h("div", { class: "feed" },
      h("div", { class: "msg assistant" }, h("div", { class: "who" }, "AI assistant"),
        "I'm your pair assistant — like Cursor chat. Ask me for code, explanations, or debugging. (Your prompts to me are part of your evaluation: keep them scoped and verify what I give you.)"));
    tabPanels["Assistant"].append(assistantFeed);
    const aInput = h("input", { placeholder: "Prompt the assistant…" }) as HTMLInputElement;
    const aSend = h("button", { class: "primary", onclick: () => void promptAssistant(aInput) }, "Send");
    aInput.onkeydown = (e) => { if (e.key === "Enter") void promptAssistant(aInput); };
    tabPanels["Assistant"].append(h("div", { class: "chat-input", style: "position:sticky;bottom:-16px;margin:16px -16px -16px" }, aInput, aSend));
  }

  // ── right: editor (+ output for coding tracks) ──
  const editorWrap = h("div", { class: "editor-wrap" });
  outputEl = h("div", { class: "output" }, h("span", { class: "dim" }, "Output and test results appear here. ⌘/Ctrl+Enter to run."));
  // Portfolio: the editor is a scratch/notes pad; there's nothing to run.
  const right = h("div", { class: "right" }, editorWrap, ...(isPortfolio ? [] : [outputEl]));

  // ── narration bar ──
  // Coding tracks: narrate-out-loud practice (buffered, flushed on check-ins).
  // Portfolio: this bar is the turn composer — narrate by voice and/or type,
  // then hit Respond → to hand the turn to the interviewer for a reply.
  micBtn = h("button", { onclick: toggleMic }, "🎙 Mic off") as HTMLButtonElement;
  if (isPortfolio) {
    liveEl = h("div", { class: "live" }, "Narrate your defense out loud (mic) or type it, then hit Respond → to answer.");
    const respInput = h("input", { placeholder: "Type your response — or narrate by voice, then Respond →", style: "flex:1;min-width:220px" }) as HTMLInputElement;
    const respBtn = h("button", { class: "primary", onclick: () => void submitPortfolioTurn(respInput) }, "Respond →");
    respInput.onkeydown = (e) => { if (e.key === "Enter") void submitPortfolioTurn(respInput); };
    const narration = h("div", { class: "narration" }, micBtn, liveEl, respInput, respBtn);
    app.append(h("div", { class: "arena" }, topbar, h("div", { class: "cols" }, left, right), narration));
  } else {
    liveEl = h("div", { class: "live" }, "Mic off — enable to practice narrating out loud, or type notes on the right.");
    const noteInput = h("input", { placeholder: "…or type narration here", style: "width:280px" }) as HTMLInputElement;
    noteInput.onkeydown = (e) => {
      if (e.key === "Enter" && noteInput.value.trim()) {
        recordNarration(noteInput.value.trim());
        noteInput.value = "";
      }
    };
    const narration = h("div", { class: "narration" }, micBtn, liveEl, noteInput);
    app.append(h("div", { class: "arena" }, topbar, h("div", { class: "cols" }, left, right), narration));
  }

  makeEditor(editorWrap);
  selectTab("Question");
  loadQuestion(0);
}

function selectTab(name: string) {
  for (const [n, btn] of Object.entries(tabBtns)) {
    btn.classList.toggle("active", n === name);
    if (n === name) btn.classList.remove("notify");
    tabPanels[n].classList.toggle("hidden", n !== name);
  }
}

function notifyTab(name: string) {
  if (!tabBtns[name]?.classList.contains("active")) tabBtns[name]?.classList.add("notify");
}

// ── editor ──────────────────────────────────────────────────────────────────

function makeEditor(parent: HTMLElement) {
  editor = new EditorView({
    parent,
    state: editorStateFor("", S.lang),
  });
}

function editorStateFor(doc: string, lang: "ts" | "js" | "py" = "ts") {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      keymap.of([
        { key: "Mod-Enter", run: () => { void runCurrent(); return true; } },
        indentWithTab,
      ]),
      lang === "py" ? python() : javascript({ typescript: lang === "ts" }),
      oneDark,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && curQ()) S.code[codeKey()] = u.state.doc.toString();
      }),
    ],
  });
}

function loadQuestion(idx: number) {
  S.current = idx;
  S.questionStartMs = Date.now();
  const q = curQ();
  promptEl.innerHTML = marked.parse(q.prompt) as string;
  qNavEl.innerHTML = "";
  S.questions.forEach((qq, i) => {
    qNavEl.append(h("button", {
      class: i === idx ? "active" : "",
      onclick: () => switchToQuestion(i, false),
    }, `Q${i + 1}: ${qq.title}`));
  });
  editor!.setState(editorStateFor(S.code[codeKey(q.id)] ?? starterFor(q, S.lang), S.lang));
}

// Switch the coding language: preserve the current buffer, load the other
// language's buffer (or its starter), and re-theme the editor.
function setLang(lang: "ts" | "js" | "py") {
  if (lang === S.lang || !editor || !curQ()) return;
  S.code[codeKey(curQ().id, S.lang)] = editor.state.doc.toString();
  S.lang = lang;
  const q = curQ();
  const doc = S.code[codeKey(q.id, lang)] ?? starterFor(q, lang);
  editor.setState(editorStateFor(doc, lang));
  if (outputEl) {
    const label = lang === "py" ? "Python" : lang === "js" ? "JavaScript" : "TypeScript";
    outputEl.innerHTML = "";
    outputEl.append(h("span", { class: "dim" }, `Language: ${label}. ⌘/Ctrl+Enter to run.`));
  }
}

function switchToQuestion(idx: number, announce: boolean) {
  if (idx === S.current || idx < 0 || idx >= S.questions.length) return;
  void api("/api/event", {
    sessionId: S.sessionId, type: "question-switch", questionId: S.questions[idx].id,
    t: now(), data: { questionId: S.questions[idx].id },
  }).catch(() => {});
  loadQuestion(idx);
  selectTab("Question");
  if (announce) void contactInterviewer("ask", `I'm moving on to question ${idx + 1} (${S.questions[idx].title}) now.`);
}

function nextQuestion() {
  if (S.current + 1 < S.questions.length) switchToQuestion(S.current + 1, true);
  else if (confirm("That was the last question. End the interview and get your debrief?")) void finishInterview("all questions done");
}

// ── run code ────────────────────────────────────────────────────────────────

async function runCurrent() {
  if (S.track === "portfolio") return; // notes pad — nothing to compile/run
  const q = curQ();
  outputEl.innerHTML = "";
  outputEl.append(h("span", { class: "dim" }, S.lang === "py" ? "Running Python…" : S.lang === "js" ? "Running JavaScript…" : "Compiling with tsc…"));
  try {
    const r = await api<RunResult>("/api/run", { sessionId: S.sessionId, questionId: q.id, code: S.code[codeKey()], t: now(), lang: S.lang });
    renderRun(r);
  } catch (e) {
    outputEl.innerHTML = "";
    outputEl.append(h("span", { class: "fail" }, String(e)));
  }
}

function renderRun(r: RunResult) {
  outputEl.innerHTML = "";
  if (r.diagnostics.length) {
    outputEl.append(h("div", { class: "diag" }, `✗ TypeScript compile errors (${r.diagnostics.length}):`));
    for (const d of r.diagnostics) outputEl.append(h("div", { class: "diag" }, "  " + d));
    return;
  }
  if (r.timedOut) outputEl.append(h("div", { class: "fail" }, "✗ Execution timed out (10s) — infinite loop?"));
  if (r.stderr) outputEl.append(h("div", { class: "fail" }, r.stderr));
  if (r.stdout.trim()) {
    outputEl.append(h("div", { class: "dim" }, "── console output ──"));
    outputEl.append(h("div", {}, r.stdout.trim()));
  }
  if (r.cases.length) {
    const passed = r.cases.filter((c) => c.pass).length;
    outputEl.append(h("div", { class: passed === r.cases.length ? "pass" : "fail", style: "margin-top:6px;font-weight:700" },
      `${passed}/${r.cases.length} tests passed (${r.durationMs}ms)`));
    for (const c of r.cases) {
      outputEl.append(h("div", { class: c.pass ? "pass" : "fail" },
        `${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? " — " + c.detail : ""}`));
    }
  } else if (!r.stdout.trim() && !r.stderr && !r.timedOut) {
    // Zero test cases. For a coding question that means the hidden tests never
    // ran — almost always because the candidate's code exits the module early.
    if (curQ()?.type === "coding") {
      outputEl.append(h("div", { class: "fail" }, "⚠ No test results came back — your code appears to exit before the tests run. Remove any top-level `return`, `process.exit()`, or a call to your interactive main loop (the hidden tests run after your code)."));
    } else {
      outputEl.append(h("div", { class: "pass" }, "✓ Compiled and ran cleanly (no tests for this question — it's a discussion round)."));
    }
  }
}

// ── clock & check-ins ───────────────────────────────────────────────────────

function startClock() {
  S.clockTimer = setInterval(() => {
    const rem = remainingSec();
    const mm = Math.floor(rem / 60), ss = rem % 60;
    timerEl.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    timerEl.className = "timer" + (rem <= 120 ? " crit" : rem <= 300 ? " warn" : "");
    const qMin = Math.floor((Date.now() - S.questionStartMs) / 60000);
    qTimerEl.textContent = `Q${S.current + 1}: ${qMin}m of ~${curQ()?.est ?? "?"}m`;
    if (rem <= 0 && !S.ended) void finishInterview("time is up");
  }, 500);
}

function scheduleCheckin() {
  clearTimeout(S.checkinTimer);
  // Portfolio defense is turn-based — the interviewer replies when the candidate
  // submits a turn, not on a timer. No periodic check-ins here.
  if (S.ended || S.track === "portfolio") return;
  S.checkinTimer = setTimeout(() => {
    if (!S.ended) void contactInterviewer("checkin");
  }, S.checkinMin * 60 * 1000);
}

// ── interviewer ─────────────────────────────────────────────────────────────

async function contactInterviewer(kind: "kickoff" | "checkin" | "turn" | "ask", candidateMessage?: string) {
  if (S.interviewerBusy) { if (kind === "checkin") scheduleCheckin(); return; }
  S.interviewerBusy = true;
  const thinking = h("div", { class: "msg interviewer thinking" }, "interviewer is thinking…");
  interviewerFeed.append(thinking);
  thinking.scrollIntoView({ block: "end" });
  const narrationSince = S.narrationBuffer.join("\n");
  try {
    const res = await api<{ text: string }>("/api/interviewer", {
      sessionId: S.sessionId,
      kind,
      questionId: curQ().id,
      elapsedSec: elapsedSec(),
      remainingSec: remainingSec(),
      code: S.code[codeKey()],
      narrationSince,
      candidateMessage,
      t: now(),
    });
    S.narrationBuffer = [];
    thinking.remove();
    addInterviewerMsg(res.text);
  } catch (e) {
    thinking.remove();
    addInterviewerMsg(`⚠ ${String(e)}`, true);
  } finally {
    S.interviewerBusy = false;
    scheduleCheckin(); // reset the countdown after any contact
  }
}

function addInterviewerMsg(text: string, isError = false) {
  const el = h("div", { class: "msg interviewer" }, h("div", { class: "who" }, "Interviewer"), text);
  interviewerFeed.append(el);
  el.scrollIntoView({ block: "end" });
  notifyTab("Interviewer");
  if (S.ttsEnabled && !isError) speak(text);
}

async function askInterviewer(input: HTMLInputElement) {
  const text = input.value.trim();
  if (!text || S.interviewerBusy) return;
  input.value = "";
  const el = h("div", { class: "msg me" }, h("div", { class: "who" }, "You"), text);
  interviewerFeed.append(el);
  el.scrollIntoView({ block: "end" });
  await contactInterviewer("ask", text);
}

// Portfolio defense is turn-based: the candidate composes a turn out of their
// spoken narration (buffered) plus anything typed here, hits Respond, and the
// interviewer replies to that turn. contactInterviewer() sends the buffered
// narration as narrationSince and clears it on success.
async function submitPortfolioTurn(input: HTMLInputElement) {
  if (S.interviewerBusy) return;
  const typed = input.value.trim();
  const narrated = S.narrationBuffer.join(" ").trim();
  if (!typed && !narrated) {
    liveEl.textContent = "Say or type your response first, then hit Respond →";
    return;
  }
  input.value = "";
  const shown = [narrated, typed].filter(Boolean).join(" ");
  selectTab("Interviewer");
  const el = h("div", { class: "msg me" }, h("div", { class: "who" }, "You"), shown);
  interviewerFeed.append(el);
  el.scrollIntoView({ block: "end" });
  await contactInterviewer("turn", typed || undefined);
}

// ── AI assistant (AI mode) ──────────────────────────────────────────────────

async function promptAssistant(input: HTMLInputElement) {
  const text = input.value.trim();
  if (!text || !assistantFeed) return;
  input.value = "";
  S.assistantHistory.push({ role: "user", text });
  const me = h("div", { class: "msg me" }, h("div", { class: "who" }, "You"), text);
  assistantFeed.append(me);
  const thinking = h("div", { class: "msg assistant thinking" }, "assistant is working…");
  assistantFeed.append(thinking);
  thinking.scrollIntoView({ block: "end" });
  try {
    const res = await api<{ text: string }>("/api/assistant", {
      sessionId: S.sessionId, questionId: curQ().id,
      history: S.assistantHistory.slice(-12), code: S.code[codeKey()], t: now(),
    });
    S.assistantHistory.push({ role: "assistant", text: res.text });
    thinking.remove();
    const el = h("div", { class: "msg assistant" }, h("div", { class: "who" }, "AI assistant"));
    el.append(h("div", { class: "qprompt" }));
    (el.lastChild as HTMLElement).innerHTML = marked.parse(res.text) as string;
    assistantFeed.append(el);
    el.scrollIntoView({ block: "end" });
  } catch (e) {
    thinking.textContent = `⚠ ${String(e)}`;
  }
}

// ── voice narration ─────────────────────────────────────────────────────────

let recognition: any = null;
let micEnabled = false;

function toggleMic() {
  if (micEnabled) {
    micEnabled = false;
    recognition?.stop();
    micBtn.textContent = "🎙 Mic off";
    micBtn.classList.remove("mic-on");
    liveEl.textContent = "Mic off.";
    return;
  }
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) {
    alert("Speech recognition isn't supported in this browser. Use Chrome, or type narration instead.");
    return;
  }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onresult = (ev: any) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) recordNarration(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    if (interim) {
      liveEl.innerHTML = "";
      liveEl.append(h("span", { class: "rec-dot" }), "“" + interim + "…”");
    }
  };
  recognition.onend = () => { if (micEnabled) { try { recognition.start(); } catch { /* restarting too fast */ } } };
  recognition.onerror = (ev: any) => {
    if (ev.error === "not-allowed") {
      micEnabled = false;
      micBtn.textContent = "🎙 Mic off";
      micBtn.classList.remove("mic-on");
      liveEl.textContent = "Mic permission denied — type narration instead.";
    }
  };
  recognition.start();
  micEnabled = true;
  micBtn.textContent = "🎙 Recording";
  micBtn.classList.add("mic-on");
  liveEl.innerHTML = "";
  liveEl.append(h("span", { class: "rec-dot" }), "Listening — narrate your thinking…");
}

function recordNarration(text: string) {
  if (!text) return;
  S.narrationBuffer.push(text);
  liveEl.innerHTML = "";
  liveEl.append(micEnabled ? h("span", { class: "rec-dot" }) : "", "“" + text + "”");
  void api("/api/event", {
    sessionId: S.sessionId, type: "narration", questionId: curQ()?.id, t: now(), data: { text },
  }).catch(() => {});
}

// ── interviewer TTS voice selection ──────────────────────────────────────────
// macOS "Enhanced"/"Premium"/Siri voices, once downloaded in System Settings,
// show up in speechSynthesis.getVoices() (best exposed in Safari). We pick the
// most natural available English voice by default and let the user override.

let ttsVoices: SpeechSynthesisVoice[] = [];
let selectedVoiceURI = "";
try { selectedVoiceURI = localStorage.getItem("arena.voiceURI") || ""; } catch { /* private mode */ }

// Higher score = more natural. Enhanced/Premium/Siri/Neural voices win.
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (!v.lang.toLowerCase().startsWith("en")) s -= 100;
  if (/premium|enhanced/.test(n)) s += 50;
  if (/siri/.test(n)) s += 45;
  if (/natural|neural/.test(n)) s += 40;
  if (v.localService) s += 10; // on-device, no network lag/robotic fallback
  if (/google/.test(n)) s += 15; // Chrome's Google voices are decent
  if (/eloquence|compact|novelty|bells|bad news|zarvox|albert/.test(n)) s -= 30; // legacy joke/robotic
  if (v.lang === "en-US" || v.lang === "en_US") s += 5;
  return s;
}

function refreshVoices() {
  const v = speechSynthesis.getVoices();
  if (v.length) ttsVoices = v;
  if (!selectedVoiceURI && ttsVoices.length) {
    const best = [...ttsVoices].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
    selectedVoiceURI = best?.voiceURI || "";
  }
  if (voiceSelectEl) populateVoiceSelect();
}

function currentVoice(): SpeechSynthesisVoice | undefined {
  return ttsVoices.find((v) => v.voiceURI === selectedVoiceURI);
}

function speak(text: string) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ""));
    u.rate = 1.02;
    const v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u);
  } catch { /* tts unavailable */ }
}

let voiceSelectEl: HTMLSelectElement | null = null;
function populateVoiceSelect() {
  if (!voiceSelectEl) return;
  const ranked = [...ttsVoices]
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
  const list = ranked.length ? ranked : ttsVoices;
  voiceSelectEl.innerHTML = "";
  if (!list.length) {
    voiceSelectEl.append(h("option", { value: "" }, "default voice"));
    return;
  }
  for (const v of list) {
    const opt = h("option", { value: v.voiceURI }, `${v.name}${v.lang ? " · " + v.lang : ""}`) as HTMLOptionElement;
    if (v.voiceURI === selectedVoiceURI) opt.selected = true;
    voiceSelectEl.append(opt);
  }
}

function buildVoiceSelect(): HTMLSelectElement {
  voiceSelectEl = h("select", {
    title: "Interviewer voice — macOS Enhanced/Premium/Siri voices appear here once downloaded (System Settings › Accessibility › Spoken Content › Manage Voices). Best exposed in Safari.",
    style: "max-width:190px",
    onchange: () => {
      selectedVoiceURI = voiceSelectEl!.value;
      try { localStorage.setItem("arena.voiceURI", selectedVoiceURI); } catch { /* private mode */ }
      speak("This is the interviewer voice."); // preview on change
    },
  }) as HTMLSelectElement;
  populateVoiceSelect();
  return voiceSelectEl;
}

// ── finish & debrief ────────────────────────────────────────────────────────

// Poll research status so the topbar badge reflects cache hit / refresh / error.
function startResearchPolling() {
  const tick = async () => {
    try {
      const s = await api<{ status: string; error: string | null }>("/api/portfolio/status", { sessionId: S.sessionId });
      S.researchStatus = s.status as typeof S.researchStatus;
      if (researchBadge) {
        if (s.status === "hit") researchBadge.textContent = "✓ ground truth ready (cached)";
        else if (s.status === "refreshed" || s.status === "created") researchBadge.textContent = "✓ ground truth ready";
        else if (s.status === "error") { researchBadge.textContent = "⚠ research failed"; researchBadge.title = s.error ?? ""; }
        else researchBadge.textContent = "◐ researching…";
      }
      if (s.status !== "pending") clearInterval(S.researchTimer);
    } catch { /* transient; keep polling */ }
  };
  S.researchTimer = setInterval(() => void tick(), 2500);
  void tick();
}

/** Abandons the session: stops all timers and deletes the server-side record. */
async function discardAndExit() {
  S.ended = true; // stops the clock's auto-finish and any pending check-in
  clearInterval(S.clockTimer);
  clearTimeout(S.checkinTimer);
  clearInterval(S.researchTimer);
  if (micEnabled) toggleMic();
  speechSynthesis.cancel();
  try {
    await api("/api/session/discard", { sessionId: S.sessionId });
  } catch {
    // Leaving is what matters; a failed delete shouldn't trap the user here.
  }
  location.reload();
}

async function finishInterview(reason: string) {
  if (S.ended) return;
  S.ended = true;
  clearInterval(S.clockTimer);
  clearTimeout(S.checkinTimer);
  clearInterval(S.researchTimer);
  if (micEnabled) toggleMic();
  speechSynthesis.cancel();

  const isPortfolio = S.track === "portfolio";
  app.innerHTML = "";
  const wrap = h("div", { class: "debrief" },
    h("h1", {}, isPortfolio ? "Defense over" : "Interview over"),
    h("p", { class: "dim" }, isPortfolio
      ? `(${reason}) Grading your defense against the code — waiting on the research agent if it's still reading…`
      : `(${reason}) The interviewer is writing your debrief — scoring the transcript, code, and test results…`));
  app.append(wrap);

  try {
    const res = await api<{ text: string; savedTo?: string; groundTruth?: string }>("/api/interviewer", {
      sessionId: S.sessionId,
      kind: "final",
      questionId: curQ().id,
      elapsedSec: elapsedSec(),
      remainingSec: remainingSec(),
      code: S.code[codeKey()],
      narrationSince: S.narrationBuffer.join("\n"),
      t: now(),
    });
    wrap.innerHTML = marked.parse(res.text) as string;
    if (res.savedTo) wrap.append(h("div", { class: "saved" }, `Saved to ${res.savedTo} (full session log alongside it).`));

    // Portfolio: reveal the agent's ground-truth writeup as a study aid.
    if (isPortfolio && res.groundTruth) {
      const body = h("div", { class: "qprompt", style: "display:none;margin-top:12px;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--panel)" });
      body.innerHTML = marked.parse(res.groundTruth) as string;
      const toggle = h("button", { style: "margin-top:20px",
        onclick: () => { const open = body.style.display !== "none"; body.style.display = open ? "none" : "block"; toggle.textContent = open ? "▸ Reveal ground truth (what the code actually does)" : "▾ Hide ground truth"; },
      }, "▸ Reveal ground truth (what the code actually does)");
      wrap.append(h("div", { style: "margin-top:8px" }, toggle), body);
    }

    wrap.append(h("div", { style: "margin-top:24px" },
      h("button", { class: "primary", onclick: () => location.reload() }, "New session")));
  } catch (e) {
    wrap.append(h("p", { class: "fail" }, `Debrief failed: ${String(e)}`),
      h("p", {}, "Your session log is still saved under sessions/."),
      h("button", { onclick: () => location.reload() }, "Back to setup"));
  }
}

// ════════════════════════════ PAST SESSIONS ═════════════════════════════════

async function showSessions() {
  app.innerHTML = "";
  const listEl = h("div", { class: "session-list" }, h("div", { class: "hint" }, "Loading…"));
  app.append(
    h("div", { class: "setup" },
      h("div", { class: "setup-head" },
        h("h1", {}, "Past sessions"),
        h("button", { onclick: () => void showSetup() }, "← New session"),
      ),
      h("div", { class: "sub" }, "Your saved practice runs — debriefs, the interviewer conversation, and (for Portfolio Defense) the revealed ground truth."),
      listEl,
    ),
  );
  try {
    const { sessions } = await api<{ sessions: SessionSummary[] }>("/api/sessions/list", {});
    listEl.innerHTML = "";
    if (!sessions.length) {
      listEl.append(h("div", { class: "hint" }, "No past sessions yet. Finish (or start) a session and it'll show up here."));
      return;
    }
    for (const s of sessions) {
      const when = new Date(s.createdAt).toLocaleString();
      const mins = Math.max(1, Math.round(s.elapsedSec / 60));
      listEl.append(
        h("div", { class: "session-card", onclick: () => void showSessionDetail(s.id) },
          h("div", { class: "session-title" }, s.title),
          h("div", { class: "session-meta" },
            h("span", { class: "badge" }, s.track.toUpperCase()),
            s.hasDebrief
              ? h("span", { class: "badge ok" }, "✓ debrief")
              : h("span", { class: "badge warn" }, "no debrief"),
            s.ended ? null : h("span", { class: "badge warn" }, "unfinished"),
            h("span", { class: "session-when" }, `${when} · ${mins}m`),
          ),
        ),
      );
    }
  } catch (e) {
    listEl.innerHTML = "";
    listEl.append(h("div", { class: "fail" }, String(e)));
  }
}

async function showSessionDetail(id: string) {
  app.innerHTML = "";
  const body = h("div", {}, h("div", { class: "hint" }, "Loading…"));
  app.append(
    h("div", { class: "debrief" },
      h("div", { class: "setup-head" },
        h("button", { onclick: () => void showSessions() }, "← All sessions"),
        h("button", { onclick: () => void showSetup() }, "New session"),
      ),
      body,
    ),
  );
  try {
    const d = await api<SessionDetail>("/api/sessions/get", { sessionId: id });
    body.innerHTML = "";
    const when = new Date(d.meta.createdAt).toLocaleString();
    const mins = Math.max(1, Math.round(d.meta.elapsedSec / 60));
    body.append(
      h("h1", { style: "margin-top:14px" }, d.meta.title),
      h("div", { class: "hint", style: "margin-bottom:24px" },
        `${d.meta.track.toUpperCase()}${d.meta.position ? " · " + d.meta.position : ""} · ${d.meta.mode.toUpperCase()} mode · ${when} · ${mins}m${d.meta.ended ? "" : " · unfinished"}`),
    );

    // ── debrief ──
    body.append(h("h2", {}, "Debrief"));
    const debriefSec = h("div", {});
    if (d.debrief) {
      const md = h("div", {});
      md.innerHTML = marked.parse(d.debrief) as string;
      debriefSec.append(md);
    } else {
      debriefSec.append(h("p", { class: "hint" }, "No debrief was generated — this session didn't reach the end. You can grade it now from the saved transcript:"));
      const gen = h("button", { class: "primary" }, "Generate debrief now") as HTMLButtonElement;
      gen.onclick = async () => {
        gen.textContent = "Grading transcript…"; gen.disabled = true;
        try {
          const r = await api<{ text: string }>("/api/sessions/debrief", { sessionId: id });
          const md = h("div", {});
          md.innerHTML = marked.parse(r.text) as string;
          debriefSec.innerHTML = "";
          debriefSec.append(md);
        } catch (e) {
          gen.textContent = "Generate debrief now"; gen.disabled = false;
          alert(String(e));
        }
      };
      debriefSec.append(h("div", { style: "margin-top:8px" }, gen));
    }
    body.append(debriefSec);

    // ── transcript ──
    body.append(h("h2", { style: "margin-top:32px" }, "Transcript"));
    body.append(renderTranscript(d.events, d.qTitles));

    // ── ground truth (portfolio) ──
    if (d.groundTruth) {
      const gt = h("div", { class: "qprompt", style: "display:none;margin-top:12px;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--panel)" });
      gt.innerHTML = marked.parse(d.groundTruth) as string;
      const toggle = h("button", {
        style: "margin-top:8px",
        onclick: () => { const open = gt.style.display !== "none"; gt.style.display = open ? "none" : "block"; toggle.textContent = open ? "▸ Reveal ground truth (what the code actually does)" : "▾ Hide ground truth"; },
      }, "▸ Reveal ground truth (what the code actually does)");
      body.append(h("h2", { style: "margin-top:32px" }, "Ground truth"), toggle, gt);
    }
  } catch (e) {
    body.innerHTML = "";
    body.append(h("div", { class: "fail" }, String(e)));
  }
}

function fmtClock(ms: number): string {
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
}

// Renders the saved event log as a readable conversation. Consecutive narration
// snippets are coalesced into one block so a session with 100+ voice fragments
// reads as a few paragraphs, not a wall of one-liners.
function renderTranscript(events: ReviewEvent[], qTitles: Record<string, string>): HTMLElement {
  const feed = h("div", { class: "feed review-feed" });
  let narr: string[] = [];
  let narrStart = 0;
  const flush = () => {
    if (!narr.length) return;
    feed.append(h("div", { class: "msg me" },
      h("div", { class: "who" }, `You · narration · ${fmtClock(narrStart)}`), narr.join(" ")));
    narr = [];
  };
  for (const e of events) {
    if (e.type === "narration") {
      if (!narr.length) narrStart = e.t;
      narr.push(String(e.data.text ?? ""));
      continue;
    }
    flush();
    const at = fmtClock(e.t);
    if (e.type === "interviewer") {
      feed.append(h("div", { class: "msg interviewer" }, h("div", { class: "who" }, `Interviewer · ${at}`), String(e.data.text ?? "")));
    } else if (e.type === "candidate-ask") {
      feed.append(h("div", { class: "msg me" }, h("div", { class: "who" }, `You · ${at}`), String(e.data.text ?? "")));
    } else if (e.type === "assistant-prompt") {
      feed.append(h("div", { class: "msg me" }, h("div", { class: "who" }, `You → AI · ${at}`), String(e.data.text ?? "")));
    } else if (e.type === "assistant-reply") {
      const el = h("div", { class: "msg assistant" }, h("div", { class: "who" }, `AI assistant · ${at}`));
      const b = h("div", {}); b.innerHTML = marked.parse(String(e.data.text ?? "")) as string; el.append(b);
      feed.append(el);
    } else if (e.type === "run") {
      feed.append(h("div", { class: "review-row" }, `▶ ${at} — ${String(e.data.summary ?? "ran code")}`));
    } else if (e.type === "question-switch") {
      const qid = e.questionId ?? "";
      feed.append(h("div", { class: "review-divider" }, `— moved to ${qTitles[qid] ?? qid} · ${at} —`));
    } else if (e.type === "research-hit" || e.type === "research-refresh") {
      feed.append(h("div", { class: "review-row dim" }, `⚙ ${at} — research ${e.type === "research-hit" ? "served from cache" : "re-read the code"}`));
    } else if (e.type === "research-error") {
      feed.append(h("div", { class: "review-row fail" }, `⚙ ${at} — research failed: ${String(e.data.error ?? "")}`));
    }
    // start / end / ground-truth are handled outside the timeline
  }
  flush();
  if (!feed.childNodes.length) feed.append(h("div", { class: "hint" }, "No conversation was recorded in this session."));
  return feed;
}

// ── boot ────────────────────────────────────────────────────────────────────

// Voices load asynchronously in some browsers (Chrome fires voiceschanged).
if (typeof speechSynthesis !== "undefined") {
  refreshVoices();
  speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

void showSetup();
