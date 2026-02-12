# Node-Only Daemon (No Electron)

Goal: run CoWork OS on Linux servers (VPS/headless) **without Electron/Xvfb**, as a pure Node.js daemon.

This is an alternative to the Linux “headless Electron” mode. It’s designed for:

- VPS/systemd installs
- headless Docker installs
- a CLI/web-dashboard driven workflow (no desktop UI required)

## What It Runs

The Node daemon (`coworkd-node`) wires up:

- SQLite database + secure settings storage
- provider factories (LLM/search) + env import (optional)
- agent daemon + task execution
- WebSocket Control Plane + minimal HTTP UI (`/` + `/health`)
- optional channel gateway (Telegram/Discord/Slack/etc)
- optional MCP + cron (best-effort)

## Quick Start (Source Install)

```bash
npm ci
npm run build:daemon
npm run build:connectors

# Start the daemon (Control Plane on 127.0.0.1:18789 by default)
node bin/coworkd-node.js --print-control-plane-token
```

Notes:

- `bin/coworkd-node.js` will rebuild `better-sqlite3` for the current Node ABI if needed.
- By default the Control Plane binds to loopback (`127.0.0.1`) for safety. Use SSH tunnel/Tailscale for remote access.

## Remote Use (No Desktop Required)

1. SSH tunnel from your laptop:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@your-vps
```

2. Open the minimal dashboard:

```text
http://127.0.0.1:18789/
```

3. Or use the CLI:

```bash
export COWORK_CONTROL_PLANE_URL=ws://127.0.0.1:18789
export COWORK_CONTROL_PLANE_TOKEN=... # printed on first token generation or via --print-control-plane-token

node bin/coworkctl.js call config.get
node bin/coworkctl.js call llm.configure '{"providerType":"openai","apiKey":"sk-...","model":"gpt-4o-mini"}'
node bin/coworkctl.js call workspace.create '{"name":"main","path":"/srv/cowork/workspace"}'
node bin/coworkctl.js call task.create '{"workspaceId":"...","title":"Test","prompt":"Say hi"}'
node bin/coworkctl.js watch --event task.event
```

## Headless Limitations (Expected)

Some tools are desktop-only (clipboard, screenshot capture, opening files in Finder/Explorer, etc). In the Node daemon these will return a clear error instead of trying to use Electron APIs.
