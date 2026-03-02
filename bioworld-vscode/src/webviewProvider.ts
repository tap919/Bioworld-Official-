import * as vscode from 'vscode';
import type { Socket } from 'socket.io-client';

/**
 * Provides webview content for each BioWorld sidebar panel.
 * UI theme: digital wet lab — bioluminescent teal accents on dark surfaces.
 */
export class BioWorldWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private socket?: Socket;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly viewId: string,
    private readonly socketUrl: string,
  ) {}

  /** Called by VS Code when the view becomes visible. */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg: { cmd: string; [key: string]: unknown }) => {
      this.handleMessage(msg);
    });
  }

  /** Forward a message into the webview. */
  public postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  /** Inject the live socket so commands can relay events. */
  public setSocket(sock: Socket): void {
    this.socket = sock;
  }

  // ── HTML builder ─────────────────────────────────────────────

  private getHtml(): string {
    const nonce = getNonce();
    const body = getViewContent(this.viewId);

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             connect-src ${this.socketUrl};
             script-src 'nonce-${nonce}';
             style-src 'unsafe-inline';">
  <style>
    /* ── Reset & base ─────────────────────────────────────── */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bio-accent:    #00e5cc;
      --bio-green:     #3de87a;
      --bio-amber:     #f0b429;
      --bio-red:       #ff4d4d;
      --bio-surface:   rgba(0, 229, 204, 0.04);
      --bio-surface2:  rgba(0, 229, 204, 0.09);
      --bio-border:    rgba(0, 229, 204, 0.14);
      --bio-border-hi: rgba(0, 229, 204, 0.42);
      --bio-glow:      0 0 10px rgba(0, 229, 204, 0.18);
      --r: 5px;
    }
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 8px 10px 16px;
    }

    /* ── Panel header ─────────────────────────────────────── */
    .ph {
      display: flex; align-items: center; gap: 7px;
      padding: 7px 10px; margin-bottom: 10px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-left: 3px solid var(--bio-accent);
      border-radius: var(--r);
    }
    .ph-icon  { font-size: 1.1em; }
    .ph-title {
      font-size: 0.8em; font-weight: 700;
      letter-spacing: 0.09em; text-transform: uppercase;
      color: var(--bio-accent);
    }
    .ph-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--bio-accent); margin-left: auto;
      animation: blink 2.4s ease-in-out infinite;
    }

    /* ── Cards ────────────────────────────────────────────── */
    .card {
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      padding: 9px 10px;
      margin-bottom: 7px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .card:hover { border-color: var(--bio-border-hi); box-shadow: var(--bio-glow); }
    .ch {
      display: flex; align-items: center;
      justify-content: space-between;
      margin-bottom: 7px;
    }
    .ch h2 {
      font-size: 0.76em; font-weight: 700;
      letter-spacing: 0.07em; text-transform: uppercase;
      color: var(--bio-accent);
    }

    /* ── Rank / XP ────────────────────────────────────────── */
    .rank-row {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 10px; margin-bottom: 7px;
      background: var(--bio-surface2);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
    }
    .rank-orb {
      width: 34px; height: 34px; flex-shrink: 0;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 1.1em;
      border: 2px solid var(--bio-accent);
      background: var(--bio-surface);
      box-shadow: var(--bio-glow);
    }
    .rank-info { flex: 1; min-width: 0; }
    .rank-name { font-weight: 700; font-size: 0.88em; color: var(--bio-accent); }
    .rank-sub  { font-size: 0.72em; opacity: 0.6; }
    .xp-track  { height: 3px; background: var(--bio-surface2); border-radius: 2px; margin-top: 4px; overflow: hidden; }
    .xp-fill   { height: 100%; background: linear-gradient(90deg, var(--bio-accent), var(--bio-green)); border-radius: 2px; transition: width 0.6s; width: 0; }

    /* ── Metrics ──────────────────────────────────────────── */
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 7px; }
    .metric {
      text-align: center; padding: 7px 4px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
    }
    .metric-val { font-size: 1.35em; font-weight: 700; color: var(--bio-accent); }
    .metric-lbl { font-size: 0.68em; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.55; }

    /* ── Buttons ──────────────────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 11px;
      border: 1px solid var(--bio-border-hi);
      border-radius: var(--r);
      cursor: pointer; font-size: 0.8em; font-weight: 600;
      letter-spacing: 0.03em;
      color: var(--bio-accent);
      background: var(--bio-surface);
      transition: background 0.15s, box-shadow 0.15s;
    }
    .btn:hover { background: var(--bio-surface2); box-shadow: var(--bio-glow); }
    .btn.p { color: #071211; background: var(--bio-accent); border-color: var(--bio-accent); }
    .btn.p:hover { background: #00c4af; box-shadow: var(--bio-glow); }
    .btn.sm { padding: 3px 8px; font-size: 0.75em; }
    .btn.full { width: 100%; justify-content: center; }

    /* ── Inputs ───────────────────────────────────────────── */
    input, textarea, select {
      width: 100%;
      padding: 5px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      font-size: 0.82em;
      font-family: inherit;
      outline: none;
      transition: border-color 0.18s;
    }
    input:focus, textarea:focus, select:focus { border-color: var(--bio-accent); }

    /* ── Badges ───────────────────────────────────────────── */
    .bdg {
      display: inline-flex; align-items: center;
      padding: 1px 6px; border-radius: 9px;
      font-size: 0.68em; font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .bdg-beginner     { color: #5bc8f5; border: 1px solid rgba(91,200,245,0.35);  background: rgba(91,200,245,0.08); }
    .bdg-intermediate { color: var(--bio-green);  border: 1px solid rgba(61,232,122,0.35); background: rgba(61,232,122,0.08); }
    .bdg-advanced     { color: var(--bio-amber);  border: 1px solid rgba(240,180,41,0.35); background: rgba(240,180,41,0.08); }
    .bdg-expert       { color: var(--bio-red);    border: 1px solid rgba(255,77,77,0.35);  background: rgba(255,77,77,0.08); }

    /* ── Lists / leaderboard ──────────────────────────────── */
    ul { list-style: none; padding: 0; }
    #leaderboard li {
      display: flex; align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid var(--bio-border);
      font-size: 0.8em;
    }
    #leaderboard li:last-child { border-bottom: none; }
    .lb-n    { width: 20px; font-weight: 700; color: var(--bio-accent); opacity: 0.65; }
    .lb-name { flex: 1; }
    .lb-xp   { font-size: 0.78em; opacity: 0.55; }

    /* ── Chat ─────────────────────────────────────────────── */
    #chat {
      max-height: 130px; overflow-y: auto; padding: 6px;
      background: var(--bio-surface); border: 1px solid var(--bio-border);
      border-radius: var(--r); margin-bottom: 5px; font-size: 0.79em;
    }
    #chat p { padding: 2px 0; border-bottom: 1px solid var(--bio-border); }
    #chat p:last-child { border-bottom: none; }

    /* ── Lab items ────────────────────────────────────────── */
    .lab-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; margin-bottom: 5px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      transition: border-color 0.2s;
    }
    .lab-item:hover { border-color: var(--bio-border-hi); }
    .lab-ico  { font-size: 1.25em; }
    .lab-body { flex: 1; min-width: 0; }
    .lab-nm   { font-weight: 700; font-size: 0.85em; }
    .lab-mt   { font-size: 0.72em; opacity: 0.55; }

    /* ── Pipeline presets & stages ────────────────────────── */
    .presets { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
    .pb {
      padding: 3px 9px;
      border: 1px solid var(--bio-border);
      border-radius: 10px; font-size: 0.76em; cursor: pointer;
      background: var(--bio-surface); color: var(--vscode-foreground);
      transition: all 0.15s;
    }
    .pb:hover, .pb.on { border-color: var(--bio-accent); color: var(--bio-accent); background: var(--bio-surface2); }
    .stages {
      display: flex; align-items: center; flex-wrap: wrap; gap: 3px;
      min-height: 38px; padding: 6px 8px; margin-bottom: 7px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
    }
    .stage {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 7px;
      background: var(--bio-surface2);
      border: 1px solid var(--bio-border-hi);
      border-radius: 4px; font-size: 0.76em; font-weight: 600;
      color: var(--bio-accent);
    }
    .stage .x { cursor: pointer; opacity: 0.45; font-size: 0.88em; }
    .stage .x:hover { opacity: 1; color: var(--bio-red); }
    .arrow { font-size: 0.8em; opacity: 0.38; }
    .stages-empty { font-size: 0.77em; opacity: 0.4; font-style: italic; }

    /* ── Active experiment rows ───────────────────────────── */
    .exp-row {
      display: flex; align-items: center; gap: 7px;
      padding: 6px 8px; margin-bottom: 5px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
    }
    .exp-ico  { font-size: 1.05em; flex-shrink: 0; }
    .exp-body { flex: 1; min-width: 0; }
    .exp-nm   { font-size: 0.8em; font-weight: 600; }
    .exp-st   { font-size: 0.7em; opacity: 0.55; }
    .prog-track { height: 3px; background: var(--bio-surface2); border-radius: 2px; margin-top: 3px; overflow: hidden; }
    .prog-fill  { height: 100%; background: var(--bio-green); border-radius: 2px; transition: width 0.4s; }

    /* ── Experiment log ───────────────────────────────────── */
    #experimentLog {
      max-height: 120px; overflow-y: auto; padding: 6px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      font-size: 0.76em;
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
    }
    #experimentLog p { color: var(--bio-green); padding: 1px 0; }

    /* ── Utilities ────────────────────────────────────────── */
    .hidden { display: none !important; }
    .hr     { height: 1px; background: var(--bio-border); margin: 7px 0; }
    .lbl    {
      font-size: 0.7em; font-weight: 700; letter-spacing: 0.09em;
      text-transform: uppercase; color: var(--bio-accent); opacity: 0.65;
      margin-bottom: 5px;
    }
    .row    { display: flex; align-items: center; gap: 5px; }
    .row > * { flex: 1; }
    .row > .btn { flex: 0 0 auto; }
    .dim    { opacity: 0.45; font-style: italic; font-size: 0.8em; }
    .sp     { margin-bottom: 5px; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

    /* ── Resource / inventory rows ────────────────────────── */
    .resource-row {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 8px; margin-bottom: 3px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      font-size: 0.82em;
    }
    .res-icon { font-size: 1.05em; flex-shrink: 0; }
    .res-name { flex: 1; font-weight: 600; }
    .res-qty  { color: var(--bio-green); font-weight: 700; font-size: 0.88em; }

    /* ── Outpost items ────────────────────────────────────── */
    .outpost-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; margin-bottom: 5px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      transition: border-color 0.2s;
    }
    .outpost-item:hover { border-color: var(--bio-border-hi); }
    .outpost-icon { font-size: 1.25em; }
    .outpost-body { flex: 1; min-width: 0; }
    .outpost-nm   { font-weight: 700; font-size: 0.85em; }
    .outpost-desc { font-size: 0.72em; opacity: 0.55; }

    /* ── Faction items ────────────────────────────────────── */
    .faction-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; margin-bottom: 5px;
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      transition: border-color 0.2s;
    }
    .faction-item:hover { border-color: var(--bio-border-hi); }
    .faction-icon { font-size: 1.25em; }
    .faction-body { flex: 1; min-width: 0; }
    .faction-nm   { font-weight: 700; font-size: 0.85em; color: var(--bio-accent); }
    .faction-desc { font-size: 0.72em; opacity: 0.55; }

    /* ── Region cards (world map) ─────────────────────────── */
    .region-card {
      background: var(--bio-surface);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
      padding: 9px 10px; margin-bottom: 7px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .region-card:hover { border-color: var(--bio-border-hi); box-shadow: var(--bio-glow); }
    .region-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .region-nm  { font-weight: 700; font-size: 0.85em; }
    .region-res { display: flex; flex-wrap: wrap; gap: 4px; }
    .region-res .bdg { cursor: pointer; }

    /* ── Progression track ────────────────────────────────── */
    .prog-row {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 10px; margin-bottom: 7px;
      background: var(--bio-surface2);
      border: 1px solid var(--bio-border);
      border-radius: var(--r);
    }
    .prog-orb {
      width: 34px; height: 34px; flex-shrink: 0;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 1.1em;
      border: 2px solid var(--bio-green);
      background: var(--bio-surface);
      box-shadow: 0 0 10px rgba(61,232,122,0.18);
    }
    .prog-info { flex: 1; min-width: 0; }
    .prog-tier { font-weight: 700; font-size: 0.88em; color: var(--bio-green); }
    .prog-sub  { font-size: 0.72em; opacity: 0.6; }
  </style>
</head>
<body>
  ${body}
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg && typeof msg === 'object') { handleHostMessage(msg); }
    });

    function sendToHost(cmd, data) { vscodeApi.postMessage({ cmd, ...data }); }

    // ── Active experiment state ───────────────────────────────
    let activeExps = {};
    const PROGRESS_UPDATE_INTERVAL_MS   = 700;
    const MAX_SIMULATED_PROGRESS        = 99;
    const MAX_PROGRESS_INCREMENT        = 12;
    const MIN_PROGRESS_INCREMENT        = 3;
    const COMPLETED_EXP_DISPLAY_DURATION_MS = 4000;

    // ── Pipeline builder state ────────────────────────────────
    let pipelineStages = [];
    const PRESETS = {
      crispr:     ['Target ID', 'Guide RNA Design', 'Delivery', 'Off-target Analysis', 'Validation'],
      folding:    ['Sequence Input', '2° Structure', '3° Prediction', 'Energy Min.', 'QC'],
      drug:       ['Target Selection', 'Library Screen', 'Binding Affinity', 'ADMET', 'Lead Opt.'],
      expression: ['Sample Prep', 'RNA Extraction', 'Sequencing', 'Alignment', 'Diff. Expression'],
      custom:     [],
    };

    // ── Init ──────────────────────────────────────────────────
    (function init() {
      // Quick-launch experiment button
      const runBtn = document.getElementById('runExpBtn');
      if (runBtn) {
        runBtn.addEventListener('click', () => {
          const type   = document.getElementById('expType')?.value || '';
          const raw    = document.getElementById('expParams')?.value || '{}';
          const errEl  = document.getElementById('expError');
          let params;
          try { params = JSON.parse(raw); }
          catch {
            if (errEl) { errEl.textContent = 'Invalid JSON — check format.'; errEl.classList.remove('hidden'); }
            return;
          }
          if (errEl) errEl.classList.add('hidden');
          startExp(type || 'Experiment');
          sendToHost('runExperiment', { type, params });
        });
      }

      // Delegated challenge accept handler
      document.getElementById('challenges')?.addEventListener('click', e => {
        const btn = e.target?.closest?.('button[data-challenge-id]');
        if (btn) sendToHost('acceptChallenge', { challengeId: btn.dataset.challengeId });
      });

      // Pipeline preset buttons
      document.querySelectorAll('.pb[data-preset]').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.pb').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          pipelineStages = [...(PRESETS[b.dataset.preset] || [])];
          renderStages();
        });
      });

      // Add stage
      document.getElementById('addStageBtn')?.addEventListener('click', addStageFromInput);
      document.getElementById('stageInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addStageFromInput();
      });

      // Launch pipeline as experiment
      document.getElementById('launchPipelineBtn')?.addEventListener('click', () => {
        if (!pipelineStages.length) return;
        const name = document.getElementById('pipelineName')?.value?.trim() || 'Pipeline';
        startExp(name);
        sendToHost('runExperiment', { type: name, params: { stages: pipelineStages } });
      });

      // Post trade offer with validation
      document.getElementById('postTradeBtn')?.addEventListener('click', () => {
        const resource     = document.getElementById('tradeOffer')?.value || '';
        const wantResource = document.getElementById('tradeWant')?.value || '';
        const qty     = parseInt(document.getElementById('tradeOfferQty')?.value, 10);
        const wantQty = parseInt(document.getElementById('tradeWantQty')?.value, 10);
        if (!qty || qty < 1 || !wantQty || wantQty < 1) return;
        sendToHost('offerTrade', { resource, qty, wantResource, wantQty });
      });
    })();

    function addStageFromInput() {
      const input = document.getElementById('stageInput');
      const val = input?.value?.trim();
      if (val) { pipelineStages.push(val); input.value = ''; renderStages(); }
    }

    function renderStages() {
      const el = document.getElementById('pipelineStages');
      if (!el) return;
      if (!pipelineStages.length) {
        el.innerHTML = '<span class="stages-empty">Select a preset or add custom stages</span>';
        return;
      }
      el.innerHTML = pipelineStages.map((s, i) =>
        (i ? '<span class="arrow">→</span>' : '') +
        '<span class="stage">' + esc(s) +
        '<span class="x" data-i="' + i + '">✕</span></span>'
      ).join('');
      el.querySelectorAll('.x').forEach(x =>
        x.addEventListener('click', () => { pipelineStages.splice(+x.dataset.i, 1); renderStages(); })
      );
    }

    // ── Experiment tracking ───────────────────────────────────
    function startExp(type) {
      const id = Date.now();
      activeExps[id] = { id, type, pct: 0, done: false };
      logLine('⏳ Started: ' + type);
      renderExps();
      const iv = setInterval(() => {
        const exp = activeExps[id];
        if (!exp) {
          clearInterval(iv);
          return;
        }
        if (exp.done) {
          clearInterval(iv);
          return;
        }
        exp.pct = Math.min(
          MAX_SIMULATED_PROGRESS,
          exp.pct + Math.random() * MAX_PROGRESS_INCREMENT + MIN_PROGRESS_INCREMENT
        );
        renderExps();
        if (exp.pct >= MAX_SIMULATED_PROGRESS) {
          clearInterval(iv);
        }
      }, PROGRESS_UPDATE_INTERVAL_MS);
      // Track interval handle on the experiment so we can cancel it on completion.
      activeExps[id].iv = iv;
    }

    function completeExp(type, result) {
      // Among all non-done runs of this type, complete the most recently started one.
      // This handles simultaneous runs of the same experiment type correctly.
      // IDs are Date.now() timestamps, so higher id === more recently started.
      const exp = Object.values(activeExps)
        .filter(e => e.type === type && !e.done)
        .reduce((latest, e) => (!latest || e.id > latest.id) ? e : latest, null);
      if (exp) {
        if (exp.iv) {
          clearInterval(exp.iv);
        }
        exp.pct = 100;
        exp.done = true;
        renderExps();
        setTimeout(() => { delete activeExps[exp.id]; renderExps(); }, COMPLETED_EXP_DISPLAY_DURATION_MS);
      }
      logLine('✅ Complete [' + type + ']' + (result ? ' — ' + JSON.stringify(result) : ''));
    }

    function renderExps() {
      const el = document.getElementById('activeExps');
      if (!el) return;
      const list = Object.values(activeExps);
      if (!list.length) {
        el.innerHTML = '<p class="dim" style="padding:4px">No active experiments</p>';
        return;
      }
      el.innerHTML = list.map(e =>
        '<div class="exp-row">' +
        '<span class="exp-ico">' + (e.done ? '✅' : '🔬') + '</span>' +
        '<div class="exp-body">' +
          '<div class="exp-nm">' + esc(e.type) + '</div>' +
          '<div class="exp-st">' + (e.done ? 'Complete' : Math.round(e.pct) + '%…') + '</div>' +
          '<div class="prog-track"><div class="prog-fill" style="width:' + e.pct + '%"></div></div>' +
        '</div></div>'
      ).join('');
    }

    function logLine(text) {
      const el = document.getElementById('experimentLog');
      if (!el) return;
      const p = document.createElement('p');
      p.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
      el.appendChild(p);
      el.scrollTop = el.scrollHeight;
    }

    // ── Message handler ───────────────────────────────────────
    function handleHostMessage(msg) {
      switch (msg.cmd) {
        case 'chatMessage':         appendChat(msg.text); break;
        case 'leaderboardUpdate':   renderLeaderboard(msg.ranks); break;
        case 'marketUpdate':        renderListings(msg.listings); break;
        case 'agentUpdate':         renderAgents(msg.agents); break;
        case 'newInitiative':       document.getElementById('initiativeForm')?.classList.toggle('hidden'); break;
        case 'challengeUpdate':     renderChallenges(msg.challenges); break;
        case 'achievementUnlocked': appendAchievement(msg.name, msg.xp); break;
        case 'showAchievements':    document.getElementById('achievementsSection')?.classList.remove('hidden'); break;
        case 'skillRankUpdate':     updateRank(msg.rank, msg.xp, msg.nextRank, msg.progress); break;
        case 'experimentStarted':   startExp(msg.type); break;
        case 'experimentResult':    completeExp(msg.type, msg.result); break;
        case 'resourceGathered':    appendResource(msg.resource, msg.qty); break;
        case 'outpostDiscovered':   appendOutpost(msg.outpost); break;
        case 'outpostUpdate':       renderOutposts(msg.outposts); break;
        case 'factionUpdate':       renderFactions(msg.factions); break;
        case 'factionJoined':       highlightFaction(msg.factionId); break;
        case 'tradeOffer':          appendTradeOffer(msg); break;
        case 'tradeComplete':       logTrade(msg); break;
        case 'inventoryUpdate':     renderInventory(msg.inventory); break;
        case 'progressionUpdate':   renderProgression(msg); break;
        case 'explore':             logLine('🗺️ Exploring the world…'); break;
      }
    }

    // ── Sanitization ──────────────────────────────────────────
    function esc(str) {
      const d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }

    // ── Dashboard helpers ─────────────────────────────────────
    function appendChat(text) {
      const el = document.getElementById('chat');
      if (!el) return;
      const p = document.createElement('p');
      p.textContent = text;
      el.appendChild(p);
      el.scrollTop = el.scrollHeight;
    }

    function renderLeaderboard(ranks) {
      const el = document.getElementById('leaderboard');
      if (!el || !Array.isArray(ranks)) return;
      el.innerHTML = ranks.map((r, i) =>
        '<li><span class="lb-n">' + (i + 1) + '</span>' +
        '<span class="lb-name">' + esc(r.name) + '</span>' +
        '<span class="lb-xp">' + esc(r.xp) + ' XP</span></li>'
      ).join('');
    }

    function updateRank(rank, xp, nextRank, progress) {
      const nameEl = document.getElementById('rankName');
      const subEl  = document.getElementById('rankSub');
      const fillEl = document.getElementById('xpFill');
      if (nameEl) nameEl.textContent = rank || '—';
      if (subEl)  subEl.textContent  = (xp || 0) + ' XP' + (nextRank ? ' → ' + nextRank : '');
      if (fillEl) fillEl.style.width = (progress || 0) + '%';
    }

    function renderChallenges(challenges) {
      const el = document.getElementById('challenges');
      if (!el || !Array.isArray(challenges)) return;
      el.innerHTML = challenges.map(c =>
        '<div class="card">' +
        '<div class="ch"><strong style="font-size:0.84em">' + esc(c.title) + '</strong>' +
        '<span class="bdg bdg-' + esc(c.difficulty) + '">' + esc(c.difficulty) + '</span></div>' +
        '<p style="font-size:0.77em;opacity:0.72;margin-bottom:5px">' + esc(c.description) + '</p>' +
        '<div class="row"><span style="font-size:0.74em;color:var(--bio-green)">+' + esc(c.reward) + ' XP</span>' +
        '<button class="btn sm" data-challenge-id="' + esc(c.id) + '">Accept →</button></div></div>'
      ).join('');
    }

    function appendAchievement(name, xp) {
      const el = document.getElementById('achievements');
      if (!el) return;
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = '🏆 <strong>' + esc(name) + '</strong>' +
        (xp ? ' <span style="color:var(--bio-green);font-size:0.84em">+' + esc(xp) + ' XP</span>' : '');
      el.prepend(d);
      document.getElementById('achievementsSection')?.classList.remove('hidden');
    }

    // ── Marketplace helpers ───────────────────────────────────
    function renderListings(listings) {
      const el = document.getElementById('listings');
      if (!el || !Array.isArray(listings)) return;
      el.innerHTML = listings.map(l =>
        '<div class="card">' +
        '<div class="ch"><strong style="font-size:0.84em">' + esc(l.name) + '</strong>' +
        '<span class="bdg bdg-beginner">' + esc(l.type || 'tool') + '</span></div>' +
        '<p style="font-size:0.77em;opacity:0.68;margin-bottom:5px">' + esc(l.description) + '</p>' +
        '<div class="row"><span style="font-size:0.78em;color:var(--bio-accent)">' + esc(l.price) + ' cr</span>' +
        '<button class="btn sm p" data-id="' + esc(l.id) + '">Acquire</button></div></div>'
      ).join('');
      el.querySelectorAll('button[data-id]').forEach(btn =>
        btn.addEventListener('click', () => sendToHost('buyTool', { listingId: btn.dataset.id }))
      );
    }

    // ── Agent helpers ─────────────────────────────────────────
    function renderAgents(agents) {
      const el = document.getElementById('myAgents');
      if (!el || !Array.isArray(agents)) return;
      el.innerHTML = agents.map(a =>
        '<div class="card">' +
        '<div class="ch"><strong style="font-size:0.84em">' + esc(a.name) + '</strong>' +
        '<span class="bdg ' + (a.fitted ? 'bdg-intermediate' : 'bdg-advanced') + '">' +
        (a.fitted ? 'ACTIVE' : 'FITTING') + '</span></div>' +
        '<div style="font-size:0.73em;opacity:0.55">' + (a.openclawUrl ? esc(a.openclawUrl) : 'Configuring…') + '</div></div>'
      ).join('');
    }

    // ── Resource / inventory helpers ──────────────────────────
    function appendResource(resource, qty) {
      const el = document.getElementById('inventory');
      if (!el) return;
      const safeQty = parseInt(qty, 10) || 0;

      // Try to update an existing row for this resource instead of appending a duplicate
      const existingRows = el.querySelectorAll('.resource-row');
      for (let i = 0; i < existingRows.length; i++) {
        const row = existingRows[i];
        const nameEl = row.querySelector('.res-name');
        if (nameEl && (nameEl.textContent || '').trim() === resource) {
          const qtyEl = row.querySelector('.res-qty');
          if (qtyEl) {
            const current = parseInt(qtyEl.textContent, 10) || 0;
            qtyEl.textContent = String(current + safeQty);
          }
          logLine('📦 Gathered ' + safeQty + '× ' + resource);
          return;
        }
      }

      // No existing row — create a new one
      const row = document.createElement('div');
      row.className = 'resource-row';
      row.innerHTML = '<span class="res-name">' + esc(resource) + '</span><span class="res-qty">' + esc(safeQty) + '</span>';
      el.appendChild(row);
      logLine('📦 Gathered ' + safeQty + '× ' + resource);
    }

    function renderInventory(inventory) {
      const el = document.getElementById('inventory');
      if (!el || !Array.isArray(inventory)) return;
      el.innerHTML = inventory.map(r =>
        '<div class="resource-row">' +
        '<span class="res-icon">' + esc(r.icon || '📦') + '</span>' +
        '<span class="res-name">' + esc(r.name) + '</span>' +
        '<span class="res-qty">' + esc(r.qty) + '</span></div>'
      ).join('');
    }

    // ── Outpost helpers ───────────────────────────────────────
    function validateUrl(url) {
      try {
        const parsed = new URL(String(url));
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.toString();
        }
      } catch {
        // ignore parse errors
      }
      return null;
    }

    function appendOutpost(outpost) {
      const el = document.getElementById('outposts');
      if (!el) return;

      const d = document.createElement('div');
      d.className = 'outpost-item';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'outpost-icon';
      iconSpan.textContent = outpost.icon || '🏕️';
      d.appendChild(iconSpan);

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'outpost-body';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'outpost-nm';
      nameDiv.textContent = outpost.name;
      bodyDiv.appendChild(nameDiv);

      const descDiv = document.createElement('div');
      descDiv.className = 'outpost-desc';
      descDiv.textContent = outpost.desc || '';
      bodyDiv.appendChild(descDiv);

      d.appendChild(bodyDiv);

      if (outpost.url) {
        const safeUrl = validateUrl(outpost.url);
        if (safeUrl) {
          const link = document.createElement('a');
          link.className = 'btn sm';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.href = safeUrl;
          link.textContent = 'Visit →';
          d.appendChild(link);
        }
      }

      el.appendChild(d);
    }

    function renderOutposts(outposts) {
      const el = document.getElementById('outposts');
      if (!el || !Array.isArray(outposts)) return;
      el.innerHTML = '';
      outposts.forEach(o => appendOutpost(o));
    }

    // ── Faction helpers ───────────────────────────────────────
    function renderFactions(factions) {
      const el = document.getElementById('factions');
      if (!el || !Array.isArray(factions)) return;
      el.innerHTML = factions.map(f =>
        '<div class="faction-item" data-fid="' + esc(f.id) + '">' +
        '<span class="faction-icon">' + esc(f.icon || '⚗️') + '</span>' +
        '<div class="faction-body">' +
        '<div class="faction-nm">' + esc(f.name) + '</div>' +
        '<div class="faction-desc">' + esc(f.members || 0) + ' members · ' + esc(f.territory || '—') + '</div></div>' +
        '<button class="btn sm" data-faction-id="' + esc(f.id) + '">Pledge →</button>' +
        '</div>'
      ).join('');
    }

    const factionsRoot = document.getElementById('factions');
    if (factionsRoot) {
      factionsRoot.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button[data-faction-id]');
        if (!btn || !factionsRoot.contains(btn)) return;
        const factionId = btn.getAttribute('data-faction-id');
        if (!factionId) return;
        sendToHost('joinFaction', { factionId: factionId });
      });
    }
    function highlightFaction(factionId) {
      document.querySelectorAll('.faction-item').forEach(el => {
        el.style.borderColor = (el.dataset.fid === factionId)
          ? 'var(--bio-accent)'
          : 'var(--bio-border)';
      });
    }

    // ── Trade / barter helpers ────────────────────────────────
    const tradeBoardRoot = document.getElementById('tradeBoard');
    if (tradeBoardRoot) {
      tradeBoardRoot.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button[data-trade-id]');
        if (!btn || !tradeBoardRoot.contains(btn)) return;
        const tradeId = btn.getAttribute('data-trade-id');
        if (!tradeId) return;
        sendToHost('acceptTrade', { tradeId: tradeId });
      });
    }

    // ── World region resource gathering (delegated) ───────────
    document.querySelectorAll('.region-res').forEach(function (container) {
      container.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const badge = target.closest('.bdg[data-region-id]');
        if (!badge) return;
        const regionId = badge.getAttribute('data-region-id');
        const resourceType = badge.getAttribute('data-resource-type');
        if (!regionId || !resourceType) return;
        sendToHost('gatherResource', { regionId: regionId, resourceType: resourceType });
      });
    });

    // ── World outpost scouting (delegated) ────────────────────
    const outpostsRoot = document.getElementById('outposts');
    if (outpostsRoot) {
      outpostsRoot.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button[data-outpost-id]');
        if (!btn || !outpostsRoot.contains(btn)) return;
        const outpostId = btn.getAttribute('data-outpost-id');
        if (!outpostId) return;
        sendToHost('scoutOutpost', { outpostId: outpostId });
      });
    }

    function appendTradeOffer(offer) {
      const el = document.getElementById('tradeBoard');
      if (!el) return;
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML =
        '<div class="ch"><strong style="font-size:0.84em">' + esc(offer.from || 'Trader') + '</strong>' +
        '<span class="bdg bdg-intermediate">OFFER</span></div>' +
        '<p style="font-size:0.77em;opacity:0.72;margin-bottom:5px">Offering ' +
        esc(offer.qty || 1) + '× ' + esc(offer.resource || '?') +
        (offer.wantResource ? ' for ' + esc(offer.wantQty || '?') + '× ' + esc(offer.wantResource) : '') + '</p>' +
        '<button class="btn sm p" data-trade-id="' + esc(offer.tradeId || '') + '">Accept Trade</button>';
      el.prepend(d);
    }

    function logTrade(info) {
      logLine('🤝 Trade complete: ' + esc(info.summary || 'Resources exchanged'));
    }

    // ── Citizen-scientist progression helper ──────────────────
    function renderProgression(data) {
      const tierEl  = document.getElementById('progTier');
      const descEl  = document.getElementById('progDesc');
      const fillEl  = document.getElementById('progFill');
      const nextEl  = document.getElementById('progNext');
      if (tierEl) tierEl.textContent = data.tier || 'Citizen Scientist';
      if (descEl) descEl.textContent = data.desc || '';
      if (nextEl) nextEl.textContent = data.nextTier ? '→ ' + data.nextTier : '';
      if (fillEl) {
        var rawProgress = Number(data && data.progress);
        if (!Number.isFinite(rawProgress)) {
          rawProgress = 0;
        }
        var clampedProgress = Math.min(100, Math.max(0, rawProgress));
        fillEl.style.width = clampedProgress + '%';
      }
    }
  </script>
</body>
</html>`;
  }

  private handleMessage(msg: { cmd: string; [key: string]: unknown }): void {
    switch (msg.cmd) {
      case 'joinLab':
        this.socket?.emit('joinLab', { labId: msg.labId });
        break;
      case 'sendChat': {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 2000) : '';
        if (text) {
          this.socket?.emit('chatMessage', { text });
        }
        break;
      }
      case 'buyTool':
        this.socket?.emit('buyTool', { listingId: msg.listingId });
        break;
      case 'publishTool':
        this.socket?.emit('publishTool', msg);
        break;
      case 'registerAgent':
        this.socket?.emit('registerAgent', msg);
        break;
      case 'runExperiment':
        this.socket?.emit('runExperiment', { type: msg.type, params: msg.params });
        break;
      case 'acceptChallenge':
        this.socket?.emit('acceptChallenge', { challengeId: msg.challengeId });
        break;
      case 'gatherResource':
        this.socket?.emit('gatherResource', { regionId: msg.regionId, resourceType: msg.resourceType });
        break;
      case 'joinFaction':
        this.socket?.emit('joinFaction', { factionId: msg.factionId });
        break;
      case 'offerTrade':
        this.socket?.emit('tradeOffer', { resource: msg.resource, qty: msg.qty, wantResource: msg.wantResource, wantQty: msg.wantQty });
        break;
      case 'acceptTrade':
        this.socket?.emit('acceptTrade', { tradeId: msg.tradeId });
        break;
      case 'scoutOutpost':
        this.socket?.emit('scoutOutpost', { outpostId: msg.outpostId });
        break;
    }
  }
}

// ── View content (HTML per panel) ────────────────────────────

function getViewContent(viewId: string): string {
  switch (viewId) {

    // ── Dashboard ─────────────────────────────────────────────
    case 'dashboard':
      return /* html */ `
<div class="ph"><span class="ph-icon">🧬</span><span class="ph-title">BioWorld Command Center</span><span class="ph-dot"></span></div>

<div class="rank-row">
  <div class="rank-orb">🔬</div>
  <div class="rank-info">
    <div class="rank-name" id="rankName">Connect to view rank</div>
    <div class="rank-sub"  id="rankSub">Authenticate to begin</div>
    <div class="xp-track"><div class="xp-fill" id="xpFill"></div></div>
  </div>
</div>

<div class="metrics">
  <div class="metric"><div class="metric-val" id="metricExps">—</div><div class="metric-lbl">Experiments</div></div>
  <div class="metric"><div class="metric-val" id="metricPipes">—</div><div class="metric-lbl">Pipelines</div></div>
  <div class="metric"><div class="metric-val" id="metricResources">—</div><div class="metric-lbl">Resources</div></div>
  <div class="metric"><div class="metric-val" id="metricTrades">—</div><div class="metric-lbl">Trades</div></div>
</div>

<div class="card">
  <div class="ch"><h2>🏛️ Scientist Progression</h2><span style="font-size:0.68em;opacity:0.45">citizen → funded lab</span></div>
  <div class="prog-row">
    <div class="prog-orb">🔬</div>
    <div class="prog-info">
      <div class="prog-tier" id="progTier">Citizen Scientist</div>
      <div class="prog-sub" id="progDesc">Gather resources &amp; contribute to unlock Lab Intern status</div>
      <div class="prog-sub" id="progNext">→ Lab Intern</div>
      <div class="xp-track"><div class="xp-fill" id="progFill" style="width:0%"></div></div>
    </div>
  </div>
  <div style="font-size:0.72em;opacity:0.5;padding:4px 2px">
    Citizen Scientist → Lab Intern → Research Fellow → Lab Director → Funded Lab
  </div>
</div>

<div class="card">
  <div class="ch"><h2>📦 Resource Inventory</h2></div>
  <div id="inventory">
    <div class="resource-row"><span class="res-icon">🧫</span><span class="res-name">Bio-Samples</span><span class="res-qty">0</span></div>
    <div class="resource-row"><span class="res-icon">💾</span><span class="res-name">Data Fragments</span><span class="res-qty">0</span></div>
    <div class="resource-row"><span class="res-icon">🧪</span><span class="res-name">Reagent Packs</span><span class="res-qty">0</span></div>
    <div class="resource-row"><span class="res-icon">⚡</span><span class="res-name">Compute Cores</span><span class="res-qty">0</span></div>
    <div class="resource-row"><span class="res-icon">🧬</span><span class="res-name">Gene Sequences</span><span class="res-qty">0</span></div>
  </div>
</div>

<div class="card">
  <div class="ch"><h2>🎯 Active Challenges</h2><span style="font-size:0.68em;opacity:0.45">skill-adaptive</span></div>
  <div id="challenges"><p class="dim">Connect to load challenges…</p></div>
</div>

<div id="achievementsSection" class="card hidden">
  <div class="ch"><h2>🏆 Achievements</h2></div>
  <div id="achievements"><p class="dim">No achievements yet — start contributing!</p></div>
</div>

<div class="card">
  <div class="ch"><h2>Leaderboard</h2></div>
  <ul id="leaderboard">
    <li><span class="lb-n">—</span><span class="lb-name dim">Connect to see rankings</span></li>
  </ul>
</div>

<div class="card">
  <div class="ch"><h2>Lab Chat</h2></div>
  <div id="chat"><p class="dim">Join a lab to start chatting…</p></div>
  <div class="row" style="margin-top:5px">
    <input id="chatInput" placeholder="Message your lab…" />
    <button class="btn sm" onclick="sendToHost('sendChat',{text:document.getElementById('chatInput').value});document.getElementById('chatInput').value='';">↑</button>
  </div>
</div>

<div id="initiativeForm" class="card hidden">
  <div class="ch"><h2>New Initiative</h2></div>
  <input id="initName" placeholder="Initiative name" class="sp" />
  <textarea id="initDesc" rows="2" placeholder="Description…" class="sp"></textarea>
  <button class="btn p full" onclick="sendToHost('newInitiative',{name:document.getElementById('initName').value,desc:document.getElementById('initDesc').value})">Create Initiative</button>
</div>`;

    // ── Labs ───────────────────────────────────────────────────
    case 'labs':
      return /* html */ `
<div class="ph"><span class="ph-icon">🔬</span><span class="ph-title">Digital Wet Labs</span><span class="ph-dot"></span></div>
<p style="font-size:0.8em;opacity:0.6;margin-bottom:8px">Join a research team and collaborate on live experiments.</p>

<div class="card">
  <div class="ch"><h2>⚔️ Lab Factions</h2><span style="font-size:0.68em;opacity:0.45">pledge allegiance</span></div>
  <p style="font-size:0.77em;opacity:0.6;margin-bottom:7px">Factions compete for territory, resources, and scientific breakthroughs. Join one to unlock faction missions and shared labs.</p>
  <div id="factions">
    <div class="faction-item" data-fid="helix-collective">
      <span class="faction-icon">🧬</span>
      <div class="faction-body"><div class="faction-nm">Helix Collective</div><div class="faction-desc">CRISPR &amp; gene editing · 42 members · Genome Wastes territory</div></div>
      <button class="btn sm" data-faction-id="helix-collective">Pledge →</button>
    </div>
    <div class="faction-item" data-fid="synthesis-order">
      <span class="faction-icon">⚗️</span>
      <div class="faction-body"><div class="faction-nm">Synthesis Order</div><div class="faction-desc">Drug discovery &amp; chemistry · 38 members · Pharma Flats territory</div></div>
      <button class="btn sm" data-faction-id="synthesis-order">Pledge →</button>
    </div>
    <div class="faction-item" data-fid="genome-pioneers">
      <span class="faction-icon">🔭</span>
      <div class="faction-body"><div class="faction-nm">Genome Pioneers</div><div class="faction-desc">Sequencing &amp; genomics · 29 members · Data Expanse territory</div></div>
      <button class="btn sm" data-faction-id="genome-pioneers">Pledge →</button>
    </div>
    <div class="faction-item" data-fid="eco-vanguard">
      <span class="faction-icon">🌿</span>
      <div class="faction-body"><div class="faction-nm">Eco Vanguard</div><div class="faction-desc">Environmental &amp; ecology · 31 members · Green Frontier territory</div></div>
      <button class="btn sm" data-faction-id="eco-vanguard">Pledge →</button>
    </div>
  </div>
</div>

<div class="lbl">Available Labs</div>
<div id="lab-list">
  <div class="lab-item">
    <span class="lab-ico">✂️</span>
    <div class="lab-body"><div class="lab-nm">Cas9 Alternatives</div><div class="lab-mt">12 members · 3 pipelines · CRISPR</div></div>
    <button class="btn sm" onclick="sendToHost('joinLab',{labId:'cas9'})">Join →</button>
  </div>
  <div class="lab-item">
    <span class="lab-ico">🧩</span>
    <div class="lab-body"><div class="lab-nm">Protein Folding</div><div class="lab-mt">8 members · 5 pipelines · Structure</div></div>
    <button class="btn sm" onclick="sendToHost('joinLab',{labId:'folding'})">Join →</button>
  </div>
  <div class="lab-item">
    <span class="lab-ico">💊</span>
    <div class="lab-body"><div class="lab-nm">Drug Discovery</div><div class="lab-mt">15 members · 7 pipelines · Pharma</div></div>
    <button class="btn sm" onclick="sendToHost('joinLab',{labId:'drug'})">Join →</button>
  </div>
  <div class="lab-item">
    <span class="lab-ico">🧬</span>
    <div class="lab-body"><div class="lab-nm">Gene Expression</div><div class="lab-mt">6 members · 2 pipelines · Genomics</div></div>
    <button class="btn sm" onclick="sendToHost('joinLab',{labId:'expression'})">Join →</button>
  </div>
  <div class="lab-item">
    <span class="lab-ico">🌱</span>
    <div class="lab-body"><div class="lab-nm">Environmental Impact</div><div class="lab-mt">9 members · 4 pipelines · Ecology</div></div>
    <button class="btn sm" onclick="sendToHost('joinLab',{labId:'enviro'})">Join →</button>
  </div>
</div>`;

    // ── Marketplace ────────────────────────────────────────────
    case 'marketplace':
      return /* html */ `
<div class="ph"><span class="ph-icon">🎛️</span><span class="ph-title">Scientific Tool Catalog</span></div>
<input id="searchInput" placeholder="🔍 Search pipelines, datasets, models…" class="sp" />
<div class="presets" style="margin-bottom:7px">
  <button class="pb on">All</button>
  <button class="pb">Pipeline</button>
  <button class="pb">Dataset</button>
  <button class="pb">Model</button>
  <button class="pb">Reagent</button>
</div>
<div id="listings">
  <div class="card" style="text-align:center;padding:14px"><p class="dim">Connect to browse the marketplace</p></div>
</div>
<div class="hr"></div>
<div class="lbl">Publish Your Tool</div>
<button class="btn p full" onclick="sendToHost('publishTool',{name:'My Pipeline',price:50})">+ Publish New Tool</button>

<div class="hr"></div>
<div class="card">
  <div class="ch"><h2>🤝 Barter &amp; Trade</h2><span style="font-size:0.68em;opacity:0.45">resource exchange</span></div>
  <p style="font-size:0.77em;opacity:0.6;margin-bottom:7px">Trade gathered resources with other scientists. Offer what you have, request what you need.</p>
  <div class="row sp">
    <select id="tradeOffer" style="flex:1"><option>Bio-Samples</option><option>Data Fragments</option><option>Reagent Packs</option><option>Compute Cores</option><option>Gene Sequences</option></select>
    <input id="tradeOfferQty" placeholder="Qty" style="width:50px;flex:0 0 50px" value="1" />
  </div>
  <div style="font-size:0.72em;opacity:0.45;text-align:center;margin-bottom:4px">↕ exchange for ↕</div>
  <div class="row sp">
    <select id="tradeWant" style="flex:1"><option>Bio-Samples</option><option>Data Fragments</option><option>Reagent Packs</option><option>Compute Cores</option><option>Gene Sequences</option></select>
    <input id="tradeWantQty" placeholder="Qty" style="width:50px;flex:0 0 50px" value="1" />
  </div>
  <button class="btn p full" id="postTradeBtn">Post Trade Offer</button>
</div>

<div class="card">
  <div class="ch"><h2>📋 Active Trades</h2></div>
  <div id="tradeBoard"><p class="dim">No active trade offers — post one above!</p></div>
</div>`;

    // ── Agents ─────────────────────────────────────────────────
    case 'agents':
      return /* html */ `
<div class="ph"><span class="ph-icon">🤖</span><span class="ph-title">Agent Scientists</span></div>
<p style="font-size:0.8em;opacity:0.6;margin-bottom:8px">Register OpenClaw agents as autonomous lab members. Each agent handles delegated experimental tasks and reports results back to BioWorld.</p>
<button class="btn p full sp" onclick="sendToHost('registerAgent',{name:'Cas9Bot',openclawConfig:'{}'})">+ Fit New Agent ($5)</button>
<div class="lbl">My Agents</div>
<div id="myAgents">
  <div class="card" style="text-align:center;padding:12px"><p class="dim">No agents registered yet</p></div>
</div>
<div id="labAgents"></div>`;

    // ── Experiments ────────────────────────────────────────────
    case 'experiments':
      return /* html */ `
<div class="ph"><span class="ph-icon">🧪</span><span class="ph-title">Experiment Workbench</span><span class="ph-dot"></span></div>

<div class="lbl">Active Experiments</div>
<div id="activeExps">
  <p class="dim" style="padding:4px">No active experiments — launch one below.</p>
</div>

<div class="card">
  <div class="ch"><h2>🔧 Pipeline Builder</h2></div>
  <div class="lbl" style="margin-bottom:4px">Presets</div>
  <div class="presets">
    <button class="pb" data-preset="crispr">✂️ CRISPR</button>
    <button class="pb" data-preset="folding">🧩 Folding</button>
    <button class="pb" data-preset="drug">💊 Drug</button>
    <button class="pb" data-preset="expression">🧬 Expression</button>
    <button class="pb" data-preset="custom">⚙️ Custom</button>
  </div>
  <div class="lbl" style="margin-bottom:4px">Pipeline Stages</div>
  <div class="stages" id="pipelineStages">
    <span class="stages-empty">Select a preset or add custom stages</span>
  </div>
  <div class="row sp">
    <input id="stageInput" placeholder="Add stage name…" />
    <button class="btn sm" id="addStageBtn">+</button>
  </div>
  <div class="row">
    <input id="pipelineName" placeholder="Pipeline name (optional)" />
    <button class="btn sm p" id="launchPipelineBtn">▶ Run</button>
  </div>
</div>

<div class="card">
  <div class="ch"><h2>⚡ Quick Launch</h2></div>
  <select id="expType" class="sp">
    <option>Mutation Analysis</option>
    <option>Protein Folding Simulation</option>
    <option>Drug Binding Prediction</option>
    <option>Environmental Impact Model</option>
    <option>Gene Expression Analysis</option>
  </select>
  <textarea id="expParams" rows="2" placeholder='Parameters JSON e.g. {"gene":"BRCA1"}' class="sp"></textarea>
  <div id="expError" class="hidden" style="color:var(--bio-red);font-size:0.78em;margin-bottom:4px"></div>
  <button class="btn p full" id="runExpBtn">▶ Run Experiment</button>
</div>

<div class="card">
  <div class="ch"><h2>🎯 Skill-Adaptive Challenges</h2></div>
  <div id="challenges"><p class="dim">Connect to load challenges…</p></div>
</div>

<div class="card">
  <div class="ch"><h2>Experiment Log</h2></div>
  <div id="experimentLog"><p style="opacity:0.4;font-style:italic">No experiments run yet.</p></div>
</div>`;

    // ── World & Outposts ──────────────────────────────────────
    case 'world':
      return /* html */ `
<div class="ph"><span class="ph-icon">🌍</span><span class="ph-title">World &amp; Outposts</span><span class="ph-dot"></span></div>
<p style="font-size:0.8em;opacity:0.6;margin-bottom:8px">Explore the BioWorld wasteland. Gather resources, discover outposts, and stake territory for your faction.</p>

<div class="card">
  <div class="ch"><h2>🗺️ Exploration Regions</h2><span style="font-size:0.68em;opacity:0.45">gather resources</span></div>
  <p style="font-size:0.77em;opacity:0.6;margin-bottom:7px">Each region yields different resources. Scout a region to gather what you need for experiments and trades.</p>

  <div class="region-card">
    <div class="region-hdr"><span>🧬</span><span class="region-nm">Genome Wastes</span><span class="bdg bdg-beginner">Low Risk</span></div>
    <div class="region-res">
      <span
        class="bdg bdg-intermediate"
        data-region-id="genome-wastes"
        data-resource-type="Gene Sequences"
      >🧬 Gene Sequences</span>
      <span
        class="bdg bdg-beginner"
        data-region-id="genome-wastes"
        data-resource-type="Bio-Samples"
      >🧫 Bio-Samples</span>
    </div>
  </div>

  <div class="region-card">
    <div class="region-hdr"><span>💊</span><span class="region-nm">Pharma Flats</span><span class="bdg bdg-intermediate">Med Risk</span></div>
    <div class="region-res">
      <span
        class="bdg bdg-intermediate"
        data-region-id="pharma-flats"
        data-resource-type="Reagent Packs"
      >🧪 Reagent Packs</span>
      <span
        class="bdg bdg-beginner"
        data-region-id="pharma-flats"
        data-resource-type="Data Fragments"
      >💾 Data Fragments</span>
    </div>
  </div>

  <div class="region-card">
    <div class="region-hdr"><span>⚡</span><span class="region-nm">Data Expanse</span><span class="bdg bdg-advanced">High Risk</span></div>
    <div class="region-res">
      <span
        class="bdg bdg-advanced"
        data-region-id="data-expanse"
        data-resource-type="Compute Cores"
      >⚡ Compute Cores</span>
      <span
        class="bdg bdg-intermediate"
        data-region-id="data-expanse"
        data-resource-type="Data Fragments"
      >💾 Data Fragments</span>
    </div>
  </div>

  <div class="region-card">
    <div class="region-hdr"><span>🌿</span><span class="region-nm">Green Frontier</span><span class="bdg bdg-beginner">Low Risk</span></div>
    <div class="region-res">
      <span
        class="bdg bdg-beginner"
        data-region-id="green-frontier"
        data-resource-type="Bio-Samples"
      >🧫 Bio-Samples</span>
      <span
        class="bdg bdg-intermediate"
        data-region-id="green-frontier"
        data-resource-type="Reagent Packs"
      >🧪 Reagent Packs</span>
    </div>
  </div>
</div>

<div class="card">
  <div class="ch"><h2>🏕️ Outposts</h2><span style="font-size:0.68em;opacity:0.45">Discord &amp; web hubs</span></div>
  <p style="font-size:0.77em;opacity:0.6;margin-bottom:7px">Outposts are community hubs — Discord servers, websites, and forums where scientists trade, collaborate, and share discoveries.</p>
  <div id="outposts">
    <div class="outpost-item">
      <span class="outpost-icon">💬</span>
      <div class="outpost-body"><div class="outpost-nm">BioWorld Discord HQ</div><div class="outpost-desc">Main community hub · 1,200 members · Trade channel active</div></div>
      <button class="btn sm" data-outpost-id="discord-hq">Scout →</button>
    </div>
    <div class="outpost-item">
      <span class="outpost-icon">🌐</span>
      <div class="outpost-body"><div class="outpost-nm">Open Science Forum</div><div class="outpost-desc">Web outpost · Peer review &amp; bounties · Data Fragments cache</div></div>
      <button class="btn sm" data-outpost-id="open-science">Scout →</button>
    </div>
    <div class="outpost-item">
      <span class="outpost-icon">🔬</span>
      <div class="outpost-body"><div class="outpost-nm">Citizen Lab Network</div><div class="outpost-desc">Community labs · Progression milestones · Funding proposals</div></div>
      <button class="btn sm" data-outpost-id="citizen-lab">Scout →</button>
    </div>
    <div class="outpost-item">
      <span class="outpost-icon">📡</span>
      <div class="outpost-body"><div class="outpost-nm">Frontier Relay Station</div><div class="outpost-desc">Remote outpost · Rare Compute Core trades · Eco Vanguard territory</div></div>
      <button class="btn sm" data-outpost-id="frontier-relay">Scout →</button>
    </div>
  </div>
</div>

<div class="card">
  <div class="ch"><h2>📦 Field Inventory</h2></div>
  <div id="inventory">
    <p class="dim" style="padding:4px">Gather resources from regions above to fill your inventory.</p>
  </div>
</div>

<div class="card">
  <div class="ch"><h2>Exploration Log</h2></div>
  <div id="experimentLog"><p style="opacity:0.4;font-style:italic">No expeditions yet — scout a region to begin.</p></div>
</div>`;

    default:
      return '<div class="ph"><span class="ph-icon">🧬</span><span class="ph-title">BioWorld</span></div><p style="font-size:0.85em;opacity:0.7">Welcome to the biotech IDE research platform.</p>';
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
