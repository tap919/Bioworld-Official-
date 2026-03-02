import * as vscode from 'vscode';
import { io, Socket } from 'socket.io-client';
import { BioWorldWebviewProvider } from './webviewProvider';

let socket: Socket | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('bioworld');
  const socketUrl = config.get<string>('serverUrl') || 'wss://bioworld.example.com';

  const providers = new Map<string, BioWorldWebviewProvider>();

  // Register webview providers for each sidebar view
  const viewIds = ['dashboard', 'labs', 'marketplace', 'agents'] as const;
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
      socket = io(socketUrl, { auth: { token } });
      socket.on('connect', () => {
        vscode.window.showInformationMessage('BioWorld: Connected!');
      });
      socket.on('disconnect', () => {
        vscode.window.showInformationMessage('BioWorld: Disconnected.');
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
        } catch (err) {
          vscode.window.showErrorMessage(`Agent task failed: ${err}`);
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
}

async function getToken(): Promise<string | undefined> {
  const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: true });
  return session?.accessToken;
}

export function deactivate(): void {
  socket?.disconnect();
  socket = null;
}
