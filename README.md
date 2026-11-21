# Sdysyhj — Pi Agent for VS Code

[![CI](https://github.com/tecaccc/Sdysyhj/actions/workflows/ci.yml/badge.svg)](https://github.com/tecaccc/Sdysyhj/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/tag/tecaccc/Sdysyhj?sort=semver&label=version)](https://github.com/tecaccc/Sdysyhj/tags)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A full coding agent in a sidebar chat — powered by [pi](https://github.com/tecaccc/Sdysyhj#runtime), driven by your own models, keys, and config.**

Sdysyhj (山巅一石一壶酒) embeds the pi coding agent into VS Code: read code, edit files, run commands, and iterate — all through natural conversation, without leaving the editor. It is a thin, honest client over the agent runtime you already trust: providers, credentials, sessions, MCP servers, and skills are shared with your existing pi setup (`~/.pi/agent/`). Nothing is duplicated, proxied, or re-uploaded.

## Why Sdysyhj

- **Your agent, your keys.** No bundled account, no telemetry, no server in the middle. The extension talks to a local pi process; models and credentials come from your pi configuration.
- **Real agent capabilities, real transparency.** Tool calls render as live cards — arguments, status, and output — with thinking folded in and full streaming Markdown. You always see what the agent is doing.
- **Zero-config start, full control later.** A bundled pi runtime works out of the box; point `sdysyhj.piPath` at your own CLI whenever you want to.
- **Engineering-grade isolation.** The agent runs in a monitored subprocess with strict JSONL RPC. If it ever crashes, it restarts once and tells you what to do — it can never take your editor down.

## Features

**Chat experience**
- Token-level streaming with rich Markdown (headings, tables, syntax-highlighted code, links), sanitized via DOMPurify under a strict CSP
- Reasoning ("thinking") sections collapsed by default, streaming when expanded
- Tool-call cards: name, argument summary, live status (`running / success / failed / aborted`), expandable input & output; long output keeps a tail with one-click *copy full output*
- Inline errors with actionable hints (provider issues, crashes, credential problems)

**Agent control**
- Stop any run mid-flight (`abort`)
- Interject while the agent is working — `steer` (redirect) or `follow-up` (queue), switchable per message
- Status bar with model, thinking level, and run state at a glance

**Sessions**
- Create, rename, browse, and switch sessions; history shows title, time, and message count
- Resume conversations exactly where you left them (including compacted context) — sessions live in pi's native storage, managed by pi
- Detects when a session file changes outside the extension and prompts a clean refresh instead of silently continuing on stale state

**Editor integration**
- `@file` mentions with workspace file picker
- Right-click a file or selection → **Send to Pi** to reference it in your next prompt
- Command-palette surface for everything (see below)

**Models & runtime**
- Switch model and thinking level per session; choices persist across restarts
- Runtime resolution: pi on `PATH` → bundled runtime fallback → explicit path (`sdysyhj.piPath`)

## Quick Start

1. Install the extension (or open this repo in VS Code and press `F5`).
2. Run **Sdysyhj: Open Chat** from the command palette.
3. Start asking. If you use your own pi CLI, make sure it's authenticated (`pi auth`) and configured (`pi config`); otherwise the bundled runtime gets you going immediately.

> Requirements: VS Code ≥ 1.85. Windows / macOS / Linux.

## Commands

| Command | Description |
| --- | --- |
| `Sdysyhj: Open Chat` | Open the chat panel |
| `Sdysyhj: New Session` | Start a new session (previous sessions are kept on disk) |
| `Sdysyhj: Abort` | Abort the current run |
| `Sdysyhj: Show Session History` | Browse and switch past sessions |
| `Sdysyhj: Rename Session` | Name the current session |
| `Sdysyhj: Switch Model` / `Switch Thinking Level` | Change model / reasoning level for this session |
| `Sdysyhj: Send to Pi` | Send a file path or selection as prompt material (context menu) |
| `Sdysyhj: Report Issue` | Open the issue tracker |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sdysyhj.piRuntime` | `auto` | Runtime source: `auto` (PATH pi, then bundled), `path`, or `bundled` |
| `sdysyhj.piPath` | `""` | Explicit path to the pi executable |
| `sdysyhj.thinkingDefault` | `""` | Default thinking level for new sessions (empty = inherit pi settings) |
| `sdysyhj.sendMode` | `steer` | How messages sent mid-run are queued: `steer` or `followUp` |
| `sdysyhj.outputTailLines` | `200` | Tail lines kept in tool-output cards (*copy full output* always copies everything) |

Providers, models, API keys, MCP servers, and skills are **not** configured here — they come from your existing pi configuration (`~/.pi/agent/`, `pi auth`, `pi config`).

## Privacy & Security

- Sessions and state live only in pi's native locations (`~/.pi/agent/`); the extension keeps no copies and adds no telemetry
- Webview hardened with CSP `default-src 'none'`, per-load nonces, and DOMPurify sanitization
- Logs are redacted before leaving the process — credentials and API keys are filtered by pattern

## Architecture

```
Webview (chat UI) ⇄ ChatPanel ⇄ PiBridge (state machine, event translation)
                                   ⇄ RpcClient (strict JSONL RPC)
                                       ⇄ pi --mode rpc (subprocess)
```

- The agent is a monitored child process; a crash triggers exactly one automatic restart with an actionable error — the host editor is never affected
- Event flow: `message_update` → `message_end` (authoritative transcript) → `agent_settled`

## Development & Release

```bash
npm install
npm run typecheck           # tsc --noEmit
npm run build               # esbuild (host bundle + webview bundle)
npm run verify:unit         # unit tests (Vitest)
npm run verify:integration  # integration tests against a fake pi subprocess — offline, deterministic
```

- CI runs the full suite on every push/PR to `main`
- Releases are tagged `v<version>` and published automatically to the Marketplace and GitHub Releases by [GitHub Actions](.github/workflows/release.yml); see [`docs/release.md`](docs/release.md)

Detailed specs live in [`docs/requirements.md`](docs/requirements.md) and [`docs/technical-design.md`](docs/technical-design.md).

## License

[MIT](LICENSE)
