import * as vscode from 'vscode';
import type { Socket } from 'socket.io-client';

/**
 * Provides webview content for each BioWorld sidebar panel:
 * dashboard, labs, marketplace, and agents.
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

  // ── HTML builders ────────────────────────────────────────────

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
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
    h1 { font-size: 1.4em; margin-bottom: 8px; }
    h2 { font-size: 1.1em; margin-bottom: 6px; }
    .card { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    .btn { display: inline-block; padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    input, textarea { width: 100%; padding: 6px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; }
    ul { list-style: none; padding: 0; }
    li { padding: 4px 0; }
    #chat { max-height: 200px; overflow-y: auto; border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; margin-top: 8px; }
    #experimentLog { max-height: 160px; overflow-y: auto; border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 6px; margin-top: 8px; font-size: 0.85em; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 6px; font-weight: bold; }
    .badge-beginner { color: var(--vscode-editorInfo-foreground); border: 1px solid var(--vscode-editorInfo-foreground); background: transparent; }
    .badge-intermediate { color: var(--vscode-editorHint-foreground); border: 1px solid var(--vscode-editorHint-foreground); background: transparent; }
    .badge-advanced { color: var(--vscode-editorWarning-foreground); border: 1px solid var(--vscode-editorWarning-foreground); background: transparent; }
    .badge-expert { color: var(--vscode-editorError-foreground); border: 1px solid var(--vscode-editorError-foreground); background: transparent; }
    .hidden { display: none; }
  </style>
</head>
<body>
  ${body}
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const socketUrl = '${this.socketUrl}';

    // Placeholder helpers — real socket connection lives in the extension host.
    // Webview communicates via postMessage ↔ extension host.
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg && typeof msg === 'object') {
        handleHostMessage(msg);
      }
    });

    function sendToHost(cmd, data) {
      vscodeApi.postMessage({ cmd, ...data });
    }

    // ── Panel-specific setup (runs after DOM ready)
    (function initPanel() {
      const runBtn = document.getElementById('runExpBtn');
      if (runBtn) {
        runBtn.addEventListener('click', () => {
          const type = document.getElementById('expType')?.value || '';
          const raw = document.getElementById('expParams')?.value || '{}';
          const errEl = document.getElementById('expError');
          let params;
          try {
            params = JSON.parse(raw);
          } catch {
            if (errEl) { errEl.textContent = 'Invalid JSON — please check the format.'; errEl.style.display = 'block'; }
            return;
          }
          if (errEl) { errEl.style.display = 'none'; }
          // Immediately reflect that the experiment has been started in the UI.
          appendExperimentLog(type || 'Experiment', '⏳ Started:', '');
          sendToHost('runExperiment', { type, params });
        });
      }

      // Single delegated click handler for challenge Accept buttons — avoids
      // re-binding individual listeners on every renderChallenges() call.
      document.getElementById('challenges')?.addEventListener('click', event => {
        const btn = (event.target)?.closest?.('button[data-challenge-id]');
        if (btn) {
          sendToHost('acceptChallenge', { challengeId: btn.dataset.challengeId });
        }
      });
    })();

    function handleHostMessage(msg) {
      switch (msg.cmd) {
        case 'chatMessage':
          appendChat(msg.text);
          break;
        case 'leaderboardUpdate':
          updateLeaderboard(msg.ranks);
          break;
        case 'marketUpdate':
          renderListings(msg.listings);
          break;
        case 'agentUpdate':
          renderAgents(msg.agents);
          break;
        case 'newInitiative':
          document.getElementById('initiativeForm')?.classList.toggle('hidden');
          break;
        case 'challengeUpdate':
          renderChallenges(msg.challenges);
          break;
        case 'achievementUnlocked':
          appendAchievement(msg.name, msg.xp);
          break;
        case 'showAchievements':
          document.getElementById('achievementsSection')?.classList.remove('hidden');
          break;
        case 'skillRankUpdate':
          updateSkillRank(msg.rank, msg.xp, msg.nextRank);
          break;
        case 'experimentStarted':
          appendExperimentLog(msg.type, '⏳ Started:', '');
          break;
        case 'experimentResult':
          appendExperimentLog(msg.type, '✅ Result:', JSON.stringify(msg.result));
          break;
      }
    }

    // ── Sanitization helper
    function esc(str) {
      const d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }

    // ── Dashboard helpers
    function appendChat(text) {
      const el = document.getElementById('chat');
      if (!el) return;
      const p = document.createElement('p');
      p.textContent = text;
      el.appendChild(p);
      el.scrollTop = el.scrollHeight;
    }
    function updateLeaderboard(ranks) {
      const el = document.getElementById('leaderboard');
      if (!el || !Array.isArray(ranks)) return;
      el.innerHTML = ranks.map((r, i) => '<li>' + (i+1) + '. ' + esc(r.name) + ' — ' + esc(r.xp) + ' XP</li>').join('');
    }

    // ── Marketplace helpers
    function renderListings(listings) {
      const el = document.getElementById('listings');
      if (!el || !Array.isArray(listings)) return;
      el.innerHTML = listings.map(l =>
        '<div class="card"><strong>' + esc(l.name) + '</strong><br>' + esc(l.description) + '<br>' + esc(l.price) + ' credits<br><button class="btn" data-id="' + esc(l.id) + '">Buy</button></div>'
      ).join('');
      el.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', () => sendToHost('buyTool', { listingId: btn.dataset.id }));
      });
    }

    // ── Agent helpers
    function renderAgents(agents) {
      const el = document.getElementById('myAgents');
      if (!el || !Array.isArray(agents)) return;
      el.innerHTML = agents.map(a =>
        '<div class="card"><strong>' + esc(a.name) + '</strong><br>Status: ' + (a.fitted ? 'Active ✅' : 'Fitting…') + '</div>'
      ).join('');
    }

    // ── Challenge helpers (skill-adaptive)
    function renderChallenges(challenges) {
      const el = document.getElementById('challenges');
      if (!el || !Array.isArray(challenges)) return;
      el.innerHTML = challenges.map(c =>
        '<div class="card"><strong>' + esc(c.title) + '</strong>' +
        '<span class="badge badge-' + esc(c.difficulty) + '">' + esc(c.difficulty) + '</span>' +
        '<br>' + esc(c.description) + '<br>' +
        '<em>' + esc(c.reward) + ' XP reward</em>' +
        '<br><button class="btn" data-challenge-id="' + esc(c.id) + '">Accept</button></div>'
      ).join('');
    }

    // ── Achievement helpers
    function appendAchievement(name, xp) {
      const el = document.getElementById('achievements');
      if (!el) return;
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = '🏆 <strong>' + esc(name) + '</strong>' + (xp ? ' +' + esc(xp) + ' XP' : '');
      el.prepend(div);
    }

    // ── Skill rank helper
    function updateSkillRank(rank, xp, nextRank) {
      const el = document.getElementById('skillRank');
      if (!el) return;
      el.innerHTML = '<strong>' + esc(rank) + '</strong> · ' + esc(xp) + ' XP' +
        (nextRank ? ' <span style="opacity:0.6">→ ' + esc(nextRank) + '</span>' : '');
    }

    // ── Experiment helpers
    function appendExperimentLog(type, status, detail) {
      const el = document.getElementById('experimentLog');
      if (!el) return;
      const p = document.createElement('p');
      p.textContent = status + ' ' + type + (detail ? ': ' + detail : '');
      el.appendChild(p);
      el.scrollTop = el.scrollHeight;
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
    }
  }
}

// ── View content (static HTML per panel) ───────────────────────

function getViewContent(viewId: string): string {
  switch (viewId) {
    case 'dashboard':
      return /* html */ `
        <h1>🧬 BioWorld Dashboard</h1>
        <div class="card">
          <h2>Your Rank</h2>
          <div id="skillRank"><em>Connect to see your rank…</em></div>
        </div>
        <div class="card">
          <h2>Leaderboard</h2>
          <ul id="leaderboard"><li>Connect to see rankings</li></ul>
        </div>
        <div class="card">
          <h2>🎯 Active Challenges <small style="font-size:0.75em;opacity:0.7">(adapts to your skill)</small></h2>
          <div id="challenges"><em>Connect to load skill-matched challenges…</em></div>
        </div>
        <div id="achievementsSection" class="card hidden">
          <h2>🏆 Achievements</h2>
          <div id="achievements"><em>No achievements yet — start contributing!</em></div>
        </div>
        <div class="card">
          <h2>Lab Chat</h2>
          <div id="chat"><p><em>Join a lab to start chatting…</em></p></div>
          <input id="chatInput" placeholder="Type a message…" />
          <button class="btn" style="margin-top:4px"
            onclick="sendToHost('sendChat',{text:document.getElementById('chatInput').value});document.getElementById('chatInput').value='';">
            Send
          </button>
        </div>
        <div id="initiativeForm" class="card hidden">
          <h2>New Initiative</h2>
          <input id="initName" placeholder="Initiative name" />
          <textarea id="initDesc" rows="3" placeholder="Description…"></textarea>
          <button class="btn" style="margin-top:4px"
            onclick="sendToHost('newInitiative',{name:document.getElementById('initName').value,desc:document.getElementById('initDesc').value})">
            Create
          </button>
        </div>`;

    case 'labs':
      return /* html */ `
        <h1>🔬 Your Labs</h1>
        <p>Browse open labs and join a research team.</p>
        <ul id="lab-list">
          <li class="card">
            <strong>Cas9 Alternatives</strong><br>
            <em>12 members · 3 pipelines</em><br>
            <button class="btn" onclick="sendToHost('joinLab',{labId:'cas9'})">Join</button>
          </li>
          <li class="card">
            <strong>Protein Folding</strong><br>
            <em>8 members · 5 pipelines</em><br>
            <button class="btn" onclick="sendToHost('joinLab',{labId:'folding'})">Join</button>
          </li>
        </ul>`;

    case 'marketplace':
      return /* html */ `
        <h1>🎛️ Marketplace</h1>
        <input id="searchInput" placeholder="Search pipelines, datasets…" />
        <div id="listings" class="grid" style="margin-top:8px">
          <div class="card">Connect &amp; browse tools</div>
        </div>
        <button class="btn" style="margin-top:8px"
          onclick="sendToHost('publishTool',{name:'My Pipeline',price:50})">
          Publish New Tool
        </button>`;

    case 'agents':
      return /* html */ `
        <h1>🤖 Agent Scientists</h1>
        <p>Register an OpenClaw agent as an autonomous lab member.</p>
        <button class="btn"
          onclick="sendToHost('registerAgent',{name:'Cas9Bot',openclawConfig:'{}'})">
          $5 Fit New Agent
        </button>
        <div id="myAgents" class="grid" style="margin-top:8px">
          <div class="card">No agents registered yet</div>
        </div>
        <div id="labAgents" style="margin-top:8px"></div>`;

    case 'experiments':
      return /* html */ `
        <h1>🧪 Experiments &amp; Simulations</h1>
        <p style="font-size:0.9em;opacity:0.8">Run skill-adaptive biotech experiments. Harder challenges unlock as you progress.</p>
        <div class="card">
          <h2>Quick Launch</h2>
          <select id="expType" style="width:100%;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;margin-bottom:6px">
            <option>Mutation Analysis</option>
            <option>Protein Folding Simulation</option>
            <option>Drug Binding Prediction</option>
            <option>Environmental Impact Model</option>
            <option>Gene Expression Analysis</option>
          </select>
          <textarea id="expParams" rows="2" placeholder='Parameters JSON, e.g. {"gene":"BRCA1"}'></textarea>
          <div id="expError" style="display:none;color:var(--vscode-errorForeground);font-size:0.85em;margin-top:4px"></div>
          <button class="btn" id="runExpBtn" style="margin-top:6px">▶ Run Experiment</button>
        </div>
        <div class="card">
          <h2>🎯 Skill-Adaptive Challenges</h2>
          <div id="challenges"><em>Connect to load your challenges…</em></div>
        </div>
        <div class="card">
          <h2>Experiment Log</h2>
          <div id="experimentLog"><p><em>No experiments run yet.</em></p></div>
        </div>`;

    default:
      return '<h1>🧬 BioWorld</h1><p>Welcome to the biotech IDE MMO.</p>';
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
