import * as vscode from 'vscode';
import { io, Socket } from 'socket.io-client';
import { BioWorldWebviewProvider } from './webviewProvider';

let socket: Socket | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('bioworld');
  const socketUrl = config.get<string>('serverUrl') || 'wss://bioworld.yourdomain.com';

  const providers = new Map<string, BioWorldWebviewProvider>();

  // Register webview providers for each sidebar view
  const viewIds = ['dashboard', 'labs', 'marketplace', 'agents', 'experiments', 'world', 'learning'] as const;
  for (const viewId of viewIds) {
    const provider = new BioWorldWebviewProvider(context.extensionUri, viewId, socketUrl);
    providers.set(viewId, provider);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(`bioworld.${viewId}`, provider)
    );
  }

  // Login command — establishes WebSocket connection
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.login', async () => {
      const token = await getToken();
      if (!token) {
        return;
      }
      // Disconnect any existing socket to avoid duplicate handlers on re-login.
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }

      socket = io(socketUrl, { auth: { token } });
      socket.on('connect', () => {
        vscode.window.showInformationMessage('BioWorld: Connected!');
      });
      socket.on('disconnect', () => {
        vscode.window.showInformationMessage('BioWorld: Disconnected.');
      });
      socket.on('connect_error', (err: Error) => {
        vscode.window.showErrorMessage(`BioWorld: Connection failed — ${err.message}`);
      });

      // Relay server-driven gamification events to the relevant webview
      socket.on('challengeUpdate', (data: unknown) => {
        providers.get('dashboard')?.postMessage({ cmd: 'challengeUpdate', ...toRecord(data) });
        providers.get('experiments')?.postMessage({ cmd: 'challengeUpdate', ...toRecord(data) });
      });
      socket.on('achievementUnlocked', (data: unknown) => {
        providers.get('dashboard')?.postMessage({ cmd: 'achievementUnlocked', ...toRecord(data) });
        if (isRecord(data) && typeof data.name === 'string') {
          vscode.window.showInformationMessage(`🏆 Achievement unlocked: ${data.name}`);
        }
      });
      socket.on('skillRankUpdate', (data: unknown) => {
        providers.get('dashboard')?.postMessage({ cmd: 'skillRankUpdate', ...toRecord(data) });
      });
      socket.on('experimentResult', (data: unknown) => {
        providers.get('experiments')?.postMessage({ cmd: 'experimentResult', ...toRecord(data) });
      });

      // Relay world / exploration events
      socket.on('resourceGathered', (data: unknown) => {
        providers.get('world')?.postMessage({ cmd: 'resourceGathered', ...toRecord(data) });
        providers.get('dashboard')?.postMessage({ cmd: 'resourceGathered', ...toRecord(data) });
      });
      socket.on('outpostDiscovered', (data: unknown) => {
        providers.get('world')?.postMessage({ cmd: 'outpostDiscovered', ...toRecord(data) });
      });
      socket.on('outpostUpdate', (data: unknown) => {
        providers.get('world')?.postMessage({ cmd: 'outpostUpdate', ...toRecord(data) });
      });
      socket.on('factionUpdate', (data: unknown) => {
        providers.get('labs')?.postMessage({ cmd: 'factionUpdate', ...toRecord(data) });
        providers.get('world')?.postMessage({ cmd: 'factionUpdate', ...toRecord(data) });
      });
      socket.on('tradeOffer', (data: unknown) => {
        providers.get('marketplace')?.postMessage({ cmd: 'tradeOffer', ...toRecord(data) });
      });
      socket.on('tradeComplete', (data: unknown) => {
        providers.get('marketplace')?.postMessage({ cmd: 'tradeComplete', ...toRecord(data) });
      });
      socket.on('inventoryUpdate', (data: unknown) => {
        providers.get('dashboard')?.postMessage({ cmd: 'inventoryUpdate', ...toRecord(data) });
        providers.get('world')?.postMessage({ cmd: 'inventoryUpdate', ...toRecord(data) });
      });
      socket.on('progressionUpdate', (data: unknown) => {
        providers.get('dashboard')?.postMessage({ cmd: 'progressionUpdate', ...toRecord(data) });
      });

      // Relay learning / knowledge events
      socket.on('learningUpdate', (data: unknown) => {
        providers.get('learning')?.postMessage({ cmd: 'learningUpdate', ...toRecord(data) });
      });
      socket.on('knowledgeGained', (data: unknown) => {
        providers.get('learning')?.postMessage({ cmd: 'knowledgeGained', ...toRecord(data) });
        providers.get('dashboard')?.postMessage({ cmd: 'knowledgeGained', ...toRecord(data) });
      });

      // Relay agent tasks to OpenClaw gateway
      socket.on('agentTask', async (task: { agentId: string; openclawUrl: string; payload: unknown }) => {
        try {
          const res = await fetch(`${task.openclawUrl}/api/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'BioWorld' },
            body: JSON.stringify({ prompt: `As biotech agent: ${JSON.stringify(task.payload)}`, tools: ['ide_api'] }),
          });
          const result = await res.json();
          socket?.emit('agentResult', { agentId: task.agentId, result });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          vscode.window.showErrorMessage(`Agent task failed: ${message}`);
        }
      });

      // Push socket to all webview providers
      for (const provider of providers.values()) {
        provider.setSocket(socket);
      }
    })
  );

  // Submit pipeline result from the active editor
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.submitPipeline', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a file before submitting a pipeline.');
        return;
      }
      const initiative = await vscode.window.showInputBox({ prompt: 'Initiative name (e.g. cas9)' });
      if (!initiative) {
        return;
      }
      socket?.emit('submitResult', { code: editor.document.getText(), initiative });
      vscode.window.showInformationMessage(`Pipeline submitted to "${initiative}".`);
    })
  );

  // New initiative — delegate to dashboard webview
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.newInitiative', () => {
      providers.get('dashboard')?.postMessage({ cmd: 'newInitiative' });
    })
  );

  // Publish a tool to the marketplace
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.publishTool', async () => {
      const repo = await vscode.window.showInputBox({ prompt: 'GitHub Repo URL' });
      if (!repo) {
        return;
      }
      const priceStr = await vscode.window.showInputBox({ prompt: 'Credits Price', value: '50' });
      const price = parseInt(priceStr || '50', 10);
      socket?.emit('publishTool', { repo, price, type: 'pipeline' });
      vscode.window.showInformationMessage('Tool published to Marketplace.');
    })
  );

  // Register an Agent Scientist ($5 fitting)
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.registerAgent', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Agent Name' });
      if (!name) {
        return;
      }
      const openclawUrl = await vscode.window.showInputBox({ prompt: 'OpenClaw Gateway URL' });
      if (!openclawUrl) {
        return;
      }
      socket?.emit('registerAgent', { name, openclawUrl, fitFee: 5 });
      vscode.window.showInformationMessage(`Agent "${name}" registration submitted ($5 fit).`);
    })
  );

  // Run a biotech experiment / simulation
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.runExperiment', async () => {
      const experimentTypes = [
        'Mutation Analysis',
        'Protein Folding Simulation',
        'Drug Binding Prediction',
        'Environmental Impact Model',
        'Gene Expression Analysis',
      ];
      const type = await vscode.window.showQuickPick(experimentTypes, {
        placeHolder: 'Select experiment type',
      });
      if (!type) {
        return;
      }
      const params = await vscode.window.showInputBox({
        prompt: `Parameters for "${type}" (optional JSON)`,
        value: '{}',
      });
      const rawParams = params || '{}';
      let parsedParams: unknown;
      try {
        parsedParams = JSON.parse(rawParams);
      } catch {
        vscode.window.showWarningMessage('Invalid JSON parameters — using empty object.');
        parsedParams = {};
      }
      socket?.emit('runExperiment', { type, params: parsedParams });
      providers.get('experiments')?.postMessage({ cmd: 'experimentStarted', type });
      vscode.window.showInformationMessage(`Experiment started: ${type}`);
    })
  );

  // View the current user's achievements
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.viewAchievements', () => {
      socket?.emit('getAchievements');
      providers.get('dashboard')?.postMessage({ cmd: 'showAchievements' });
    })
  );

  // Explore the world map
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.exploreWorld', () => {
      socket?.emit('exploreWorld');
      providers.get('world')?.postMessage({ cmd: 'explore' });
    })
  );

  // Barter & trade resources
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.tradeResources', async () => {
      const resource = await vscode.window.showQuickPick(
        ['Bio-Samples', 'Data Fragments', 'Reagent Packs', 'Compute Cores', 'Gene Sequences'],
        { placeHolder: 'Select resource to trade' },
      );
      if (!resource) {
        return;
      }
      const qtyStr = await vscode.window.showInputBox({ prompt: 'Quantity to offer', value: '1' });
      const qty = parseInt(qtyStr || '1', 10);
      if (isNaN(qty) || qty < 1) {
        vscode.window.showWarningMessage('Quantity must be a positive number.');
        return;
      }
      const wantResource = await vscode.window.showQuickPick(
        ['Bio-Samples', 'Data Fragments', 'Reagent Packs', 'Compute Cores', 'Gene Sequences'],
        { placeHolder: 'Select resource you want in return' },
      );
      if (!wantResource) {
        return;
      }
      const wantQtyStr = await vscode.window.showInputBox({ prompt: 'Quantity you want in return', value: '1' });
      const wantQty = parseInt(wantQtyStr || '1', 10);
      if (isNaN(wantQty) || wantQty < 1) {
        vscode.window.showWarningMessage('Requested quantity must be a positive number.');
        return;
      }
      socket?.emit('tradeOffer', { resource, qty, wantResource, wantQty });
      vscode.window.showInformationMessage(
        `Trade offer posted: ${qty}× ${resource} for ${wantQty}× ${wantResource}`,
      );
    })
  );

  // Join a lab faction
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.joinFaction', async () => {
      const factionMap: Record<string, string> = {
        'Helix Collective — CRISPR & gene editing': 'helix-collective',
        'Synthesis Order — drug discovery & chemistry': 'synthesis-order',
        'Genome Pioneers — sequencing & genomics': 'genome-pioneers',
        'Eco Vanguard — environmental & ecology': 'eco-vanguard',
      };
      const choice = await vscode.window.showQuickPick(Object.keys(factionMap), { placeHolder: 'Choose your lab faction' });
      if (!choice) {
        return;
      }
      const factionId = factionMap[choice];
      const factionName = choice.split('—')[0].trim();
      socket?.emit('joinFaction', { factionId });
      providers.get('labs')?.postMessage({ cmd: 'factionJoined', factionId });
      vscode.window.showInformationMessage(`Joined faction: ${factionName}`);
    })
  );

  // Open the Learning Center
  context.subscriptions.push(
    vscode.commands.registerCommand('bioworld.openLearning', async () => {
      await vscode.commands.executeCommand('bioworld.learning.focus');
      socket?.emit('openLearning');
    })
  );
}

async function getToken(): Promise<string | undefined> {
  const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: true });
  return session?.accessToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function deactivate(): void {
  socket?.disconnect();
  socket = null;
}
