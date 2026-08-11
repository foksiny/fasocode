import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readDir, remove } from "@tauri-apps/plugin-fs";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { loadState, saveState, flushState } from "./store";
import { runAgenticLoop, runAgent, errMessage, fetchModelCapabilities, estimateContextTokens, compactConversation, DEFAULT_CONTEXT_WINDOW, type ReasoningLevel, type ThinkingEffort } from "./ai";
import "./App.css";

const TEXTS = [
  "Build me a funny jokes app...",
  "Build me a genz programming language...",
  "Build me a minecraft clone...",
  "Build me a fasocode clone...",
  "Build me a recipe finder app...",
  "Build me a pixel art editor...",
  "Build me a habit tracker...",
  "Build me a retro arcade game...",
  "Build me a budget planner...",
];

export type ToolStatus = "running" | "done" | "error";

export type UndoData = { path: string; existed: boolean; content: string };

export type UserMessage = {
  id: number;
  role: "user" | "assistant" | "tool";
  text: string;
  sentAt: number;
  toolName?: string;
  args?: string;
  status?: ToolStatus;
  result?: string;
  undo?: UndoData | UndoData[];
  thinking?: string;
};
export type TodoItem = { id: number; task: string; done: boolean };
export type Chat = { id: number; name: string; messages: UserMessage[]; todos: TodoItem[] };
export type Project = { id: number; name: string; folder: string | null; chats: Chat[]; favorite: boolean };

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

const PROVIDERS: { id: string; name: string }[] = [
  { id: "opencode-zen", name: "OpenCode Zen" },
  { id: "openai", name: "OpenAI" },
  { id: "google", name: "Google" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "nvidia-nim", name: "Nvidia NIM" },
];

const SEARCH_ENGINES: { id: string; name: string; keyLabel: string; keyLink: string }[] = [
  {
    id: "brave",
    name: "Brave Search",
    keyLabel: "Brave Search API key",
    keyLink: "https://brave.com/search/api/",
  },
];

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export type Skill = { id: number; name: string; description: string; content: string };
export type Model = { id: number; providerId: string; name: string; displayName: string; contextLength?: number };

const DEFAULT_CONTEXT_BY_PROVIDER: Record<string, number> = {
  google: 1048576,
  openai: 128000,
  openrouter: 128000,
  "opencode-zen": 128000,
  "nvidia-nim": 128000,
};

export function contextLengthFor(model: Model): number {
  return model.contextLength && model.contextLength > 0
    ? model.contextLength
    : DEFAULT_CONTEXT_BY_PROVIDER[model.providerId] ?? DEFAULT_CONTEXT_WINDOW;
}

function parseSkill(fileName: string, content: string): Omit<Skill, "id"> {
  let name = fileName.replace(/\.md$/i, "");
  let description = "";
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (fm) {
    const nameMatch = fm[1].match(/^\s*name\s*:\s*(.+)$/m);
    const descMatch = fm[1].match(/^\s*description\s*:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, "");
  }
  return { name, description, content };
}

const MIN_WIDTH = 150;
const MAX_WIDTH = 450;
const INPUT_MAX_HEIGHT = 140;
const READ_CHUNK_LIMIT = 50000;
const HYPERTool_RESULT_LIMIT = 250000;
const RESULT_PREVIEW_LIMIT = 3000;

function formatElapsed(sec: number): string {
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m:${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h:${String(m % 60).padStart(2, "0")}m:${String(s % 60).padStart(2, "0")}s`;
}

type MessageViewProps = {
  m: UserMessage;
  isEditing: boolean;
  editDraft: string;
  isThinkingExpanded: boolean;
  isToolExpanded: boolean;
  showIndicator: boolean;
  sending: boolean;
  elapsed: number;
  mentionFiles: string[];
  onContextMenu: (e: React.MouseEvent, id: number) => void;
  onToggleThinking: (id: number) => void;
  onToggleTool: (id: number) => void;
  onEditChange: (v: string) => void;
  onEditBlur: () => void;
  onEditKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

const MessageView = memo(function MessageView({
  m,
  isEditing,
  editDraft,
  isThinkingExpanded,
  isToolExpanded,
  showIndicator,
  sending,
  elapsed,
  mentionFiles,
  onContextMenu,
  onToggleThinking,
  onToggleTool,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
}: MessageViewProps) {
  return (
    <div
      className={`chat-message ${m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "tool"}`}
      onContextMenu={(e) => onContextMenu(e, m.id)}
    >
      {m.role === "tool" ? (
        <>
          <div className="tool-event" onClick={() => onToggleTool(m.id)}>
            <span className={`tool-event-icon ${m.status ?? ""}`}>
              {m.status === "error" ? <CloseIcon /> : <BotIcon />}
            </span>
            <span className="tool-event-name">{m.toolName}</span>
            <span className="tool-event-args">{truncateText(m.args ?? "", 120)}</span>
            <span className={`tool-event-status ${m.status ?? ""}`}>
              {m.status === "running" ? "running" : m.status === "error" ? "failed" : "done"}
            </span>
          </div>
          {(m.status !== "running" || (m.result ?? "").length > 0) && (
            <pre
              className={`tool-event-result ${m.status === "running" ? "streaming" : ""} ${
                isToolExpanded ? "expanded" : ""
              }`}
            >
              {truncateText(
                m.result ?? "",
                m.status === "running" || isToolExpanded ? Number.MAX_SAFE_INTEGER : RESULT_PREVIEW_LIMIT,
              )}
            </pre>
          )}
        </>
      ) : isEditing ? (
        <textarea
          className="chat-message-edit"
          rows={2}
          autoFocus
          value={editDraft}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditBlur}
          onKeyDown={onEditKeyDown}
        />
      ) : (
        <>
          {m.role === "assistant" && m.thinking ? (
            <div className="thinking-block">
              <button
                className={`thinking-toggle ${isThinkingExpanded ? "open" : ""}`}
                onClick={() => onToggleThinking(m.id)}
              >
                <span className="thinking-chevron">▸</span>
                <span className="thinking-label">Thinking</span>
                {m.thinking.length > 0 && (
                  <span className="thinking-count">
                    {Math.max(1, Math.round(m.thinking.length / 4))} tokens
                  </span>
                )}
              </button>
              {isThinkingExpanded && <div className="thinking-content">{m.thinking}</div>}
            </div>
          ) : null}
          <div className="chat-message-text chat-md">
            <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>
              {m.role === "user" ? highlightMentions(m.text, mentionFiles) : m.text}
            </ReactMarkdown>
          </div>
          <div className="chat-message-time">
            {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          {showIndicator && (
            <span className={`work-indicator ${sending ? "live" : ""}`}>
              {sending ? "Working for " : "Worked for "}
              {formatElapsed(elapsed)}
              {sending ? "..." : ""}
            </span>
          )}
        </>
      )}
    </div>
  );
});

function resolveInProject(folder: string | null, rel: string): string {
  if (!folder) throw new Error("Project has no folder selected");
  const raw = rel.replace(/\\/g, "/");
  if (raw.startsWith("/")) {
    const root = folder.replace(/\/+$/, "");
    if (raw !== root && !raw.startsWith(root + "/")) {
      throw new Error(`Path is outside the project folder: ${rel}`);
    }
    return raw;
  }
  const norm = raw.replace(/^\.\//, "");
  const segments = norm.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "..")) {
    throw new Error(`Path escapes the project folder: ${rel}`);
  }
  return `${folder.replace(/\/+$/, "")}/${segments.join("/")}`;
}

function truncateText(s: string, limit: number): string {
  return s.length > limit ? `${s.slice(0, limit)}\n...[truncated]` : s;
}

function stripSearchHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ddgResultUrl(href: string): string {
  const raw = href.startsWith("//") ? `https:${href}` : href;
  const m = raw.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return raw;
    }
  }
  return raw;
}

function hypertoolArgSummary(args: Record<string, unknown>): string {
  const steps = Array.isArray(args.steps) ? args.steps : [];
  const parts = steps.map((s) => {
    const o = s as { name?: unknown; args?: Record<string, unknown> };
    const n = String(o.name ?? "?");
    const path = typeof o.args?.path === "string" ? `("${o.args.path}")` : "";
    const command = typeof o.args?.command === "string" ? `(${o.args.command.slice(0, 40)}…)` : "";
    return `${n}${path || command}`;
  });
  return parts.length > 0 ? `${parts.length} steps: ${parts.join(", ")}` : "(no steps)";
}

const SKIPPED_DIRS = new Set([
  ".git", "node_modules", "target", "dist", "build", ".next", ".nuxt", "venv", ".venv",
  "__pycache__", ".idea", ".vscode", ".cache", ".mypy_cache", ".pytest_cache", "coverage",
]);

async function walkProjectFiles(
  dir: string,
  base: string,
  depth: number,
  counter: { count: number },
  maxOut = 500,
): Promise<string[]> {
  if (depth > 14 || counter.count > 20000) return [];
  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (out.length >= maxOut) break;
    counter.count += 1;
    if (e.isDirectory && (SKIPPED_DIRS.has(e.name) || e.name.startsWith("."))) continue;
    const rel = `${dir === base ? "" : dir.slice(base.length + 1)}/${e.name}`;
    if (e.isDirectory) {
      out.push(`${rel}/`);
      out.push(...(await walkProjectFiles(`${dir}/${e.name}`, base, depth + 1, counter, maxOut)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function highlightMentions(text: string, files: string[]): string {
  return text.replace(/(^|\s)@([^\s@]+)/g, (full, pre, path) => {
    const rel = path.replace(/\/+$/, "");
    return files.some((p) => p.replace(/\/+$/, "") === rel) ? `${pre}\`@${path}\`` : full;
  });
}

type SlashCommand = {
  cmd: string;
  desc: string;
  template: string;
  apply: (rest: string) => string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: "/grill-me",
    desc: "Aggressively ask 10+ clarifying questions before starting",
    template: "/grill-me ",
    apply: (rest) =>
      `Before doing anything else, interrogate the user to fully lock in what they want for this task. Ask 10 or more sharp, specific, one-question-at-a-time clarifying questions, using the ask_user tool heavily to gather their answers in a structured way, then proceed.\n\nTask: ${rest}`,
  },
  {
    cmd: "/plan",
    desc: "Force a fully detailed, structured plan before execution",
    template: "/plan ",
    apply: (rest) =>
      `Produce a fully detailed, deeply structured plan for the following task FIRST. Present it to the user and STOP; do not begin executing until the plan is approved.\n\nTask: ${rest}`,
  },
  {
    cmd: "/explain",
    desc: "Explain a topic clearly in plain language",
    template: "/explain ",
    apply: (rest) => `Explain the following clearly and thoroughly, in plain language, with concrete references to the project where relevant.\n\nTopic: ${rest}`,
  },
  {
    cmd: "/review",
    desc: "Carefully review recent work in the project",
    template: "/review ",
    apply: (rest) =>
      `Carefully review the recent work in this project. ${rest ? `Focus on: ${rest}. ` : ""}Identify bugs, edge cases, stylistic issues, and risks; suggest concrete fixes. Do not modify files.`,
  },
  {
    cmd: "/tests",
    desc: "Generate and run tests for the target",
    template: "/tests ",
    apply: (rest) =>
      `Generate tests for the following work and run them; report results and fix failures when reasonable. ${rest ? `Target: ${rest}.` : ""}`,
  },
  {
    cmd: "/skill",
    desc: "Force-load a saved skill into this message",
    template: "/skill ",
    apply: () => "Skill requested by the user.",
  },
  {
    cmd: "/compact",
    desc: "Manually compact the conversation context now",
    template: "/compact",
    apply: () => "Compact the conversation context.",
  },
];

export type AskQuestion = {
  id: string;
  type: "choice" | "toggle" | "confirm" | "input" | "mix";
  subtype?: "choice" | "toggle" | "confirm";
  prompt: string;
  options?: string[];
  placeholder?: string;
};

function BotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

type PromptBoxProps = {
  value: string;
  placeholder: string;
  caret: boolean;
  models: Model[];
  selectedModelId: number | null;
  onSelectModel: (id: number) => void;
  modelWarning: boolean;
  reasoningLevel: ReasoningLevel;
  onReasoningLevelChange: (level: ReasoningLevel) => void;
  thinkingEfforts: ThinkingEffort[] | null;
  supportsThinking: boolean;
  thinkingLoading: boolean;
  sending: boolean;
  ctxUsed: number;
  ctxMax: number;
  mentionFiles: string[];
  skills: Skill[];
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "");
    return `${m}m`;
  }
  if (n >= 1_000) {
    const k = (n / 1_000).toFixed(1).replace(/\.0$/, "");
    return `${k}k`;
  }
  return String(n);
}

function PromptBox({
  value,
  placeholder,
  caret,
  models,
  selectedModelId,
  onSelectModel,
  modelWarning,
  reasoningLevel,
  onReasoningLevelChange,
  thinkingEfforts,
  supportsThinking,
  thinkingLoading,
  sending,
  ctxUsed,
  ctxMax,
  mentionFiles,
  skills,
  onChange,
  onSend,
  onStop,
}: PromptBoxProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerAnchorRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDir, setPickerDir] = useState<"down" | "up">("down");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [skillOpen, setSkillOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillIndex, setSkillIndex] = useState(0);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => setPickerOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT) + "px";
  }

  function togglePicker() {
    if (!pickerOpen) {
      const el = pickerAnchorRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const estHeight = Math.min(44 + models.length * 30, 320);
        setPickerDir(rect.bottom + 8 + estHeight > window.innerHeight ? "up" : "down");
      }
    }
    setPickerOpen((o) => !o);
  }

  const mentionItems = mentionOpen
    ? mentionFiles
        .filter((p) => p.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 200)
    : [];

  const slashItems = slashOpen
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(`/${slashQuery.toLowerCase()}`))
    : [];

  const skillItems = skillOpen
    ? skills
        .filter(
          (s) =>
            s.name.toLowerCase().includes(skillQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(skillQuery.toLowerCase()),
        )
        .slice(0, 100)
    : [];

  function updateMention(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
    const sm = text.match(/^\/([^\s@]*)$/);
    if (sm) {
      setSlashQuery(sm[1]);
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
    const skm = text.match(/^\/skill\s+([^\s@]*)$/);
    if (skm) {
      setSkillQuery(skm[1]);
      setSkillOpen(true);
      setSkillIndex(0);
    } else {
      setSkillOpen(false);
    }
  }

  function selectMention(path: string) {
    const el = inputRef.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (!m) return;
    const at = (m.index ?? 0) + m[0].indexOf("@");
    const next = el.value.slice(0, at) + "@" + path + " " + el.value.slice(el.selectionStart);
    onChange(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const pos = at + 1 + path.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }

  function selectSlash(cmd: SlashCommand) {
    onChange(cmd.template);
    setSlashOpen(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const pos = cmd.template.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      }
    });
  }

  function selectSkill(s: Skill) {
    onChange(`/skill ${s.name} `);
    setSkillOpen(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const pos = `/skill ${s.name} `.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      }
    });
  }

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;

  return (
    <>
      {sending && (
        <div className="cooking-indicator" role="status" aria-live="polite">
          <span className="cooking-pot">
            <svg className="cooking-pot-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h20" />
              <path d="M6 12v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5" />
              <path d="M9 8a3 3 0 0 1 6 0" />
              <path d="M7 9H4" />
              <path d="M20 9h-3" />
            </svg>
            <span className="cooking-steam steam-1" />
            <span className="cooking-steam steam-2" />
            <span className="cooking-steam steam-3" />
          </span>
          <span className="cooking-text">Faso is cooking</span>
          <span className="cooking-dots">
            <span className="cooking-dot" />
            <span className="cooking-dot" />
            <span className="cooking-dot" />
          </span>
        </div>
      )}
      <div className="input-wrap">
        <textarea
          ref={inputRef}
          className="search-input"
          rows={4}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            autoGrow(e.target);
            updateMention(e.target.value, e.target.selectionStart);
          }}
          onSelect={(e) => updateMention(e.currentTarget.value, e.currentTarget.selectionStart)}
          onClick={(e) => updateMention(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (mentionOpen && mentionItems.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % mentionItems.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectMention(mentionItems[mentionIndex]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMentionOpen(false);
                return;
              }
            }
            if (slashOpen && slashItems.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIndex((i) => (i + 1) % slashItems.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIndex((i) => (i - 1 + slashItems.length) % slashItems.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectSlash(slashItems[slashIndex]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashOpen(false);
                return;
              }
            }
            if (skillOpen && skillItems.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSkillIndex((i) => (i + 1) % skillItems.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSkillIndex((i) => (i - 1 + skillItems.length) % skillItems.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectSkill(skillItems[skillIndex]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSkillOpen(false);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        {slashOpen && (
          <div className="mention-menu" onMouseDown={(e) => e.stopPropagation()}>
            {slashItems.length === 0 ? (
              <div className="mention-empty">No commands match</div>
            ) : (
              slashItems.map((c, i) => (
                <button
                  key={c.cmd}
                  className={`mention-item ${i === slashIndex ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSlash(c)}
                  onMouseEnter={() => setSlashIndex(i)}
                >
                  <span className="slash-cmd">{c.cmd}</span>
                  <span className="slash-desc">{c.desc}</span>
                </button>
              ))
            )}
          </div>
        )}
        {skillOpen && (
          <div className="mention-menu" onMouseDown={(e) => e.stopPropagation()}>
            {skillItems.length === 0 ? (
              <div className="mention-empty">No skills match</div>
            ) : (
              skillItems.map((s, i) => (
                <button
                  key={s.id}
                  className={`mention-item ${i === skillIndex ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSkill(s)}
                  onMouseEnter={() => setSkillIndex(i)}
                >
                  <span className="slash-cmd">{s.name}</span>
                  <span className="slash-desc">{s.description}</span>
                </button>
              ))
            )}
          </div>
        )}
        {mentionOpen && (
          <div className="mention-menu" onMouseDown={(e) => e.stopPropagation()}>
            {mentionItems.length === 0 ? (
              <div className="mention-empty">No files match</div>
            ) : (
              mentionItems.map((p, i) => (
                <button
                  key={p}
                  className={`mention-item ${i === mentionIndex ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectMention(p)}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  {p}
                </button>
              ))
            )}
          </div>
        )}
        {value === "" && (
          <div className="search-placeholder" aria-hidden="true">
            {placeholder + (caret ? "\u258C" : "")}
          </div>
        )}
        {sending && (
          <button
            className="stop-btn"
            aria-label="Stop generating"
            title="Stop generating"
            onClick={onStop}
          >
            <span className="stop-btn-square" />
          </button>
        )}
      </div>
      <div className="model-row">
        <div className="model-pick-wrap" ref={pickerAnchorRef}>
          <button className={`model-pick-btn ${modelWarning ? "warn" : ""}`} onClick={togglePicker}>
            <BotIcon />
            <span className="model-pick-label">
              {selectedModel ? selectedModel.displayName : "No model"}
            </span>
          </button>
          {pickerOpen && (
            <div className={`model-picker ${pickerDir === "up" ? "up" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
              {models.length === 0 ? (
                <div className="model-picker-empty">
                  No models available. Add one in Settings.
                </div>
              ) : (
                models.map((m) => (
                  <button
                    key={m.id}
                    className={`model-picker-item ${selectedModelId === m.id ? "active" : ""}`}
                    onClick={() => {
                      onSelectModel(m.id);
                      setPickerOpen(false);
                    }}
                  >
                    {m.displayName}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {modelWarning && <span className="model-warning">Select a model first</span>}
        {selectedModel &&
          (supportsThinking ? (
            <div className="reasoning-level" title="Thinking effort for this model">
              {(thinkingEfforts ?? []).map((effort) => (
                <button
                  key={effort.value}
                  className={`reasoning-level-btn ${reasoningLevel === effort.value ? "active" : ""}`}
                  onClick={() => onReasoningLevelChange(effort.value)}
                >
                  {effort.label}
                </button>
              ))}
              {thinkingLoading && <span className="reasoning-level-loading">…</span>}
            </div>
          ) : (
            <span className="no-thinking" title="This model does not expose a thinking or reasoning mode">
              No Thinking Support
            </span>
          ))}
        <span
          className={`ctx-track ${ctxUsed > ctxMax * 0.95 ? "critical" : ctxUsed > ctxMax * 0.8 ? "warn" : ""}`}
          title={`Estimated context used: ${ctxUsed.toLocaleString()} of ${ctxMax.toLocaleString()} tokens`}
        >
          {fmtTokens(ctxUsed)}/{fmtTokens(ctxMax)}
        </span>
      </div>
    </>
  );
}

const SETTINGS_SECTIONS = ["Skills", "Providers", "Models"];

function App() {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(220);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState(SETTINGS_SECTIONS[0]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [keyModalProvider, setKeyModalProvider] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [openSkillId, setOpenSkillId] = useState<number | null>(null);
  const skillFileRef = useRef<HTMLInputElement>(null);
  const [editingSkillId, setEditingSkillId] = useState<number | null>(null);
  const [showSkillSource, setShowSkillSource] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [editSkillName, setEditSkillName] = useState("");
  const [editSkillDesc, setEditSkillDesc] = useState("");
  const [editSkillContent, setEditSkillContent] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [modelWarning, setModelWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>("medium");
  const [thinkingEfforts, setThinkingEfforts] = useState<ThinkingEffort[] | null>(null);
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [thinkingLoading, setThinkingLoading] = useState(false);
  const [ctxDetected, setCtxDetected] = useState<number | null>(null);
  const [mentionFiles, setMentionFiles] = useState<string[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<AskQuestion[] | null>(null);
  const [answersDraft, setAnswersDraft] = useState<Record<string, string | string[]>>({});
  const askResolverRef = useRef<((answers: string) => void) | null>(null);
  const askRejectorRef = useRef<((err: Error) => void) | null>(null);
  const [expandedThinkingId, setExpandedThinkingId] = useState<number | null>(null);
  const thinkingToggledRef = useRef<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const selectedChatIdRef = useRef<number | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!timerActive) return;
    const t = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(t);
  }, [timerActive]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [modelProviderId, setModelProviderId] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelDisplayName, setModelDisplayName] = useState("");
  const [modelContextLength, setModelContextLength] = useState("");
  const [ctxUsed, setCtxUsed] = useState(0);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(true);
  const [textIndex, setTextIndex] = useState(0);
  const [value, setValue] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const [trustChecked, setTrustChecked] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
  const [chatNameDraft, setChatNameDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: number } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [expandedToolId, setExpandedToolId] = useState<number | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const pendingUndoRef = useRef<UndoData | UndoData[] | null>(null);
  const subAgentsRef = useRef<Map<string, { controller: AbortController; promise: Promise<string> }>>(new Map());
  const subAgentBuffersRef = useRef<Map<string, string[]>>(new Map());
  const subAgentLiveRef = useRef(false);
  const inSubToolRef = useRef(false);
  const agentsStallReportedRef = useRef(false);
  const selectedProjectIdRef = useRef<number | null>(null);
  selectedProjectIdRef.current = selectedProjectId;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const editingMessageIdRef = useRef<number | null>(null);
  editingMessageIdRef.current = editingMessageId;
  const editDraftRef = useRef("");
  editDraftRef.current = editDraft;
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const applyUndosRef = useRef(applyUndos);
  applyUndosRef.current = applyUndos;
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const paused = value !== "";

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((res) => {
        if (cancelled) return;
        const s = res.state;
        if (res.error && !res.missing) {
          console.error("State load failed:", res.error);
          setLoadError(res.error);
        }
        if (s) {
          try {
            setApiKeys(s.apiKeys ?? {});
            setModels(Array.isArray(s.models) ? s.models : []);
            setSkills(Array.isArray(s.skills) ? s.skills : []);
            const savedProjects = Array.isArray(s.projects) ? s.projects : [];
            setProjects(
              savedProjects.map((p) => ({
                ...p,
                favorite: p.favorite === true,
                folder: p.folder ?? null,
                chats: Array.isArray(p.chats)
                  ? p.chats.map((c) => ({
                      ...c,
                      todos: Array.isArray(c.todos) ? c.todos : [],
                      messages: Array.isArray(c.messages)
                        ? c.messages.map((m) => ({ ...m, role: (m as UserMessage).role ?? "user" }))
                        : [],
                    }))
                  : [],
              })),
            );
            setSelectedModelId(s.selectedModelId ?? null);
            setReasoningLevel((s.reasoningLevel as ReasoningLevel) ?? "medium");
            setSelectedProjectId(s.selectedProjectId ?? null);
            setSelectedChatId(s.selectedChatId ?? null);
            const allIds = [
              ...savedProjects.flatMap((p) => [
                p.id,
                ...(Array.isArray(p.chats) ? p.chats : []).flatMap((c) => [
                  c.id,
                  ...(Array.isArray(c.todos) ? c.todos : []).map((t) => t.id),
                  ...(Array.isArray(c.messages) ? c.messages : []).map((m) => m.id),
                ]),
              ]),
              ...(Array.isArray(s.models) ? s.models : []).map((m) => m.id),
              ...(Array.isArray(s.skills) ? s.skills : []).map((k) => k.id),
            ];
            idRef.current = Math.max(0, ...allIds) + 1;
          } catch (err) {
            console.error("Failed to apply loaded state:", err);
          }
        }
        setHydrated(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load state:", err);
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState({ apiKeys, models, skills, projects, selectedModelId, selectedProjectId, selectedChatId, reasoningLevel });
  }, [hydrated, apiKeys, models, skills, projects, selectedModelId, selectedProjectId, selectedChatId, reasoningLevel]);

  useEffect(() => {
    const flush = () => flushState();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    const blink = setInterval(() => setCaret((c) => !c), 500);
    return () => clearInterval(blink);
  }, []);

  useEffect(() => {
    if (paused) return;
    const full = TEXTS[textIndex];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const erase = () => {
      i -= 1;
      setText(full.slice(0, i));
      if (i > 0) {
        timer = setTimeout(erase, 15);
      } else {
        setTextIndex((textIndex + 1) % TEXTS.length);
      }
    };

    const tick = () => {
      i += 1;
      setText(full.slice(0, i));
      if (i < full.length) {
        timer = setTimeout(tick, 35);
      } else {
        timer = setTimeout(erase, 5000);
      }
    };

    timer = setTimeout(tick, 300);
    return () => clearTimeout(timer);
  }, [textIndex, paused]);

  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSettings(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings]);

  useEffect(() => {
    if (!showAddModel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAddModel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddModel]);

  useEffect(() => {
    if (editingSkillId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingSkillId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingSkillId]);

  useEffect(() => {
    const project = projects.find((p) => p.id === selectedProjectId) ?? null;
    const chat = project?.chats.find((c) => c.id === selectedChatId) ?? null;
    if (!project || !chat) {
      setCtxUsed(0);
      return;
    }
    const history = chat.messages.map((m): { role: "user" | "assistant"; text: string } => {
      if (m.role === "tool") {
        return {
          role: "assistant",
          text: `[tool ${m.toolName ?? "?"}] ${m.args ?? ""}\n${m.result ?? m.text ?? ""}`,
        };
      }
      if (m.role === "assistant" && m.thinking) {
        return { role: "assistant", text: `${m.text}\n[thinking]\n${m.thinking}` };
      }
      return { role: m.role, text: m.text };
    });
    setCtxUsed(estimateContextTokens(project.name, project.folder, history));
  }, [projects, selectedProjectId, selectedChatId]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.style.cursor = "col-resize";

    const onMove = (ev: MouseEvent) => {
      setWidth(Math.min(Math.max(startWidth + ev.clientX - startX, MIN_WIDTH), MAX_WIDTH));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function closeNewProject() {
    setShowNewProject(false);
    setProjectName("");
    setProjectFolder(null);
    setTrustChecked(false);
  }

  async function onFolderPick() {
    const folder = await openDialog({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });
    if (typeof folder === "string") setProjectFolder(folder);
  }

  function createProject() {
    const name = projectName.trim();
    if (!name || !projectFolder || !trustChecked) return;
    const project: Project = { id: idRef.current++, name, folder: projectFolder, chats: [], favorite: false };
    setProjects((p) => [...p, project]);
    setSelectedProjectId(project.id);
    closeNewProject();
  }

  function toggleFavorite(projectId: number) {
    setProjects((ps) => ps.map((p) => (p.id === projectId ? { ...p, favorite: !p.favorite } : p)));
  }

  function createChat(projectId: number) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === projectId
          ? { ...p, chats: [...p.chats, { id: idRef.current++, name: `Chat ${p.chats.length + 1}`, messages: [], todos: [] }] }
          : p,
      ),
    );
    setSelectedProjectId(projectId);
    setSelectedChatId(null);
  }

  function openChat(projectId: number, chatId: number) {
    setSelectedProjectId(projectId);
    setSelectedChatId(chatId);
  }

  function deleteChat(projectId: number, chatId: number) {
    setProjects((ps) =>
      ps.map((p) => (p.id === projectId ? { ...p, chats: p.chats.filter((c) => c.id !== chatId) } : p)),
    );
    if (selectedChatId === chatId) setSelectedChatId(null);
  }

  function startRename(chatId: number, name: string) {
    setRenamingChatId(chatId);
    setChatNameDraft(name);
  }

  function saveRename() {
    const name = chatNameDraft.trim();
    if (renamingChatId !== null && name) {
      setProjects((ps) =>
        ps.map((p) => ({
          ...p,
          chats: p.chats.map((c) => (c.id === renamingChatId ? { ...c, name } : c)),
        })),
      );
    }
    setRenamingChatId(null);
  }

  function appendMessage(msg: UserMessage) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId ? { ...c, messages: [...c.messages, msg] } : c,
              ),
            }
          : p,
      ),
    );
  }

  function appendMessageText(messageId: number, updater: (prev: string) => string) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === messageId ? { ...m, text: updater(m.text) } : m,
                      ),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );
  }

  function appendMessageThinking(messageId: number, updater: (prev: string | undefined) => string) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === messageId ? { ...m, thinking: updater(m.thinking) } : m,
                      ),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );
  }

  function appendToolMessageResult(messageId: number, chunk: string) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === messageId ? { ...m, result: (m.result ?? "") + chunk } : m,
                      ),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );
  }

  function setToolMessageStatus(messageId: number, status: ToolStatus, suffix?: string) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === messageId
                          ? { ...m, status, result: suffix ? `${m.result ?? ""}${suffix}` : m.result }
                          : m,
                      ),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );
  }

  function updateToolMessage(messageId: number, status: ToolStatus, result: string, undo?: UndoData | UndoData[] | null) {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === messageId
                          ? {
                              ...m,
                              status,
                              result:
                                status === "error" && m.result
                                  ? `${m.result}\n\n[error] ${result}`
                                  : result,
                              undo: undo ?? m.undo,
                            }
                          : m,
                      ),
                    }
                  : c,
              ),
            }
          : p,
      ),
    );
  }

  function removeTrailingEmptyAssistant() {
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? { ...c, messages: c.messages.filter((m) => !(m.role === "assistant" && m.text === "")) }
                  : c,
              ),
            }
          : p,
      ),
    );
  }

  function flashModelWarning() {
    setModelWarning(true);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => setModelWarning(false), 2500);
  }

  function skillListingText(prefix?: string): string {
    const lines =
      skills.length === 0
        ? "(the skills library is empty; you can create a skill with create_skill)"
        : skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
    return prefix ? `${prefix}\nAvailable skills:\n${lines}` : `Available skills:\n${lines}`;
  }

  function forcedSkillText(term: string): string {
    const t = term.trim().toLowerCase();
    if (!t) return skillListingText("The user invoked /skill without naming a skill. Inform them what is available.");
    const byName = skills.find((s) => s.name.toLowerCase() === t);
    const matched = byName
      ? [byName]
      : skills.filter((s) => s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t));
    if (matched.length === 0)
      return skillListingText(`The user invoked /skill "${term.trim()}" but no skill matched. Inform them what is available.`);
    return matched
      .map((s) => `FORCED SKILL: ${s.name} — ${s.description}\n\nThe user has explicitly forced this skill. Follow it as mandatory instructions for the task below.\n\n${s.content}`)
      .join("\n\n---\n\n");
  }

  async function sendMessage(textOverride?: string, baseMessages?: UserMessage[], force?: boolean) {
    const textToSend = (textOverride ?? value).trim();
    if (!textToSend || selectedProjectId === null || selectedChatId === null) return;
    if (sending && !force) return;
    const isFirstMessage = (baseMessages ?? selectedChat?.messages ?? []).length === 0;
    if (isFirstMessage && selectedModelId === null) {
      flashModelWarning();
      return;
    }
    const project = selectedProject;
    const chat = selectedChat;
    const model = models.find((m) => m.id === selectedModelId);
    if (!project || !chat || !model) {
      flashModelWarning();
      return;
    }
    if (isFirstMessage) {
      const chatTitle = textToSend.trim().split(/\s+/).slice(0, 6).join(" ") || model.displayName;
      setProjects((ps) =>
        ps.map((p) =>
          p.id === project.id
            ? { ...p, chats: p.chats.map((c) => (c.id === chat.id ? { ...c, name: chatTitle } : c)) }
            : p,
        ),
      );
    }
    const apiKey = apiKeys[model.providerId];
    if (!apiKey) {
      appendMessage({
        id: idRef.current++,
        role: "assistant",
        text: `Error: no API key configured for ${PROVIDERS.find((p) => p.id === model.providerId)?.name}. Add one in Settings.`,
        sentAt: Date.now(),
      });
      return;
    }

    if (textToSend === "/compact" || textToSend.startsWith("/compact ")) {
      setValue("");
      await handleManualCompact(chat, model, apiKey);
      return;
    }

    const userMsg: UserMessage = { id: idRef.current++, role: "user", text: textToSend, sentAt: Date.now() };
    appendMessage(userMsg);
    setValue("");
    setSending(true);
    setElapsed(0);
    setTimerActive(true);
    const history: { role: "user" | "assistant"; text: string }[] = [...(baseMessages ?? chat.messages), userMsg]
      .filter((m) => m.role !== "tool")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", text: m.text }));
    const slashCmd = SLASH_COMMANDS.find((c) => textToSend.startsWith(c.cmd) && (textToSend.length === c.cmd.length || /\s/.test(textToSend[c.cmd.length])));
    if (slashCmd) {
      const rest = textToSend.slice(slashCmd.cmd.length).trim();
      if (slashCmd.cmd === "/skill") {
        history.unshift({ role: "user", text: forcedSkillText(rest) });
      } else {
        history.unshift({ role: "user", text: slashCmd.apply(rest) });
      }
    }
    if (project.folder) {
      const mentionParts: string[] = [];
      const mentioned = new Set<string>();
      const mentionRe = /(?:^|\s)@([^\s@]+)/g;
      let mentionMatch: RegExpExecArray | null;
      while ((mentionMatch = mentionRe.exec(textToSend))) mentioned.add(mentionMatch[1]);
      for (const raw of mentioned) {
        const rel = raw.replace(/\/+$/, "");
        const matched = mentionFiles.find((p) => p.replace(/\/+$/, "") === rel);
        if (!matched) continue;
        try {
          const abs = resolveInProject(project.folder, rel);
          if (matched.endsWith("/")) {
            const children = await walkProjectFiles(abs, abs, 0, { count: 0 }, 300);
            mentionParts.push(`Folder ${rel}/ contains:\n${children.map((c) => `- ${c}`).join("\n")}`);
          } else {
            const content = await readTextFile(abs);
            mentionParts.push(`${rel}:\n${truncateText(content, READ_CHUNK_LIMIT)}`);
          }
        } catch {
          // unreadable mention — skip silently
        }
      }
      if (mentionParts.length > 0) {
        history.push({ role: "user", text: `Referenced project files:\n\n${mentionParts.join("\n\n")}` });
      }
    }
    const controller = new AbortController();
    sendAbortRef.current = controller;
    let assistantId: number | null = null;
    let toolMsgId: number | null = null;
    let thinkingStreamed = false;
    let abortedRef = false;
    let pendingText = "";
    let pendingThinking = "";
    let pendingToolStream = "";
    let rafId: number | null = null;
    let rafMessageId: number | null = null;
    let toolRafId: number | null = null;

    function scheduleToolFlush() {
      if (toolRafId !== null) return;
      toolRafId = requestAnimationFrame(() => {
        toolRafId = null;
        if (toolMsgId === null) return;
        const chunk = pendingToolStream;
        pendingToolStream = "";
        if (!chunk) return;
        appendToolMessageResult(toolMsgId, chunk);
      });
    }

    function scheduleStreamFlush(messageId: number | null) {
      if (rafId !== null || messageId === null) return;
      rafMessageId = messageId;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const mid = rafMessageId;
        rafMessageId = null;
        if (mid === null) return;
        if (pendingText) {
          const t = pendingText;
          pendingText = "";
          appendMessageText(mid, (prev) => prev + t);
        }
        if (pendingThinking) {
          const t = pendingThinking;
          pendingThinking = "";
          appendMessageThinking(mid, (prev) => (prev ?? "") + t);
        }
      });
    }

    function skillListing(prefix?: string): string {
      const lines = skills.length === 0
        ? "(the skills library is empty; you can create a skill with create_skill)"
        : skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
      return prefix ? `${prefix}\nAvailable skills:\n${lines}` : `Available skills:\n${lines}`;
    }

    const runTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
      if (name === "run_command") {
        const command = String(args.command ?? "");
        if (!command.trim()) throw new Error("command is required");
        const timeout = args.timeout != null ? Number(args.timeout) : null;
        const token = crypto.randomUUID?.() ?? `cmd-${Date.now()}-${Math.random()}`;
        return await new Promise<string>((resolve, reject) => {
          let settled = false;
          let commandId: number | null = null;
          let unlistenFns: Array<() => void> = [];
          const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            for (const un of unlistenFns) un();
            clearTimeout(watchdog);
            controller.signal.removeEventListener("abort", onAbort);
            fn();
          };
          const onAbort = () => {
            if (commandId !== null) void invoke("tool_kill_command", { id: commandId });
            finish(() => reject(new DOMException("Aborted", "AbortError")));
          };
          controller.signal.addEventListener("abort", onAbort, { once: true });
          const watchdog = setTimeout(
            () => finish(() => reject(new Error(`command did not finish within ${timeout ?? 30}s`))),
            ((timeout ?? 30) * 1000) + 15000,
          );
          void (async () => {
            try {
              const [unOut, unDone] = await Promise.all([
                listen<{ id: number; token: string; stream: string; chunk: string }>(
                  "tool-command-output",
                  (e) => {
                    if (e.payload.token !== token) return;
                    const chunk = e.payload.chunk ?? "";
                    if (!chunk) return;
                    if (inSubToolRef.current && !subAgentLiveRef.current) return;
                    pendingToolStream += chunk;
                    scheduleToolFlush();
                  },
                ),
                listen<{ id: number; token: string; exit_code: number | null; timed_out: boolean; error: string | null; output: string }>(
                  "tool-command-finished",
                  (e) => {
                    if (e.payload.token !== token) return;
                    if (toolMsgId !== null && pendingToolStream) {
                      const chunk = pendingToolStream;
                      pendingToolStream = "";
                      appendToolMessageResult(toolMsgId, chunk);
                    }
                    finish(() => {
                      if (e.payload.error) {
                        const partial = e.payload.output ?? "";
                        reject(
                          new Error(
                            partial
                              ? `${e.payload.error}\n\n(partial output below)\n${partial}`
                              : e.payload.error,
                          ),
                        );
                      } else {
                        resolve(e.payload.output ?? "");
                      }
                    });
                  },
                ),
              ]);
              if (settled) {
                unOut();
                unDone();
                return;
              }
              unlistenFns = [unOut, unDone];
              const id = await invoke<number>("tool_run_command", {
                command,
                folder: project.folder ?? "",
                timeout,
                token,
              });
              commandId = id;
              if (controller.signal.aborted) onAbort();
            } catch (err) {
              finish(() => reject(err));
            }
          })();
        });
      }
      if (name === "hypertool") {
        const steps = Array.isArray(args.steps) ? (args.steps as { name?: unknown; args?: unknown }[]) : null;
        if (!steps || steps.length === 0) throw new Error("steps must be a non-empty array of {name, args}");
        const stopOnError = args.stop_on_error !== false;
        const results: string[] = [];
        const undos: UndoData[] = [];
        let failed = 0;
        for (let i = 0; i < steps.length; i++) {
          const stepName = String(steps[i]?.name ?? "").trim();
          const stepArgs =
            steps[i]?.args && typeof steps[i].args === "object"
              ? (steps[i].args as Record<string, unknown>)
              : {};
          if (!stepName) {
            const errMsg = `[step ${i + 1}] <missing tool name> skipped`;
            if (stopOnError) throw new Error(errMsg);
            failed++;
            results.push(errMsg);
            continue;
          }
          if (stepName === "hypertool") {
            const errMsg = `[step ${i + 1}] hypertool: cannot nest hypertool inside hypertool`;
            if (stopOnError) throw new Error(errMsg);
            failed++;
            results.push(errMsg);
            continue;
          }
          if (stepName === "ask_user") {
            const errMsg = `[step ${i + 1}] hypertool: ask_user cannot run inside hypertool`;
            if (stopOnError) throw new Error(errMsg);
            failed++;
            results.push(errMsg);
            continue;
          }
          const undoBefore = pendingUndoRef.current;
          try {
            const stepResult = await runTool(stepName, stepArgs);
            const undoAfter = pendingUndoRef.current;
            if (undoAfter && undoAfter !== undoBefore) {
              if (Array.isArray(undoAfter)) undos.push(...undoAfter);
              else undos.push(undoAfter);
            }
            const pathArg = typeof stepArgs.path === "string" ? stepArgs.path : "";
            const argStr = pathArg ? `"${pathArg}"` : JSON.stringify(stepArgs);
            const short = argStr.length > 80 ? `${argStr.slice(0, 80)}…` : argStr;
            const stepOut = `[step ${i + 1}] ${stepName}(${short})\n${stepResult}`;
            results.push(stepOut);
            if (toolMsgId !== null && !(inSubToolRef.current && !subAgentLiveRef.current)) {
              appendToolMessageResult(toolMsgId, `\n\n${stepOut}`);
            }
          } catch (err) {
            const errMsg = `[step ${i + 1}] ${stepName}: ${errMessage(err)}`;
            if (stopOnError) throw new Error(errMsg);
            failed++;
            results.push(errMsg);
            if (toolMsgId !== null && !(inSubToolRef.current && !subAgentLiveRef.current)) {
              appendToolMessageResult(toolMsgId, `\n\n${errMsg}`);
            }
          }
        }
        pendingUndoRef.current = undos.length ? (undos.length === 1 ? undos[0] : undos) : null;
        const ok = results.length - failed;
        const summary = `\n\nSummary: ${ok}/${results.length} steps succeeded${failed > 0 ? `, ${failed} failed` : ""}.`;
        return truncateText(results.join("\n\n") + summary, HYPERTool_RESULT_LIMIT);
      }
      if (name === "use_skill") {
        const term = String(args.name ?? "").trim().toLowerCase();
        if (!term) return skillListing();
        const matches = skills.filter(
          (s) => s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term),
        );
        if (matches.length === 0) return skillListing(`No skill matched "${term}".`);
        return matches
          .map((s) => `# ${s.name}\n${s.description}\n\n${s.content}`)
          .join("\n\n---\n\n");
      }
      if (name === "create_skill") {
        const sName = String(args.name ?? "").trim();
        const sDesc = String(args.description ?? "").trim();
        const sContent = String(args.content ?? "").trim();
        if (!sName) throw new Error("name is required");
        if (!sContent) throw new Error("content is required");
        const existing = skills.find((s) => s.name.toLowerCase() === sName.toLowerCase());
        if (existing) {
          setSkills((ss) => ss.map((s) => (s.id === existing.id ? { ...s, name: sName, description: sDesc, content: sContent } : s)));
          return `Updated skill "${sName}"`;
        }
        setSkills((ss) => [...ss, { id: idRef.current++, name: sName, description: sDesc, content: sContent }]);
        return `Created skill "${sName}" (${sContent.length} chars)`;
      }
      if (name === "todo") {
        const action = String(args.action ?? "list").toLowerCase();
        const current = chat.todos;
        const updateTodos = (next: TodoItem[]): string => {
          setProjects((ps) =>
            ps.map((p) =>
              p.id === project.id
                ? { ...p, chats: p.chats.map((c) => (c.id === chat.id ? { ...c, todos: next } : c)) }
                : p,
            ),
          );
          if (next.length === 0) return "ToDo list is empty";
          const done = next.filter((t) => t.done).length;
          return `ToDo list (${done}/${next.length} done):\n${next.map((t) => `- [${t.done ? "x" : " "}] ${t.task}`).join("\n")}`;
        };
        switch (action) {
          case "create":
          case "update":
          case "replace": {
            if (!Array.isArray(args.tasks)) throw new Error("tasks array is required for create/update");
            const items: TodoItem[] = args.tasks.map((t) => {
              const raw = t as { task?: unknown; text?: unknown; status?: unknown; done?: unknown };
              const taskText = String(raw.task ?? raw.text ?? "").trim();
              if (!taskText) throw new Error("each task needs a task text");
              const status = String(raw.status ?? "").toLowerCase();
              const done = status === "done" || status === "completed" || raw.done === true;
              return { id: idRef.current++, task: taskText, done };
            });
            return updateTodos(items);
          }
          case "complete": {
            const taskText = String(args.task ?? "").trim().toLowerCase();
            if (!taskText) throw new Error("task is required for complete");
            return updateTodos(current.map((t) => (t.task.toLowerCase() === taskText ? { ...t, done: true } : t)));
          }
          case "delete": {
            const taskText = String(args.task ?? "").trim().toLowerCase();
            if (!taskText) throw new Error("task is required for delete");
            return updateTodos(current.filter((t) => t.task.toLowerCase() !== taskText));
          }
          case "list":
          default:
            if (current.length === 0) return "ToDo list is empty";
            return `ToDo list (${current.filter((t) => t.done).length}/${current.length} done):\n${current
              .map((t) => `- [${t.done ? "x" : " "}] ${t.task}`)
              .join("\n")}`;
        }
      }
      if (name === "list_files") {
        const subPath = typeof args.path === "string" ? args.path.trim() : "";
        const exts: string[] = Array.isArray(args.extensions)
          ? args.extensions.map((e) => String(e).replace(/^\./, "").toLowerCase()).filter(Boolean)
          : [];
        const root = subPath ? resolveInProject(project.folder, subPath) : (project.folder ?? "");
        const counter = { count: 0 };
        const paths = await walkProjectFiles(root, root, 0, counter);
        let filtered = paths;
        if (exts.length > 0) {
          filtered = filtered.filter((f) => !f.endsWith("/") && exts.some((x) => f.toLowerCase().endsWith(`.${x}`)));
        }
        if (filtered.length === 0) return "(no files found)";
        const capped = filtered.slice(0, 500);
        const out = capped.join("\n");
        return filtered.length > 500 ? `${out}\n...(showing 500 of ${filtered.length} entries)` : out;
      }
      if (name === "fetch_url") {
        const url = String(args.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        let res: Response;
        try {
          res = await httpFetch(url, { headers: { "User-Agent": "fasocode" }, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const raw = await res.text();
        const contentType = res.headers.get("content-type") ?? "";
        let text = raw;
        if (contentType.includes("html") || /^\s*</.test(raw)) {
          text = raw
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\s+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }
        return truncateText(text, READ_CHUNK_LIMIT);
      }
      if (name === "search_web") {
        const query = String(args.query ?? "").trim();
        if (!query) throw new Error("query is required");
        const engine = args.engine === "brave" ? "brave" : "duckduckgo";
        const searchController = new AbortController();
        const timer = setTimeout(() => searchController.abort(), 20000);
        try {
          if (engine === "brave") {
            const key = (apiKeys.brave ?? "").trim();
            if (!key) {
              throw new Error(
                "Brave Search API key is not configured. Add it in Settings → Providers, or retry with engine 'duckduckgo'.",
              );
            }
            const res = await httpFetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
              { headers: { "X-Subscription-Token": key }, signal: searchController.signal },
            );
            if (!res.ok) throw new Error(`Brave Search API returned HTTP ${res.status}`);
            const data = (await res.json()) as {
              web?: { results?: { title?: string; url?: string; description?: string }[] };
            };
            const results = data.web?.results ?? [];
            if (results.length === 0) return "(no results found)";
            return results
              .slice(0, 10)
              .map((r, i) => `${i + 1}. ${r.title ?? "(untitled)"}\n   ${r.url ?? ""}\n   ${r.description ?? ""}`)
              .join("\n");
          }
          const res = await httpFetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            { headers: { "User-Agent": "fasocode" }, signal: searchController.signal },
          );
          if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
          const html = await res.text();
          const lines: string[] = [];
          for (const block of html.split(/<div class="result\b/).slice(1)) {
            if (lines.length >= 10) break;
            const anchor = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>/);
            if (!anchor) continue;
            const href = anchor[0].match(/href="([^"]+)"/)?.[1] ?? "";
            const title = stripSearchHtml(
              block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "",
            );
            const snippet = stripSearchHtml(
              (block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/) ??
                block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/))?.[1] ?? "",
            );
            if (!title && !snippet) continue;
            lines.push(`${lines.length + 1}. ${title || "(untitled)"}\n   ${ddgResultUrl(href)}\n   ${snippet}`);
          }
          return lines.length > 0 ? lines.join("\n") : "(no results found)";
        } finally {
          clearTimeout(timer);
        }
      }
      if (name === "search") {
        const query = String(args.query ?? "").trim();
        if (!query) throw new Error("query is required");
        const subPath = typeof args.path === "string" ? args.path.trim() : "";
        const root = subPath ? resolveInProject(project.folder, subPath) : (project.folder ?? "");
        const result = await invoke("tool_search", {
          folder: root,
          query,
          filePattern: typeof args.file_pattern === "string" && args.file_pattern.trim() ? args.file_pattern.trim() : null,
        });
        return String(result);
      }
      if (name === "ask_user") {
        const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
        const questions: AskQuestion[] = rawQuestions.map((q) => {
          const o = q as Record<string, unknown>;
          return {
            id: String(o.id ?? ""),
            type: (["choice", "toggle", "confirm", "input", "mix"].includes(String(o.type ?? "")) ? o.type : "input") as AskQuestion["type"],
            subtype: (["choice", "toggle", "confirm"].includes(String(o.subtype ?? "")) ? o.subtype : undefined) as AskQuestion["subtype"],
            prompt: String(o.prompt ?? ""),
            options: Array.isArray(o.options) ? o.options.map((x) => String(x)) : undefined,
            placeholder: typeof o.placeholder === "string" ? o.placeholder : undefined,
          };
        }).filter((q) => q.id && q.prompt);
        if (questions.length === 0) throw new Error("questions must be a non-empty array of {id, prompt, type}");
        return await new Promise<string>((resolve, reject) => {
          const initial: Record<string, string | string[]> = {};
          for (const q of questions) {
            if (q.type === "toggle") initial[q.id] = [];
            else if (q.type === "mix") {
              initial[q.id] = q.subtype === "toggle" ? [] : "";
              initial[`${q.id}__notes`] = "";
            } else initial[q.id] = "";
          }
          askResolverRef.current = (answerText: string) => resolve(answerText);
          askRejectorRef.current = reject;
          setAnswersDraft(initial);
          setPendingQuestions(questions);
          const onAbort = () => {
            setPendingQuestions(null);
            setAnswersDraft({});
            askResolverRef.current = null;
            askRejectorRef.current = null;
            reject(new Error("aborted"));
          };
          if (controller.signal.aborted) onAbort();
          else controller.signal.addEventListener("abort", onAbort, { once: true });
        });
      }
      if (name === "spawn_agents") {
        const rawAgents = Array.isArray(args.agents) ? (args.agents as Array<Record<string, unknown>>) : null;
        if (!rawAgents || rawAgents.length === 0) throw new Error("agents must be a non-empty array of {id, name, task}");
        if (rawAgents.length > 6) throw new Error("max 6 agents per spawn_agents call");
        const agents = rawAgents.map((a, i) => ({
          id: String(a.id ?? `agent-${i + 1}`).trim(),
          name: String(a.name ?? `Agent ${i + 1}`).trim(),
          task: String(a.task ?? "").trim(),
        }));
        for (const a of agents) {
          if (!a.id) throw new Error("each agent needs an id");
          if (!a.task) throw new Error(`agent "${a.id}" is missing a task`);
          if (subAgentsRef.current.has(a.id)) throw new Error(`agent id "${a.id}" is already running`);
        }
        const wait = args.wait === true;
        const promises: Promise<string>[] = [];
        const started: Array<{ id: string; name: string; brief: string }> = [];
        const subRunTool = async (name: string, args2: Record<string, unknown>): Promise<string> => {
          inSubToolRef.current = true;
          try {
            return await runTool(name, args2);
          } finally {
            inSubToolRef.current = false;
          }
        };
        for (const a of agents) {
          const subController = new AbortController();
          const onAbort = () => subController.abort();
          controller.signal.addEventListener("abort", onAbort, { once: true });
          const buffer: string[] = [];
          subAgentBuffersRef.current.set(a.id, buffer);
          const promise = runAgent(
            {
              model,
              apiKey,
              projectName: project.name,
              folder: project.folder,
              task: a.task,
              reasoningLevel,
              contextLength: ctxDetected ?? contextLengthFor(model),
              runTool: subRunTool,
            },
            {
              onStep: (line) => {
                buffer.push(line);
                if (subAgentLiveRef.current) {
                  pendingToolStream += line;
                  scheduleToolFlush();
                }
              },
            },
            subController.signal,
          ).finally(() => {
            controller.signal.removeEventListener("abort", onAbort);
            subAgentsRef.current.delete(a.id);
            subAgentBuffersRef.current.delete(a.id);
          });
          subAgentsRef.current.set(a.id, { controller: subController, promise });
          promises.push(promise);
          started.push({ id: a.id, name: a.name, brief: a.task.replace(/\s+/g, " ").trim().slice(0, 120) });
        }
        if (wait) {
          subAgentLiveRef.current = true;
          let settled: PromiseSettledResult<string>[];
          try {
            settled = await Promise.allSettled(promises);
          } finally {
            subAgentLiveRef.current = false;
          }
          if (pendingToolStream && toolMsgId !== null) {
            const chunk = pendingToolStream;
            pendingToolStream = "";
            appendToolMessageResult(toolMsgId, chunk);
          }
          const lines = started.map((s, i) => {
            const r = settled[i];
            return r.status === "fulfilled"
              ? `## ${s.name} (${s.id})\n${r.value}`
              : `## ${s.name} (${s.id})\n[error] ${errMessage(r.reason)}`;
          });
          return truncateText(lines.join("\n\n"), HYPERTool_RESULT_LIMIT);
        }
        return `Spawned ${started.length} background agent(s), working concurrently:\n${started
          .map((s) => `- ${s.id} (${s.name}): ${s.brief}`)
          .join("\n")}\n\nCall collect_agents to wait for their results (or end your turn and they are collected automatically).`;
      }
      if (name === "collect_agents") {
        const requestedIds = Array.isArray(args.ids) ? args.ids.map((i) => String(i).trim()).filter(Boolean) : null;
        const timeout = args.timeout != null ? Math.min(600, Math.max(1, Math.round(Number(args.timeout)))) : 120;
        const entries =
          requestedIds && requestedIds.length > 0
            ? requestedIds.filter((id) => subAgentsRef.current.has(id)).map((id) => [id, subAgentsRef.current.get(id)!] as const)
            : [...subAgentsRef.current.entries()];
        if (requestedIds && requestedIds.length > 0) {
          const missing = requestedIds.filter((id) => !subAgentsRef.current.has(id));
          if (entries.length === 0) return missing.length > 0 ? `(no running agent matches: ${missing.join(", ")})` : "(no agents running)";
        } else if (entries.length === 0) {
          return "(no background agents running)";
        }
        subAgentLiveRef.current = true;
        let settled: PromiseSettledResult<string>[] | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const allSettledP = Promise.allSettled(entries.map(([, a]) => a.promise));
          const result = await Promise.race([
            allSettledP,
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), timeout * 1000);
            }),
          ]);
          if (result !== null) settled = result;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          subAgentLiveRef.current = false;
        }
        if (pendingToolStream && toolMsgId !== null) {
          const chunk = pendingToolStream;
          pendingToolStream = "";
          appendToolMessageResult(toolMsgId, chunk);
        }
        if (settled === null) {
          const running = entries.map(([id]) => {
            const buf = subAgentBuffersRef.current.get(id);
            const progress = buf && buf.length > 0 ? `\n\n(progress so far)\n${buf.join("").slice(0, 4000)}` : "";
            return `## ${id}\n[running after ${timeout}s — call collect_agents again later]${progress}`;
          });
          return `Timed out after ${timeout}s — ${entries.length} agent(s) still running:\n\n${running.join("\n\n")}`;
        }
        const lines = entries.map(([id, a], i) => {
          const r = settled[i];
          const label = a.controller.signal.aborted ? `${id} (aborted)` : id;
          return r.status === "fulfilled"
            ? `## ${label}\n${r.value}`
            : `## ${label}\n[error] ${errMessage(r.reason)}`;
        });
        return truncateText(lines.join("\n\n"), HYPERTool_RESULT_LIMIT);
      }
      const pathArg = typeof args.path === "string" ? args.path : "";
      const filePath = resolveInProject(project.folder, pathArg);
      switch (name) {
        case "read": {
          try {
            const content = await readTextFile(filePath);
            return truncateText(content, READ_CHUNK_LIMIT);
          } catch {
            const entries = await readDir(filePath);
            if (entries.length === 0) return "(empty folder)";
            return entries.map((e) => (e.isDirectory ? `${e.name}/` : e.name)).join("\n");
          }
        }
        case "read_lines": {
          const content = await readTextFile(filePath);
          const lines = content.split("\n");
          const start = Math.max(1, Number(args.start_line ?? 1));
          const end = Math.min(lines.length, Number(args.end_line ?? start));
          if (start > lines.length) throw new Error("start_line beyond end of file");
          return lines.slice(start - 1, end).join("\n");
        }
        case "write": {
          const content = String(args.content ?? "");
          let existed = false;
          let prevContent = "";
          try {
            prevContent = await readTextFile(filePath);
            existed = true;
          } catch {
            // file does not exist yet
          }
          await writeTextFile(filePath, content);
          pendingUndoRef.current = { path: filePath, existed, content: prevContent };
          return `Wrote ${content.split("\n").length} lines to ${filePath}`;
        }
        case "replace": {
          const oldText = String(args.old_text ?? "");
          const newText = String(args.new_text ?? "");
          if (!oldText) throw new Error("old_text is required");
          const content = await readTextFile(filePath);
          if (!content.includes(oldText)) throw new Error("old_text not found in file");
          await writeTextFile(filePath, content.replace(oldText, newText));
          pendingUndoRef.current = { path: filePath, existed: true, content };
          return `Replaced in ${filePath}`;
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    };

    const collectPendingAgents = async (): Promise<string | null> => {
      if (controller.signal.aborted) return null;
      const entries = [...subAgentsRef.current.entries()];
      if (entries.length === 0) return null;
      const allSettledP = Promise.allSettled(entries.map(([, a]) => a.promise));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = await Promise.race([
        allSettledP,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 600_000);
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
      if (controller.signal.aborted) return null;
      if (done === null) {
        if (agentsStallReportedRef.current) return null;
        agentsStallReportedRef.current = true;
        const running = entries.map(([id]) => {
          const buf = subAgentBuffersRef.current.get(id);
          const progress = buf && buf.length > 0 ? `\n\n(progress so far)\n${buf.join("").slice(0, 2000)}` : "";
          return `## ${id}\n[running — call collect_agents to wait for it]${progress}`;
        });
        return `Some background agents are still running:\n\n${running.join("\n\n")}\n\nYou may call collect_agents to wait for them, or continue with other work.`;
      }
      agentsStallReportedRef.current = false;
      const lines = entries.map(([id, a], i) => {
        const r = done[i];
        const label = a.controller.signal.aborted ? `${id} (aborted)` : id;
        return r.status === "fulfilled"
          ? `## ${label}\n${r.value}`
          : `## ${label}\n[error] ${errMessage(r.reason)}`;
      });
      return `Background agents finished:\n\n${truncateText(lines.join("\n\n"), HYPERTool_RESULT_LIMIT)}`;
    };

    try {
      await runAgenticLoop(
        {
          model,
          apiKey,
          projectName: project.name,
          folder: project.folder,
          history,
          reasoningLevel,
          contextLength: ctxDetected ?? contextLengthFor(model),
        },
        runTool,
        {
          onTurnStart: () => {
            thinkingStreamed = false;
            assistantId = idRef.current++;
            appendMessage({ id: assistantId, role: "assistant", text: "", sentAt: Date.now() });
          },
          onCompress: (summary) => {
            if (selectedChatIdRef.current !== chat.id) return;
            appendMessage({
              id: idRef.current++,
              role: "assistant",
              text: summary
                ? "Context window was getting full, so I compressed the earlier part of the conversation. Continuing from the summary:"
                : "Context window was getting full, so the earlier part of the conversation was trimmed to make room.",
              sentAt: Date.now(),
            });
          },
          onText: (delta) => {
            if (selectedChatIdRef.current !== chat.id) {
              controller.abort();
              return;
            }
            if (assistantId !== null) {
              pendingText += delta;
              if (thinkingStreamed) setExpandedThinkingId(null);
              scheduleStreamFlush(assistantId);
            }
          },
          onThinking: (delta) => {
            if (assistantId !== null) {
              thinkingStreamed = true;
              pendingThinking += delta;
              if (!thinkingToggledRef.current.has(assistantId)) setExpandedThinkingId(assistantId);
              scheduleStreamFlush(assistantId);
            }
          },
          onToolStart: (call) => {
            if (thinkingStreamed) setExpandedThinkingId(null);
            pendingUndoRef.current = null;
            toolMsgId = idRef.current++;
            appendMessage({
              id: toolMsgId,
              role: "tool",
              text: "",
              sentAt: Date.now(),
              toolName: call.name,
              args: call.name === "hypertool" ? hypertoolArgSummary(call.args) : JSON.stringify(call.args),
              status: "running",
            });
          },
          onToolDone: (_call, result) => {
            const undo = pendingUndoRef.current;
            pendingUndoRef.current = null;
            if (toolMsgId !== null) updateToolMessage(toolMsgId, "done", result, undo);
          },
          onToolError: (_call, error) => {
            if (toolMsgId !== null) updateToolMessage(toolMsgId, "error", error);
          },
          onAgentsCollected: (summary) => {
            appendMessage({
              id: idRef.current++,
              role: "assistant",
              text: summary,
              sentAt: Date.now(),
            });
          },
        },
        { collectPendingAgents },
        controller.signal,
      );
    } catch (err) {
      const aborted = err instanceof Error && (err as Error).name === "AbortError";
      abortedRef = aborted;
      if (aborted) {
        removeTrailingEmptyAssistant();
      } else {
        appendMessage({
          id: idRef.current++,
          role: "assistant",
          text: `Error: ${errMessage(err)}`,
          sentAt: Date.now(),
        });
      }
    } finally {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      if (toolRafId !== null) cancelAnimationFrame(toolRafId);
      toolRafId = null;
      if (assistantId !== null) {
        if (pendingText) {
          appendMessageText(assistantId, (prev) => prev + pendingText);
          pendingText = "";
        }
        if (pendingThinking) {
          appendMessageThinking(assistantId, (prev) => (prev ?? "") + pendingThinking);
          pendingThinking = "";
        }
      }
      if (toolMsgId !== null && pendingToolStream) {
        const chunk = pendingToolStream;
        pendingToolStream = "";
        appendToolMessageResult(toolMsgId, chunk);
      }
      if (abortedRef && toolMsgId !== null) {
        setToolMessageStatus(toolMsgId, "error", "\n\n[command stopped by user]");
      }
      if (thinkingStreamed) setExpandedThinkingId(null);
      setTimerActive(false);
      setSending(false);
      sendAbortRef.current = null;
      subAgentLiveRef.current = false;
    }
  }

  async function handleManualCompact(chat: Chat, model: Model, apiKey: string) {
    const controller = new AbortController();
    sendAbortRef.current = controller;
    const noticeId = idRef.current++;
    appendMessage({ id: noticeId, role: "assistant", text: "Compacting context…", sentAt: Date.now() });
    setSending(true);
    setElapsed(0);
    setTimerActive(true);
    try {
      const res = await compactConversation({
        providerId: model.providerId,
        modelName: model.name,
        apiKey,
        messages: chat.messages.map((m) => ({
          role: m.role,
          text: m.role === "tool" ? (m.result ?? "") : m.text,
        })),
        signal: controller.signal,
      });
      if (selectedChatIdRef.current !== chat.id) return;
      if (controller.signal.aborted) {
        appendMessageText(noticeId, () => "Compaction cancelled.");
        return;
      }
      if (res.summary === null) {
        appendMessageText(
          noticeId,
          () =>
            res.reason === "too-short"
              ? "Nothing to compact — the conversation is too short."
              : "Couldn't compact the conversation — the compression request returned no summary. Try again.",
        );
        return;
      }
      const kept = chat.messages.slice(res.removedCount);
      setProjects((ps) =>
        ps.map((p) =>
          p.id === selectedProjectId
            ? {
                ...p,
                chats: p.chats.map((c) =>
                  c.id === selectedChatId
                    ? {
                        ...c,
                        messages: [
                          {
                            id: noticeId,
                            role: "assistant",
                            text: `Context compacted. Earlier messages were replaced by this summary:\n\n${res.summary}`,
                            sentAt: Date.now(),
                          },
                          ...kept,
                        ],
                      }
                    : c,
                ),
              }
            : p,
        ),
      );
    } catch (err) {
      if (selectedChatIdRef.current !== chat.id) return;
      appendMessageText(noticeId, () => `Couldn't compact the conversation: ${errMessage(err)}`);
    } finally {
      setTimerActive(false);
      setSending(false);
      sendAbortRef.current = null;
    }
  }

  async function applyUndos(undos: UndoData[]) {
    for (const u of undos) {
      try {
        if (u.existed) {
          await writeTextFile(u.path, u.content);
        } else {
          try {
            await remove(u.path);
          } catch {
            // already gone
          }
        }
      } catch (err) {
        console.error("Undo failed for", u.path, err);
      }
    }
  }

  function deleteMessage(messageId: number) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const removed = messages.slice(idx);
    const undos = removed
      .flatMap((m) =>
        m.role === "tool" && m.status === "done" && m.undo
          ? Array.isArray(m.undo)
            ? m.undo
            : [m.undo]
          : [],
      )
      .reverse();
    setProjects((ps) =>
      ps.map((p) =>
        p.id === selectedProjectId
          ? {
              ...p,
              chats: p.chats.map((c) =>
                c.id === selectedChatId
                  ? { ...c, messages: c.messages.filter((m) => m.id !== messageId && !removed.some((r) => r.id === m.id)) }
                  : c,
              ),
            }
          : p,
      ),
    );
    setContextMenu(null);
    if (undos.length > 0) {
      void applyUndos(undos);
    }
  }

  function startEdit(messageId: number, text: string) {
    setEditingMessageId(messageId);
    setEditDraft(text);
    setContextMenu(null);
  }

  async function saveEdit() {
    const newText = editDraftRef.current.trim();
    const messageId = editingMessageIdRef.current;
    if (messageId === null) return;
    setEditingMessageId(null);
    if (!newText) return;
    const projectId = selectedProjectIdRef.current;
    const chatId = selectedChatIdRef.current;
    if (projectId === null || chatId === null) return;
    const proj = projectsRef.current.find((p) => p.id === projectId);
    const chat = proj?.chats.find((c) => c.id === chatId);
    const msgs = chat?.messages ?? [];
    const idx = msgs.findIndex((m) => m.id === messageId);
    const target = idx !== -1 ? msgs[idx] : null;
    if (!target) return;
    if (target.role === "user") {
      const removed = msgs.slice(idx);
      const undos = removed
        .flatMap((m) =>
          m.role === "tool" && m.status === "done" && m.undo
            ? Array.isArray(m.undo)
              ? m.undo
              : [m.undo]
            : [],
        )
        .reverse();
      const kept = msgs.slice(0, idx);
      setProjects((ps) =>
        ps.map((p) =>
          p.id === projectId
            ? {
                ...p,
                chats: p.chats.map((c) =>
                  c.id === chatId
                    ? { ...c, messages: c.messages.filter((m) => !removed.some((r) => r.id === m.id)) }
                    : c,
                ),
              }
            : p,
        ),
      );
      setContextMenu(null);
      if (undos.length > 0) {
        void applyUndosRef.current(undos);
      }
      if (sendingRef.current) {
        sendAbortRef.current?.abort();
        await new Promise((r) => setTimeout(r, 0));
      }
      await sendMessageRef.current(newText, kept, true);
    } else {
      setProjects((ps) =>
        ps.map((p) =>
          p.id === projectId
            ? {
                ...p,
                chats: p.chats.map((c) =>
                  c.id === chatId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === messageId ? { ...m, text: newText } : m,
                        ),
                      }
                    : c,
                ),
              }
            : p,
        ),
      );
    }
  }

  const saveEditRef = useRef(saveEdit);
  saveEditRef.current = saveEdit;
  const handleEditBlur = useCallback(() => {
    void saveEditRef.current();
  }, []);
  const handleEditChange = useCallback((v: string) => setEditDraft(v), []);
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void saveEditRef.current();
      } else if (e.key === "Escape") {
        setEditingMessageId(null);
      }
    },
    [],
  );
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, id: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId: id });
  }, []);
  const toggleThinking = useCallback((id: number) => {
    thinkingToggledRef.current.add(id);
    setExpandedThinkingId((prev) => (prev === id ? null : id));
  }, []);
  const toggleTool = useCallback((id: number) => {
    setExpandedToolId((prev) => (prev === id ? null : id));
  }, []);

  function saveApiKey() {
    if (keyModalProvider && keyDraft.trim()) {
      setApiKeys((k) => ({ ...k, [keyModalProvider]: keyDraft.trim() }));
    }
    setKeyModalProvider(null);
    setKeyDraft("");
  }

  async function onSkillFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!/\.md$/i.test(file.name)) {
        e.target.value = "";
        return;
      }
      const skill = parseSkill(file.name, await file.text());
      setSkills((s) => [...s, { ...skill, id: idRef.current++ }]);
    }
    e.target.value = "";
  }

  function openSkillSource() {
    setShowSkillSource(true);
  }

  function openAddSkillForm() {
    setEditingSkillId(null);
    setEditSkillName("");
    setEditSkillDesc("");
    setEditSkillContent("");
    setShowSkillSource(false);
    setShowAddSkill(true);
  }

  function saveNewSkill() {
    if (!editSkillName.trim()) return;
    setSkills((s) => [
      ...s,
      {
        id: idRef.current++,
        name: editSkillName.trim(),
        description: editSkillDesc.trim(),
        content: editSkillContent,
      },
    ]);
    setShowAddSkill(false);
    setEditingSkillId(null);
  }

  function editSkill(s: Skill) {
    setEditingSkillId(s.id);
    setEditSkillName(s.name);
    setEditSkillDesc(s.description);
    setEditSkillContent(s.content);
  }

  function saveSkill() {
    if (editingSkillId === null || !editSkillName.trim()) return;
    setSkills((s) =>
      s.map((sk) =>
        sk.id === editingSkillId
          ? { ...sk, name: editSkillName.trim(), description: editSkillDesc.trim(), content: editSkillContent }
          : sk,
      ),
    );
    setEditingSkillId(null);
  }

  function deleteSkill(id: number) {
    setSkills((s) => s.filter((sk) => sk.id !== id));
    if (openSkillId === id) setOpenSkillId(null);
  }

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(skillSearch.toLowerCase()),
  );
  const openSkill = skills.find((s) => s.id === openSkillId) ?? null;
  const providersWithKeys = PROVIDERS.filter((p) => apiKeys[p.id]);
  const filteredModels = models.filter(
    (m) =>
      m.displayName.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      (PROVIDERS.find((p) => p.id === m.providerId)?.name ?? "").toLowerCase().includes(modelSearch.toLowerCase()),
  );

  function openAddModel() {
    setEditingModelId(null);
    setModelProviderId(providersWithKeys[0]?.id ?? "");
    setModelName("");
    setModelDisplayName("");
    setModelContextLength("");
    setShowAddModel(true);
  }

  function editModel(m: Model) {
    setEditingModelId(m.id);
    setModelProviderId(m.providerId);
    setModelName(m.name);
    setModelDisplayName(m.displayName);
    setModelContextLength(m.contextLength ? String(m.contextLength) : "");
    setShowAddModel(true);
  }

  function closeAddModel() {
    setShowAddModel(false);
    setEditingModelId(null);
    setModelProviderId("");
    setModelName("");
    setModelDisplayName("");
    setModelContextLength("");
  }

  function saveModel() {
    if (!modelProviderId || !modelName.trim() || !modelDisplayName.trim()) return;
    const parsed = modelContextLength.trim() ? parseInt(modelContextLength.trim(), 10) : undefined;
    const contextLength = parsed !== undefined && !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined;
    if (editingModelId !== null) {
      setModels((ms) =>
        ms.map((m) =>
          m.id === editingModelId
            ? { ...m, providerId: modelProviderId, name: modelName.trim(), displayName: modelDisplayName.trim(), contextLength }
            : m,
        ),
      );
    } else {
      setModels((ms) => [
        ...ms,
        { id: idRef.current++, providerId: modelProviderId, name: modelName.trim(), displayName: modelDisplayName.trim(), contextLength },
      ]);
    }
    closeAddModel();
  }

  function deleteModel(id: number) {
    setModels((ms) => ms.filter((m) => m.id !== id));
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const selectedChat = selectedProject?.chats.find((c) => c.id === selectedChatId) ?? null;
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;
  const mentionRoot = selectedProject?.folder ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!mentionRoot) {
      setMentionFiles([]);
      return;
    }
    void walkProjectFiles(mentionRoot, mentionRoot, 0, { count: 0 }, 5000).then((files) => {
      if (!cancelled) setMentionFiles(files);
    });
    return () => {
      cancelled = true;
    };
  }, [mentionRoot]);
  const messages = selectedChat?.messages ?? [];
  const chatView = messages.length > 0;
  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    const model = models.find((m) => m.id === selectedModelId) ?? null;
    if (!model) {
      setSupportsThinking(false);
      setThinkingEfforts(null);
      setThinkingLoading(false);
      setCtxDetected(null);
      return;
    }
    let cancelled = false;
    setThinkingLoading(true);
    setCtxDetected(null);
    const apiKey = apiKeys[model.providerId];
    fetchModelCapabilities(model.providerId, apiKey ?? "", model.name)
      .then((caps) => {
        if (cancelled) return;
        setThinkingEfforts(caps.efforts);
        setSupportsThinking(caps.efforts !== null);
        setCtxDetected(caps.contextLength);
        if (caps.efforts) {
          setReasoningLevel((prev) =>
            caps.efforts!.some((e) => e.value === prev)
              ? prev
              : (caps.efforts!.find((e) => e.value === "medium") ?? caps.efforts![0]).value,
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setThinkingEfforts(null);
        setSupportsThinking(false);
        setCtxDetected(null);
      })
      .finally(() => {
        if (!cancelled) setThinkingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModelId, models, apiKeys]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  return (
    <div className="app">
      {loadError && (
        <div className="load-error-banner">
          <span>Failed to load saved data:</span>
          <code>{loadError}</code>
          <button
            className="load-error-copy"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard?.writeText(loadError);
            }}
          >
            Copy error
          </button>
          <span className="load-error-dismiss" onClick={() => setLoadError(null)}>dismiss</span>
        </div>
      )}
      <aside className={`sidebar ${open ? "open" : ""}`} style={{ width: open ? width : 0 }}>
        <nav className="sidebar-nav">
          <div className="sidebar-header">
            <span className="sidebar-brand">Projects</span>
            <button className="new-project-btn" aria-label="New Project" onClick={() => setShowNewProject(true)}>
              <FolderIcon />
              <span className="tooltip" role="tooltip">New Project</span>
            </button>
          </div>
          <div className="sidebar-divider" />
          <ul className="project-list">
            {[...projects]
              .sort((a, b) => Number(b.favorite) - Number(a.favorite))
              .map((p) => (
              <li key={p.id}>
                <div className={`project-row ${selectedProjectId === p.id ? "active" : ""} ${p.favorite ? "favorite" : ""}`}>
                  <button
                    className="new-chat-btn"
                    aria-label="New Chat"
                    onClick={() => createChat(p.id)}
                  >
                    <ChatBubbleIcon />
                    <span className="tooltip" role="tooltip">New Chat</span>
                  </button>
                  <span className="project-name" onClick={() => setSelectedProjectId(p.id)}>{p.name}</span>
                  <button
                    className={`fav-btn ${p.favorite ? "active" : ""}`}
                    aria-label={p.favorite ? "Remove from favorites" : "Add to favorites"}
                    title={p.favorite ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => toggleFavorite(p.id)}
                  >
                    <StarIcon filled={p.favorite} />
                  </button>
                </div>
                {selectedProjectId === p.id && p.chats.length > 0 && (
                  <ul className="chat-list">
                    {p.chats.map((c) => (
                      <li key={c.id} className={`chat-item ${selectedChatId === c.id ? "active" : ""}`}>
                        {renamingChatId === c.id ? (
                          <input
                            className="chat-rename-input"
                            autoFocus
                            value={chatNameDraft}
                            onChange={(e) => setChatNameDraft(e.target.value)}
                            onBlur={saveRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename();
                              if (e.key === "Escape") setRenamingChatId(null);
                            }}
                          />
                        ) : (
                          <>
                            <span className="chat-name" onClick={() => openChat(p.id, c.id)}>{c.name}</span>
                            <div className="chat-actions">
                              <button
                                className="chat-action"
                                aria-label="Rename chat"
                                onClick={() => startRename(c.id, c.name)}
                              >
                                <PencilIcon />
                              </button>
                              <button
                                className="chat-action"
                                aria-label="Delete chat"
                                onClick={() => deleteChat(p.id, c.id)}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="sidebar-footer">
            <div className="sidebar-divider" />
            <button className="settings-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
              <SettingsIcon />
              <span className="tooltip up" role="tooltip">Settings</span>
            </button>
          </div>
        </nav>
      </aside>
      {open && (
        <div
          className="resize-handle"
          style={{ left: width }}
          onMouseDown={startResize}
          title="Drag to resize"
        />
      )}
      <main className="content">
        {chatView ? (
          <div className="chat-view">
            <div className="chat-messages" ref={messagesRef}>
              {messages.map((m) => {
                const showIndicator =
                  m.role === "assistant" && m.id === lastAssistantId && (sending || elapsed > 0);
                return (
                  <MessageView
                    key={m.id}
                    m={m}
                    isEditing={editingMessageId === m.id}
                    editDraft={editDraft}
                    isThinkingExpanded={expandedThinkingId === m.id}
                    isToolExpanded={expandedToolId === m.id}
                    showIndicator={showIndicator}
                    sending={showIndicator && sending}
                    elapsed={showIndicator ? elapsed : 0}
                    mentionFiles={mentionFiles}
                    onContextMenu={handleMessageContextMenu}
                    onToggleThinking={toggleThinking}
                    onToggleTool={toggleTool}
                    onEditChange={handleEditChange}
                    onEditBlur={handleEditBlur}
                    onEditKeyDown={handleEditKeyDown}
                  />
                );
              })}
            </div>
            {pendingQuestions && (
              <div className="ask-panel">
                <div className="ask-panel-header">
                  <span className="ask-panel-title">The assistant is asking you</span>
                </div>
                {pendingQuestions.map((q, qi) => (
                  <div key={q.id} className="ask-question">
                    <div className="ask-question-prompt">
                      <span className="ask-q-num">{qi + 1}</span>
                      <span>{q.prompt}</span>
                    </div>
                    {(q.type === "choice" || (q.type === "mix" && q.subtype === "choice")) && (
                      <div className="ask-options">
                        {(q.options ?? []).map((opt, oi) => (
                          <button
                            key={oi}
                            className={`ask-option-btn ${answersDraft[q.id] === opt ? "active" : ""}`}
                            onClick={() => setAnswersDraft((d) => ({ ...d, [q.id]: opt }))}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                    {(q.type === "toggle" || (q.type === "mix" && q.subtype === "toggle")) && (
                      <div className="ask-options">
                        {(q.options ?? []).map((opt, oi) => {
                          const selected = Array.isArray(answersDraft[q.id]) && (answersDraft[q.id] as string[]).includes(opt);
                          return (
                            <button
                              key={oi}
                              className={`ask-option-btn ${selected ? "active" : ""}`}
                              onClick={() =>
                                setAnswersDraft((d) => {
                                  const cur = Array.isArray(d[q.id]) ? (d[q.id] as string[]) : [];
                                  return {
                                    ...d,
                                    [q.id]: selected ? cur.filter((x) => x !== opt) : [...cur, opt],
                                  };
                                })
                              }
                            >
                              {selected ? "✓ " : ""}{opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {(q.type === "confirm" || (q.type === "mix" && q.subtype === "confirm")) && (
                      <div className="ask-options">
                        {["yes", "no"].map((opt) => (
                          <button
                            key={opt}
                            className={`ask-option-btn ${answersDraft[q.id] === opt ? "active" : ""}`}
                            onClick={() => setAnswersDraft((d) => ({ ...d, [q.id]: opt }))}
                          >
                            {opt === "yes" ? "Yes" : "No"}
                          </button>
                        ))}
                      </div>
                    )}
                    {(q.type === "input" || q.type === "mix") && (
                    <input
                      className="ask-input"
                      placeholder={q.placeholder ?? (q.type === "mix" ? "Additional notes (optional)…" : "Type your answer…")}
                      value={(answersDraft[q.type === "mix" ? `${q.id}__notes` : q.id] as string) ?? ""}
                      onChange={(e) =>
                        setAnswersDraft((d) => ({
                          ...d,
                          [q.type === "mix" ? `${q.id}__notes` : q.id]: e.target.value,
                        }))
                      }
                    />
                    )}
                  </div>
                ))}
                <div className="ask-actions">
                  <button
                    className="modal-btn primary"
                    onClick={() => {
                      const answers: Record<string, string> = {};
                      for (const q of pendingQuestions) {
                        const raw = answersDraft[q.id];
                        let val: string;
                        if (q.type === "toggle" || (q.type === "mix" && q.subtype === "toggle")) {
                          const arr = Array.isArray(raw) ? (raw as string[]) : [];
                          val = arr.length ? arr.join(", ") : "";
                        } else if (q.type === "input") {
                          val = typeof raw === "string" ? raw.trim() : "";
                        } else if (q.type === "mix") {
                          const structured =
                            q.subtype === "toggle"
                              ? (Array.isArray(raw) ? (raw as string[]).join(", ") : (typeof raw === "string" ? raw : ""))
                              : (typeof raw === "string" ? raw : "");
                          const notes = (typeof answersDraft[`${q.id}__notes`] === "string" ? (answersDraft[`${q.id}__notes`] as string) : "").trim();
                          val = notes ? `${structured}\nNotes: ${notes}` : structured;
                        } else {
                          val = typeof raw === "string" ? raw.trim() : "";
                        }
                        answers[q.id] = val;
                      }
                      if (askResolverRef.current) askResolverRef.current(JSON.stringify(answers));
                      askResolverRef.current = null;
                      askRejectorRef.current = null;
                      setPendingQuestions(null);
                      setAnswersDraft({});
                    }}
                  >
                    Submit answers
                  </button>
                </div>
              </div>
            )}
            {selectedChat && selectedChat.todos.length > 0 && (
              <div className="todo-panel">
                <div className="todo-panel-header">
                  <span className="todo-panel-title">ToDo</span>
                  <span className="todo-panel-count">
                    {selectedChat.todos.filter((t) => t.done).length}/{selectedChat.todos.length} done
                  </span>
                </div>
                <ul className="todo-list">
                  {selectedChat.todos.map((t) => (
                    <li key={t.id} className={`todo-item ${t.done ? "done" : ""}`}>
                      <span className="todo-check">{t.done ? "✓" : ""}</span>
                      <span className="todo-task">{t.task}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="chat-input-row">
              <PromptBox
                value={value}
                placeholder={text}
                caret={caret}
                models={models}
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
                modelWarning={modelWarning}
                reasoningLevel={reasoningLevel}
                onReasoningLevelChange={setReasoningLevel}
                thinkingEfforts={thinkingEfforts}
                supportsThinking={supportsThinking}
                thinkingLoading={thinkingLoading}
                sending={sending}
                ctxUsed={ctxUsed}
                ctxMax={selectedModel ? (ctxDetected ?? contextLengthFor(selectedModel)) : DEFAULT_CONTEXT_WINDOW}
                mentionFiles={mentionFiles}
                skills={skills}
                onChange={setValue}
                onSend={sendMessage}
                onStop={() => sendAbortRef.current?.abort()}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="top-region">
              <div>
                <h1 className="title">
                  Faso <span className="title-code">Code</span>
                </h1>
                {selectedChat && selectedProject && (
                  <p className="subtitle">
                    {selectedChat.name} - {selectedProject.name}
                  </p>
                )}
              </div>
            </div>
            <PromptBox
              value={value}
              placeholder={text}
              caret={caret}
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
              modelWarning={modelWarning}
              reasoningLevel={reasoningLevel}
              onReasoningLevelChange={setReasoningLevel}
              thinkingEfforts={thinkingEfforts}
              supportsThinking={supportsThinking}
              thinkingLoading={thinkingLoading}
              sending={sending}
              ctxUsed={ctxUsed}
              ctxMax={selectedModel ? (ctxDetected ?? contextLengthFor(selectedModel)) : DEFAULT_CONTEXT_WINDOW}
              mentionFiles={mentionFiles}
              skills={skills}
              onChange={setValue}
              onSend={sendMessage}
              onStop={() => sendAbortRef.current?.abort()}
            />
            <div className="bottom-region" />
          </>
        )}
      </main>
      <button
        className={`toggle ${open ? "open" : ""}`}
        style={open ? { left: width + 10 } : undefined}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close sidebar" : "Open sidebar"}
        title={open ? "Close sidebar" : "Open sidebar"}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 170),
            top: Math.min(contextMenu.y, window.innerHeight - 130),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="context-item"
            onClick={() => {
              const m = messages.find((msg) => msg.id === contextMenu.messageId);
              if (m) {
                const text = m.role === "tool" ? m.result || m.args || "" : m.text;
                navigator.clipboard?.writeText(text);
              }
              setContextMenu(null);
            }}
          >
            Copy
          </button>
          <button className="context-item" onClick={() => deleteMessage(contextMenu.messageId)}>Delete</button>
          {messages.find((msg) => msg.id === contextMenu.messageId)?.role !== "tool" && (
            <button
              className="context-item"
              onClick={() => {
                const m = messages.find((msg) => msg.id === contextMenu.messageId);
                if (m) startEdit(m.id, m.text);
              }}
            >
              Edit
            </button>
          )}
        </div>
      )}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div
            className="settings-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="settings-close" aria-label="Close settings" onClick={() => setShowSettings(false)}>
              <CloseIcon />
            </button>
            <div className="settings">
              <aside className="settings-sidebar">
                {SETTINGS_SECTIONS.map((s) => (
                  <button
                    key={s}
                    className={`settings-section-btn ${settingsSection === s ? "active" : ""}`}
                    onClick={() => setSettingsSection(s)}
                  >
                    {s}
                  </button>
                ))}
              </aside>
              <div className="settings-content">
                {settingsSection === "Providers" ? (
                  <>
                    <h2 className="settings-section-title">Providers</h2>
                    <div className="provider-list">
                      {PROVIDERS.map((p) => (
                        <div key={p.id} className="provider-row">
                          <span className="provider-name">{p.name}</span>
                          <button
                            className={`key-btn ${apiKeys[p.id] ? "set" : ""}`}
                            aria-label="API Key"
                            onClick={() => setKeyModalProvider(p.id)}
                          >
                            <KeyIcon />
                            <span className="tooltip" role="tooltip">API Key</span>
                          </button>
                        </div>
                      ))}
                    </div>
                    <h3 className="settings-section-subtitle">Search Engines</h3>
                    <div className="provider-list">
                      {SEARCH_ENGINES.map((s) => (
                        <div key={s.id} className="provider-row">
                          <span className="provider-name">{s.name}</span>
                          <button
                            className={`key-btn ${apiKeys[s.id] ? "set" : ""}`}
                            aria-label="API Key"
                            onClick={() => setKeyModalProvider(s.id)}
                          >
                            <KeyIcon />
                            <span className="tooltip" role="tooltip">{s.keyLabel}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : settingsSection === "Skills" ? (
                  <>
                    <div className="skills-header">
                      <h2 className="settings-section-title">Skills</h2>
                    </div>
                    <input
                      className="skill-search"
                      type="text"
                      placeholder="Search skills..."
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                    />
                    <div className="skill-add-row">
                      <button
                        className="add-skill-btn"
                        aria-label="Add Skill"
                        onClick={openSkillSource}
                      >
                        <PlusIcon />
                        <span className="tooltip" role="tooltip">Add Skill</span>
                      </button>
                    </div>
                    <div className="skill-list">
                      {filteredSkills.map((s) => (
                        <div key={s.id} className="skill-row">
                          <div className="skill-info">
                            <span className="skill-name">{s.name}</span>
                            <span className="skill-desc">{s.description || "No description"}</span>
                          </div>
                          <button
                            className="skill-open-btn"
                            aria-label="Read skill"
                            onClick={() => setOpenSkillId(s.id)}
                          >
                            <EyeIcon />
                            <span className="tooltip" role="tooltip">Read</span>
                          </button>
                          <div className="model-actions">
                            <button className="chat-action" aria-label="Edit skill" onClick={() => editSkill(s)}>
                              <PencilIcon />
                            </button>
                            <button className="chat-action" aria-label="Delete skill" onClick={() => deleteSkill(s.id)}>
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                      {filteredSkills.length === 0 && (
                        <div className="skill-empty">No skills found</div>
                      )}
                    </div>
                    <input
                      ref={skillFileRef}
                      type="file"
                      accept=".md"
                      hidden
                      onChange={onSkillFile}                    />
                  </>
                ) : settingsSection === "Models" ? (
                  <>
                    <div className="skills-header">
                      <h2 className="settings-section-title">Models</h2>
                    </div>
                    <input
                      className="skill-search"
                      type="text"
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                    />
                    <div className="skill-add-row">
                      <button
                        className="add-skill-btn"
                        aria-label="Add Model"
                        onClick={openAddModel}
                      >
                        <PlusIcon />
                        <span className="tooltip" role="tooltip">Add Model</span>
                      </button>
                    </div>
                    <div className="skill-list">
                      {filteredModels.map((m) => (
                        <div key={m.id} className="skill-row">
                          <div className="skill-info">
                            <span className="skill-name">{m.displayName}</span>
                            <span className="skill-desc">
                              {m.name} · {PROVIDERS.find((p) => p.id === m.providerId)?.name}
                            </span>
                          </div>
                          <div className="model-actions">
                            <button className="chat-action" aria-label="Edit model" onClick={() => editModel(m)}>
                              <PencilIcon />
                            </button>
                            <button className="chat-action" aria-label="Delete model" onClick={() => deleteModel(m.id)}>
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                      {filteredModels.length === 0 && (
                        <div className="skill-empty">No models found</div>
                      )}
                    </div>
                  </>
                ) : (
                  <h2 className="settings-section-title">{settingsSection}</h2>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showSkillSource && (
        <div className="modal-overlay" onClick={() => setShowSkillSource(false)}>
          <div
            className="modal-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="Add skill - choose source"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal">
              <h2 className="modal-title">Add Skill</h2>
              <p className="modal-hint">How do you want to add the skill?</p>
              <div className="modal-actions column">
                <button
                  className="modal-btn primary wide"
                  onClick={() => {
                    setShowSkillSource(false);
                    skillFileRef.current?.click();
                  }}
                >
                  Import a .md file
                </button>
                <button className="modal-btn wide" onClick={openAddSkillForm}>
                  Enter content manually
                </button>
                <button className="modal-btn wide" onClick={() => setShowSkillSource(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAddSkill && (
        <div className="modal-overlay" onClick={() => setShowAddSkill(false)}>
          <div
            className="modal-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="Add skill"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal">
              <h2 className="modal-title">Add Skill</h2>
              <input
                className="modal-input"
                placeholder="Name..."
                autoFocus
                value={editSkillName}
                onChange={(e) => setEditSkillName(e.target.value)}
              />
              <input
                className="modal-input"
                placeholder="Description..."
                value={editSkillDesc}
                onChange={(e) => setEditSkillDesc(e.target.value)}
              />
              <textarea
                className="modal-textarea"
                rows={8}
                placeholder="Markdown content..."
                value={editSkillContent}
                onChange={(e) => setEditSkillContent(e.target.value)}
              />
              <div className="modal-actions">
                <button className="modal-btn" onClick={() => setShowAddSkill(false)}>Cancel</button>
                <button className="modal-btn primary" onClick={saveNewSkill} disabled={!editSkillName.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editingSkillId !== null && (
        <div className="modal-overlay" onClick={() => setEditingSkillId(null)}>
          <div
            className="modal-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="Edit skill"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal">
              <h2 className="modal-title">Edit Skill</h2>
              <input
                className="modal-input"
                placeholder="Name..."
                autoFocus
                value={editSkillName}
                onChange={(e) => setEditSkillName(e.target.value)}
              />
              <input
                className="modal-input"
                placeholder="Description..."
                value={editSkillDesc}
                onChange={(e) => setEditSkillDesc(e.target.value)}
              />
              <textarea
                className="modal-textarea"
                rows={8}
                value={editSkillContent}
                onChange={(e) => setEditSkillContent(e.target.value)}
              />
              <div className="modal-actions">
                <button className="modal-btn" onClick={() => setEditingSkillId(null)}>Cancel</button>
                <button className="modal-btn primary" onClick={saveSkill} disabled={!editSkillName.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAddModel && (
        <div className="modal-overlay" onClick={closeAddModel}>
          <div
            className="modal-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="Add model"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal">
              <h2 className="modal-title">{editingModelId !== null ? "Edit Model" : "Add Model"}</h2>
              <select
                className="modal-input model-select"
                value={modelProviderId}
                onChange={(e) => setModelProviderId(e.target.value)}
              >
                <option value="" disabled>
                  {providersWithKeys.length > 0 ? "Select provider..." : "No providers with API keys"}
                </option>
                {providersWithKeys.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                className="modal-input"
                placeholder="Model name (API id)..."
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveModel();
                  if (e.key === "Escape") closeAddModel();
                }}
              />
              <input
                className="modal-input"
                placeholder="Display name..."
                value={modelDisplayName}
                onChange={(e) => setModelDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveModel();
                  if (e.key === "Escape") closeAddModel();
                }}
              />
              <input
                className="modal-input"
                type="number"
                min={1000}
                placeholder={`Context window in tokens (optional, default ${fmtTokens(DEFAULT_CONTEXT_BY_PROVIDER[modelProviderId] ?? DEFAULT_CONTEXT_WINDOW)})`}
                value={modelContextLength}
                onChange={(e) => setModelContextLength(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveModel();
                  if (e.key === "Escape") closeAddModel();
                }}
              />
              <div className="modal-actions">
                <button className="modal-btn" onClick={closeAddModel}>Cancel</button>
                <button
                  className="modal-btn primary"
                  onClick={saveModel}
                  disabled={!modelProviderId || !modelName.trim() || !modelDisplayName.trim()}
                >
                  {editingModelId !== null ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {openSkill && (
        <div className="modal-overlay" onClick={() => setOpenSkillId(null)}>
          <div
            className="skill-view-wrap"
            role="dialog"
            aria-modal="true"
            aria-label={openSkill.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="settings-close" aria-label="Close skill" onClick={() => setOpenSkillId(null)}>
              <CloseIcon />
            </button>
            <div className="skill-view">
              <h2 className="settings-section-title">{openSkill.name}</h2>
              <div className="skill-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{openSkill.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
      {keyModalProvider && (
        <div className="modal-overlay" onClick={() => setKeyModalProvider(null)}>
          <div
            className="modal-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="API key"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal">
              <h2 className="modal-title">
                API Key -{" "}
                {PROVIDERS.find((p) => p.id === keyModalProvider)?.name ??
                  SEARCH_ENGINES.find((s) => s.id === keyModalProvider)?.name ??
                  keyModalProvider}
              </h2>
              <input
                className="modal-input"
                type="password"
                placeholder="Paste your API key..."
                autoFocus
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveApiKey();
                  if (e.key === "Escape") setKeyModalProvider(null);
                }}
              />
              <div className="modal-actions">
                <button className="modal-btn" onClick={() => setKeyModalProvider(null)}>Cancel</button>
                <button className="modal-btn primary" onClick={saveApiKey} disabled={!keyDraft.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showNewProject && (
        <div className="modal-overlay" onClick={closeNewProject}>
          <div
            className="modal-wrap"
            role="dialog"
            aria-modal="true"
            aria-label="New project"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal">
              <h2 className="modal-title">New Project</h2>
              <input
                className="modal-input"
                placeholder="Project name..."
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createProject();
                  if (e.key === "Escape") closeNewProject();
                }}
              />
              <button
                className="modal-btn folder-pick"
                onClick={onFolderPick}
              >
                <FolderIcon />
                <span className="folder-pick-name">
                  {projectFolder ? projectFolder : "Select folder..."}
                </span>
              </button>
              {projectFolder && (
                <label className="trust-row">
                  <input
                    type="checkbox"
                    className="trust-check"
                    checked={trustChecked}
                    onChange={(e) => setTrustChecked(e.target.checked)}
                  />
                  <span>I trust the authors of the files in this folder</span>
                </label>
              )}
              <div className="modal-actions">
                <button className="modal-btn" onClick={closeNewProject}>Cancel</button>
                <button
                  className="modal-btn primary"
                  onClick={createProject}
                  disabled={!projectName.trim() || !projectFolder || !trustChecked}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
