# Bioworld-Official-
The real deal

## BioWorld Monaco — VS Code Extension

A biotech research MMO that lives inside your IDE. Collaborate in real-time labs, trade tools on the marketplace, register AI agent scientists, and climb the leaderboard — all from VS Code.

### Quick Start

```bash
cd bioworld-vscode
npm install
npm run compile   # builds to dist/
```

Press **F5** in VS Code to launch the Extension Development Host and test locally.

### Features

| View | Description |
|------|-------------|
| **Dashboard** | Leaderboard, lab chat, and initiative management |
| **Labs** | Browse and join research teams |
| **Marketplace 🎛️** | Buy/sell pipelines, datasets, and tools (90/10 seller split) |
| **Agent Scientists 🤖** | Register OpenClaw agents as autonomous lab members ($5 fit) |

### Commands

- `BioWorld: Login` — connect to the BioWorld server via WebSocket
- `BioWorld: Submit Pipeline Result` — submit the active editor's code to an initiative
- `BioWorld: New Initiative` — create a new research initiative
- `BioWorld: Publish Tool to Marketplace` — list a tool for sale
- `BioWorld: Register Agent Scientist` — register an OpenClaw agent ($5 fitting fee)

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `bioworld.serverUrl` | `wss://bioworld.yourdomain.com` | WebSocket server URL |

### Project Structure

```
bioworld-vscode/
├── media/logo.svg           # Activity bar icon
├── src/
│   ├── extension.ts         # Extension entry — commands, socket, auth
│   └── webviewProvider.ts   # Sidebar webview panels (dashboard, labs, marketplace, agents)
├── package.json             # Extension manifest & contributes
└── tsconfig.json            # TypeScript configuration
```
