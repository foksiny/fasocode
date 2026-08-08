# fasocode

An autonomous AI coding agent that runs as a native desktop app. Point it at a
project folder, pick a model, and let it read, write, search, and run commands
to build, refactor, and explain your code — all sandboxed to the folder you
trust.

fasocode is built with **Tauri 2** (Rust backend) and **React 19 + Vite +
TypeScript** (frontend). The frontend drives an agentic loop: it streams model
responses, executes tool calls against your filesystem through Tauri commands,
feeds the results back to the model, and repeats until the agent decides its
turn is done.

---

## Features

### Agentic coding loop
- **Autonomous tool use** — the model calls tools (`read`, `write`, `replace`,
  `run_command`, `search`, …) and keeps working until the task is complete or it
  hands control back to you.
- **Streaming + thinking** — responses and reasoning tokens stream in live.
  Reasoning effort (Low / Medium / High / Max) is configurable per model.
- **Stop generation** — abort a run mid-turn.

### Project & chat management
- **Projects** map to a local folder on disk. Tool calls are confined to that
  folder (path-traversal protected on the Rust side).
- **Chats** live under projects. Each chat keeps its own message history and
  ToDo list.
- **State is persisted** to `state.json` in your OS app-config directory, with
  automatic one-way migration from the legacy `~/.fasocode/state.json` location.

### Prompt superpowers
- **`@mentions`** — type `@` to autocomplete files in the project folder; their
  contents are injected into the model context automatically.
- **Slash commands** — prefix a message to steer the agent:
  - `/grill-me <task>` — interrogate you with 10+ clarifying questions first.
  - `/plan <task>` — produce a detailed plan and wait for approval before
    executing.
  - `/explain <topic>` — explain a topic in plain language.
  - `/review [focus]` — review recent work for bugs, risks, and style.
  - `/tests [target]` — generate and run tests for the target.
- **Skills library** — reusable markdown documents (workflows, guidelines,
  templates) the agent can load with `use_skill` and persist with
  `create_skill`. Skills support YAML frontmatter (`name`, `description`).
- **Ask-user questions** — the agent can ask structured questions
  (`choice`, `toggle`, `confirm`, `input`, `mix`) and pause until you answer.

### Multi-provider model management
- Configure models for **OpenAI**, **Google (Gemini)**, **OpenRouter**,
  **NVIDIA NIM**, and **OpenCode Zen**, each with its own API key.
- Context windows are auto-detected from provider APIs where available, falling
  back to a built-in catalog by model name.
- A live context-usage meter shows estimated token consumption, and the loop
  **auto-compresses** long conversations into a summary before they overflow.

### Sandboxed filesystem backends (Rust)
- All file/command operations go through Tauri commands in `src-tauri/src/lib.rs`,
  which canonicalize paths and reject anything escaping the project folder.
- Permissions are scoped in `src-tauri/capabilities/default.json`
  (filesystem, HTTP allow-lists).

---

## Tech stack

| Layer    | Tech                                                                  |
| -------- | --------------------------------------------------------------------- |
| Backend  | Tauri 2, serde/serde_json, plugins: dialog, fs, http, opener         |
| Frontend | React 19, TypeScript 5.8, Vite 7                                     |
| Markdown | react-markdown + remark-gfm + remark-breaks                         |
| Fonts    | @fontsource/space-grotesk                                             |

---

## Getting started

### Prerequisites

- **Node.js** (with npm)
- **Rust** toolchain (`rustup`)
- **Tauri 2 prerequisites** for your OS — see the
  [Tauri setup guide](https://v2.tauri.app/start/prerequisites/):
  - **Windows:** Microsoft C++ Build Tools, WebView2
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `webkit2gtk` and related system packages

### Install & run

```bash
# 1. Install frontend dependencies
npm install

# 2. Run the desktop app in development (hot-reload frontend + Rust)
npm run tauri dev

# 3. Build a production bundle for your OS
npm run tauri build
```

Other useful scripts:

```bash
npm run dev       # Vite-only dev server (web, no Tauri shell) — http://localhost:1420
npm run build     # tsc + vite build (frontend only)
npm run preview   # preview the built frontend
```

> The Vite dev server runs on port **1420** (`strictPort`), which Tauri expects
> during development.

### First run

1. Launch the app and open **Settings**.
2. Under **Providers**, add your API key(s) for the providers you want to use.
3. Under **Models**, add a model for each provider (e.g. `gpt-5`, `gemini-2.5-pro`,
   `deepseek-ai/deepseek-r1` on NIM). Context length and thinking support are
   detected automatically.
4. Create a **Project**, pick its local folder, and acknowledge the trust prompt.
5. Start a chat, select a model, and go.

---

## Project structure

```
.
├── src/                      # Frontend (React + TypeScript)
│   ├── App.tsx               # UI, app state, tool execution, chat management
│   ├── ai.ts                 # Agentic loop, streaming, provider endpoints, system prompt
│   ├── store.ts             # state.json load/save + legacy migration
│   ├── main.tsx              # React entry point
│   └── App.css               # Styling
├── src-tauri/                # Backend (Rust / Tauri)
│   ├── src/
│   │   ├── lib.rs            # Tauri commands: tool_read, tool_write,
│   │   │                     #   tool_edit, tool_run_command, tool_search, …
│   │   └── main.rs           # Binary entry point
│   ├── capabilities/
│   │   └── default.json      # Tauri permission capabilities (fs/http allow-lists)
│   ├── tauri.conf.json       # Tauri config (window, bundle, build hooks)
│   └── Cargo.toml            # Rust dependencies
├── index.html
├── vite.config.ts
└── package.json
```

### How a turn works

1. You send a message (optionally with `@mentions` or a slash command).
2. The frontend (`src/ai.ts`) builds the message history + the system prompt and
   calls the provider's streaming endpoint (OpenAI-compatible or Gemini).
3. If the model emits **tool calls**, `App.tsx` routes each one to its handler.
   File/command tools invoke the Rust backend via `@tauri-apps/api/core`;
   library tools (`use_skill`, `todo`, `ask_user`, etc.) run in JS.
4. Tool results are appended to the history and the loop calls the model again.
5. When the model replies with plain text and no tool calls, the turn ends and
   control returns to you. Aborting is available at any step.

---

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## License

Licensed under the [MIT License](./LICENSE) — Copyright © 2026 Foksiny.

You may also add `"license": "MIT"` to `package.json` to declare it to tooling.
