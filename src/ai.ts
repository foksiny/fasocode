import { fetch } from "@tauri-apps/plugin-http";
import type { Model } from "./App";

export type HistoryMessage = { role: "user" | "assistant"; text: string };

export type ReasoningLevel = string;

export type ThinkingEffort = { value: string; label: string };

const GENERIC_EFFORTS: ThinkingEffort[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const PROVIDER_EFFORTS: Record<string, ThinkingEffort[]> = {
  openai: GENERIC_EFFORTS,
  openrouter: GENERIC_EFFORTS,
  "opencode-zen": GENERIC_EFFORTS,
  google: GENERIC_EFFORTS,
  "nvidia-nim": [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
};

export function effortsFor(providerId: string, modelName: string): ThinkingEffort[] {
  if (providerId === "nvidia-nim" && /deepseek/i.test(modelName)) {
    return [
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
      { value: "max", label: "Max" },
    ];
  }
  return PROVIDER_EFFORTS[providerId] ?? GENERIC_EFFORTS;
}

export function isReasoningModel(model: Pick<Model, "name" | "providerId">): boolean {
  if (model.providerId === "nvidia-nim") {
    return /(^|\/)(r1|reasoner|qwq|gpt-oss|grok)|reasoning|thinking|qwen3|kimi-k2|deepseek|nemotron-3|glm-4\.5|glm-5/i.test(
      model.name,
    );
  }
  return /(^|\/)(o1|o3|o4|o5|gpt-5|gpt-oss|r1|qwq|grok-4|grok-3)|reasoner|reasoning|thinking|qwen3|gemini-2\.5|gemini-3|glm-4\.5/i.test(
    model.name,
  );
}

const KNOWN_CONTEXTS: { pattern: RegExp; contextLength: number }[] = [
  { pattern: /gpt-5-nano|gpt-5-mini|gpt-5/i, contextLength: 272000 },
  { pattern: /gpt-oss/i, contextLength: 400000 },
  { pattern: /gpt-4\.1/i, contextLength: 1048576 },
  { pattern: /gpt-4o|gpt-4\.5/i, contextLength: 128000 },
  { pattern: /o1-mini/i, contextLength: 128000 },
  { pattern: /(^|\/)o1\b|(^|\/)o3|(^|\/)o4/i, contextLength: 200000 },
  { pattern: /gpt-4/i, contextLength: 32768 },
  { pattern: /gemini-3/i, contextLength: 1048576 },
  { pattern: /gemini/i, contextLength: 1048576 },
  { pattern: /claude-4-5/i, contextLength: 1048576 },
  { pattern: /claude-4|claude-3/i, contextLength: 200000 },
  { pattern: /claude-2/i, contextLength: 100000 },
  { pattern: /llama-4/i, contextLength: 1048576 },
  { pattern: /llama-3/i, contextLength: 131072 },
  { pattern: /deepseek/i, contextLength: 128000 },
  { pattern: /qwen3/i, contextLength: 262144 },
  { pattern: /qwen2\.5/i, contextLength: 131072 },
  { pattern: /qwen2/i, contextLength: 32768 },
  { pattern: /glm-4|glm-5/i, contextLength: 128000 },
  { pattern: /grok/i, contextLength: 131072 },
  { pattern: /mistral-large/i, contextLength: 131072 },
  { pattern: /mistral-medium/i, contextLength: 32768 },
  { pattern: /mistral-small/i, contextLength: 32768 },
  { pattern: /mixtral/i, contextLength: 65536 },
  { pattern: /kimi/i, contextLength: 128000 },
  { pattern: /nemotron/i, contextLength: 131072 },
  { pattern: /command-r\+|command-a/i, contextLength: 131072 },
];

export function contextLengthFromName(modelName: string): number | null {
  for (const entry of KNOWN_CONTEXTS) {
    if (entry.pattern.test(modelName)) return entry.contextLength;
  }
  return null;
}

// The hosted NIM API (integrate.api.nvidia.com/v1/models) exposes only {id, object, created, owned_by},
// so exact context windows must come from the build.nvidia.com model cards. Values below are from
// NVIDIA's official model cards / docs and verified deployment reports.
const NIM_CATALOG: Record<string, number> = {
  "deepseek-ai/deepseek-v4-pro": 1000000,
  "deepseek-ai/deepseek-v3.2": 131072,
  "deepseek-ai/deepseek-v3.1": 131072,
  "deepseek-ai/deepseek-r1": 131072,
  "deepseek-ai/deepseek-r1-distill-qwen-14b": 131072,
  "z-ai/glm-5.2": 202752,
  "z-ai/glm-5.1": 202752,
  "z-ai/glm-4.7": 131072,
  "z-ai/glm-4.5": 131072,
  "nvidia/nemotron-3-ultra-550b-a55b": 262144,
  "nvidia/nemotron-3-250b-a55b": 262144,
  "nvidia/llama-3.3-nemotron-super-49b-v1": 131072,
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": 131072,
  "nvidia/llama-3.1-nemotron-nano-9b-v1": 131072,
  "meta/llama-3.3-70b-instruct": 131072,
  "meta/llama-3.1-405b-instruct": 131072,
  "meta/llama-3.1-70b-instruct": 131072,
  "meta/llama-3.1-8b-instruct": 131072,
  "meta/llama-4-scout-17b-16e-instruct": 1048576,
  "meta/llama-4-maverick-17b-128e-instruct": 1048576,
  "qwen/qwen3-coder-480b-a35b-instruct": 262144,
  "qwen/qwen3-235b-a22b-instruct": 262144,
  "qwen/qwen2.5-coder-32b-instruct": 131072,
  "qwen/qwq-32b": 131072,
  "google/gemma-3-27b-it": 131072,
  "google/gemma-3-12b-it": 131072,
  "microsoft/phi-4-mini-instruct": 131072,
  "mistralai/mistral-small-3.1-24b-instruct-2503": 131072,
  "moonshotai/kimi-k2": 131072,
  "openai/gpt-oss-120b": 400000,
  "openai/gpt-oss-20b": 400000,
};

export function nimCatalogContext(modelName: string): number | null {
  const tail = modelName.split("/").pop() ?? "";
  for (const [id, len] of Object.entries(NIM_CATALOG)) {
    if (id === modelName || id.split("/").pop() === tail) return len;
  }
  return null;
}

export type ModelCapabilities = {
  efforts: ThinkingEffort[] | null;
  contextLength: number | null;
};

let openRouterModelsCache: Promise<unknown[] | null> | null = null;

function fetchOpenRouterModels(apiKey: string): Promise<unknown[] | null> {
  if (!openRouterModelsCache) {
    openRouterModelsCache = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data?.data) ? data.data : null;
      } catch {
        return null;
      }
    })();
  }
  return openRouterModelsCache;
}

type OpenRouterModelMeta = {
  id?: string;
  supported_parameters?: string[];
  context_length?: number;
};

function effortsForModel(providerId: string, modelName: string): ThinkingEffort[] | null {
  return isReasoningModel({ providerId, name: modelName }) ? effortsFor(providerId, modelName) : null;
}

export async function fetchModelCapabilities(
  providerId: string,
  apiKey: string,
  modelName: string,
): Promise<ModelCapabilities> {
  if (providerId === "openrouter") {
    const list = await fetchOpenRouterModels(apiKey);
    const model = (list ?? []).find((m) => (m as OpenRouterModelMeta)?.id === modelName) as
      | OpenRouterModelMeta
      | undefined;
    let efforts: ThinkingEffort[] | null;
    if (model && Array.isArray(model.supported_parameters) && model.supported_parameters.includes("reasoning")) {
      efforts = effortsFor(providerId, modelName);
    } else if (model) {
      efforts = null;
    } else {
      efforts = effortsForModel(providerId, modelName);
    }
    const contextLength =
      typeof model?.context_length === "number" && model.context_length > 0
        ? model.context_length
        : contextLengthFromName(modelName);
    return { efforts, contextLength };
  }

  let contextLength: number | null = null;
  if (providerId === "google") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const models: { id?: string; inputTokenLimit?: number }[] = Array.isArray(data?.models)
          ? data.models.map((m: { id?: string }) => ({ ...m, id: m.id?.replace(/^models\//, "") }))
          : [];
        const match =
          models.find((m) => m.id === modelName) ??
          models.find((m) => typeof m.id === "string" && m.id.startsWith(`${modelName}-`)) ??
          models.find(
            (m) => typeof m.id === "string" && m.id.length > 4 && modelName.startsWith(m.id),
          );
        if (match && typeof match.inputTokenLimit === "number" && match.inputTokenLimit > 0) {
          contextLength = match.inputTokenLimit;
        }
      }
    } catch {
      // metadata unavailable; fall back below
    }
  } else if (providerId === "nvidia-nim") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const list: Record<string, unknown>[] = Array.isArray(data?.data) ? data.data : [];
        const model = list.find((m) => m.id === modelName);
        if (model) {
          const raw =
            model.max_model_len ??
            model.max_context_length ??
            model.context_length ??
            model.context_window ??
            model.max_tokens;
          if (typeof raw === "number" && raw > 0) contextLength = raw;
        }
      }
    } catch {
      // metadata unavailable; fall back below
    }
  }
  if (contextLength === null) contextLength = nimCatalogContext(modelName) ?? contextLengthFromName(modelName);
  return { efforts: effortsFor(providerId, modelName), contextLength };
}

export async function fetchThinkingEfforts(
  providerId: string,
  apiKey: string,
  modelName: string,
): Promise<ThinkingEffort[] | null> {
  return (await fetchModelCapabilities(providerId, apiKey, modelName)).efforts;
}

function reasoningLevelFor(model: Model, level: ReasoningLevel | undefined): ReasoningLevel | undefined {
  if (!level || !isReasoningModel(model)) return undefined;
  return level;
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type AgentCallbacks = {
  onTurnStart: () => void;
  onText: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolStart: (call: ToolCall) => void;
  onToolDone: (call: ToolCall, result: string) => void;
  onToolError: (call: ToolCall, error: string) => void;
  onCompress?: (summary: string | null) => void;
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "read",
      description:
        "Read the content of a file, or list the contents of a directory (if the path is a folder). The path is relative to the project folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the project folder" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write",
      description:
        "Write content to a file, creating it if it does not exist. The path is relative to the project folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the project folder" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace",
      description:
        "Replace an exact substring in a file with new text. The path is relative to the project folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the project folder" },
          old_text: { type: "string", description: "Exact text to find" },
          new_text: { type: "string", description: "Replacement text" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_lines",
      description:
        "Read a range of lines (1-indexed, inclusive) from a file. The path is relative to the project folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the project folder" },
          start_line: { type: "integer", description: "First line to read (1-indexed)" },
          end_line: { type: "integer", description: "Last line to read (inclusive)" },
        },
        required: ["path", "start_line", "end_line"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command in the project folder. Use it to install dependencies, run tests, or execute the project. The command is run through /bin/sh.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to run" },
          timeout: { type: "integer", description: "Timeout in seconds (default 30, max 600)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "use_skill",
      description:
        "Load a saved skill from the app's skills library. Skills are reusable markdown documents (workflows, guidelines, templates). If nothing matches, the library listing (name + description) is returned so you can pick one.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name, or a term to match against skill names and descriptions" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_skill",
      description:
        "Create or update a skill in the app's skills library. Use it when the user asks you to save reusable knowledge, a workflow, coding standards, or guidelines. The skill is persisted and available in future sessions.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short unique skill name" },
          description: { type: "string", description: "One-line description of when to use this skill" },
          content: { type: "string", description: "Full markdown content of the skill" },
        },
        required: ["name", "description", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todo",
      description:
        "Maintain a visible ToDo list for the current chat. Actions: create/update (replace the entire list with tasks: [{task, status?}]), complete (mark a task done by exact text), delete (remove a task by text), list (show the current list). Status values: pending, in_progress, done (or completed). Use it to track multi-step work.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "complete", "delete", "list"],
            description: "Action to perform. create/update replace the entire list.",
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task: { type: "string", description: "Task text" },
                status: { type: "string", description: "pending, in_progress, done, or completed" },
              },
              required: ["task"],
            },
            description: "Full list of tasks for create/update actions",
          },
          task: { type: "string", description: "Task text for complete/delete actions" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description:
        "Search file contents in the project folder for a text query (case-insensitive substring match). Optionally restrict to a subfolder or to files whose name contains a pattern. Returns up to 200 matches as path:line: text.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for" },
          path: { type: "string", description: "Optional subfolder relative to the project folder" },
          file_pattern: {
            type: "string",
            description: "Optional substring that matched file names must contain (e.g. '.py' or 'test')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "Recursively list files in the project folder (or a subfolder). Returns relative paths, directories with a trailing slash. Optionally filter by file extension(s). Use it to discover the project structure in one call.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Optional subfolder relative to the project folder" },
          extensions: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of extensions to keep, e.g. ['py', 'js']",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch a web page and return its text content (HTML is stripped). Use it to read documentation, references, or package pages online. Prefer official docs and avoid unnecessary fetches.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full http(s) URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user one or more clarifying questions and wait for their answers. Use this whenever you need information, a decision, or confirmation from the user before proceeding. " +
        "Each question has one of 5 types: 'choice' (pick exactly one from options), 'toggle' (turn any subset of options on/off), 'confirm' (yes/no), " +
        "'input' (free-text answer), 'mix' (another non-input type for a structured choice PLUS an input-only field at the end for notes). " +
        "You can ask multiple questions in a single call, and call the tool multiple times. " +
        "The tool returns a JSON object mapping each question id to its answer (string). The loop pauses until the user answers — you will receive the answers as the tool result.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable identifier for this question; the answer is returned under this key" },
                prompt: { type: "string", description: "The question text shown to the user" },
                type: { type: "string", enum: ["choice", "toggle", "confirm", "input", "mix"], description: "Question type" },
                subtype: { type: "string", enum: ["choice", "toggle", "confirm"], description: "Required and used only when type is 'mix': the underlying structured type that gets an input field appended at the end" },
                options: { type: "array", items: { type: "string" }, description: "Required for choice/toggle and for mix with subtype choice/toggle. The selectable options." },
                placeholder: { type: "string", description: "Optional placeholder text for the input field (input/mix)" },
              },
              required: ["id", "prompt", "type"],
            },
          },
        },
        required: ["questions"],
      },
    },
  },
];

type OpenAIMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
};

type TurnResult = {
  toolCalls: ToolCall[];
  assistantMessage: OpenAIMessage;
  thinking: string;
};

export const DEFAULT_CONTEXT_WINDOW = 128000;
const COMPRESS_THRESHOLD = 0.8;
const COMPRESS_KEEP_MESSAGES = 8;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateContextTokens(projectName: string, folder: string | null, history: HistoryMessage[]): number {
  let total = estimateTokens(systemPromptFor(projectName, folder)) + estimateTokens(JSON.stringify(TOOLS));
  for (const m of history) total += estimateTokens(m.text);
  return total;
}

function endpointFor(providerId: string, modelName: string): string {
  switch (providerId) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "nvidia-nim":
      return "https://integrate.api.nvidia.com/v1/chat/completions";
    case "opencode-zen":
      return "https://opencode.ai/zen/v1/chat/completions";
    case "google":
      return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent`;
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

function systemPromptFor(projectName: string, folder: string | null): string {
  const folderLine = folder
    ? `The project folder path is: ${folder}`
    : "The project has no folder selected.";
  return [
    "You are Faso Code, an autonomous AI coding agent running inside a desktop app (fasocode).",
    `You are working on the project "${projectName}". ${folderLine}`,
    "",
    "## Your tools",
    "- read(path): read a whole file, or list a directory's contents when path is a folder. Paths are relative to the project folder.",
    "- read_lines(path, start_line, end_line): read a 1-indexed, inclusive line range from a file.",
    "- write(path, content): overwrite a file with full content, creating it if missing. Paths are relative to the project folder.",
    "- replace(path, old_text, new_text): replace one exact substring in a file. Use the smallest unique old_text that identifies the spot.",
    "- run_command(command, timeout?): run a shell command with `sh -c` inside the project folder. Default timeout 30s, max 600s. Returns exit code plus stdout/stderr, truncated to 20k chars. Use it to install dependencies, run tests, run syntax checks, or otherwise verify your work.",
    "- use_skill(name): load a reusable markdown skill from the app's skills library (workflows, guidelines, templates). If no skill matches, the library listing is returned so you can pick one.",
    "- create_skill(name, description, content): create or update a skill in the app's skills library. Use it when the user asks you to save reusable knowledge, workflows, or coding standards — the skill persists across sessions.",
    "- todo(action, tasks?, task?): maintain a visible ToDo list in the chat. create/update replaces the whole list with tasks (status: pending, in_progress, done); complete or delete tasks by exact text; list shows the current list.",
    "- search(query, path?, file_pattern?): search file contents in the project folder (case-insensitive substring; returns path:line matches). Use it before reading files to find exactly where things live.",
    "- list_files(path?, extensions?): recursively list project files in one call (directories end with /). Use it to discover the project structure instead of guessing paths.",
    "- fetch_url(url): fetch a web page's text content. Use it for documentation or reference lookups; prefer official docs and avoid unnecessary fetches.",
    "- ask_user(questions): ask the user one or more structured questions and wait for their answers. Each question has a type: choice (pick one of options), toggle (turn any subset of options on), confirm (yes/no), input (free text), or mix (a structured choice with an extra input field at the end for notes). Use this any time you need clarification, a decision, or confirmation — never guess when the user could decide in one click. Batch related questions into a single call when possible.",
    "Tool results are appended to the conversation automatically and displayed in the UI, so do not repeat them back verbatim in your replies.",
    "",
    "## Slash commands",
    "The user may prefix a message with a slash command that changes how you should behave:",
    "- /grill-me <task>: before doing anything else, aggressively interrogate the user with 10 or more sharp, specific, one-question-at-a-time clarifying questions to fully lock in what they want; use ask_user heavily to gather the answers, then proceed.",
    "- /plan <task>: produce a fully detailed, deeply structured plan for the task FIRST, present it to the user, and only then execute it; do not start executing before the plan is approved.",
    "- /explain <topic>: explain the topic clearly and thoroughly, in plain language, with concrete references to the project where relevant.",
    "- /review [focus]: review the recent work in the project carefully (bugs, edge cases, style, risks), suggest concrete fixes, and do not modify files.",
    "- /tests [target]: generate tests for the target/ recent work and run them; report results and fix failures when reasonable.",
    "",
    "## ToDo lists",
    "For any multi-step task, maintain a ToDo list with the todo tool: create it when you start executing, update statuses as you progress, and mark tasks done as they complete. The list is displayed to the user, so it should stay accurate and reflect reality — do not mark work done before it is actually done.",
    "",
    "## Skills library",
    "The app has a skills library of reusable markdown documents, each with a name and a one-line description. Before starting a task, consider whether a saved skill applies (coding standards, project workflows, templates); if so, load it with use_skill and follow it. If you don't know what's available, call use_skill with any term and the library listing is returned. When the user asks you to remember something for future work, save it with create_skill — give it a short name, a clear description of when to use it, and well-structured markdown content.",
    "",
    "## How turns work",
    "Your turns are driven by tool calls: as long as you call tools, you keep working autonomously; the moment you reply with plain text and no tool calls, your turn ends and the user sees your reply. Use this: to hand control back (to present a plan, ask a question, or conclude), write the text and stop calling tools.",
    "",
    "## The Economical Agent doctrine",
    "Your defining trait is leverage: produce the maximum useful outcome per tool call. You are judged by how much changed relative to what you spent doing it. A brilliant one-call solution beats a mediocre twenty-call one.",
    "1. Prime directive: every tool call is a cost. Spend it like your own money. Before calling any tool, ask: is this the cheapest action that moves me meaningfully closer to done? If not, don't call it. This is not an excuse to do less work — it means eliminating wasted motion: redundant lookups, exploratory calls with no hypothesis, verification of things that don't need verifying, and re-deriving what you already know.",
    "2. Decision gate (run before every tool call; stop at the first NO):",
    "   - Necessity: can I derive this from context or memory? If yes, skip the call.",
    "   - Uniqueness: have I already made an equivalent call this session? Reuse that result.",
    "   - Granularity: could one broader call cover several small ones? Batch them.",
    "   - Timing: am I calling this now because I need it now, or just in case? Defer speculative calls.",
    "   - Payoff: will the result change what I do next? If not, the call is decorative — skip it.",
    "3. Plan before motion: form an explicit minimum plan before your first tool call on any non-trivial task; identify up front which unknowns actually block progress versus which are merely interesting; default to the most information-dense single action (a whole-directory read instead of file-by-file calls) before falling back to iterative narrowing; solve deterministically wherever possible instead of using a tool call to confirm what you already know. Never treat 'gather more context' as a default first move.",
    "4. Batch and parallelize: combine independent lookups into the fewest possible calls; write full files in one write instead of sequences of incremental edits; a single composite payload beats several small writes to the same target.",
    "5. Eliminate redundancy: treat what you've already learned as ground truth until something concretely invalidates it; never re-read a file or re-run a search you already have the answer from unless the underlying state could plausibly have changed since; do not verify a successful write with a read-back — the tool result already confirmed it.",
    "6. Definition of done: the user's actual goal — not merely the literal request — is satisfied; the output is produced in a form the user can immediately use; no open thread remains that you have both the ability and the mandate to close. Once this bar is met: stop. Do not keep working to 'be thorough'; padding a finished task with extra confirmatory calls is the same failure mode as under-researching, it just fails quieter.",
    "7. Spend calls generously ONLY on: irreversible or destructive actions (verify before committing, every time), genuine ambiguity that changes the deliverable (one targeted check or clarifying question is cheaper than doing the wrong thing well), high-stakes correctness (security, financial, safety-critical code), and volatile or time-sensitive facts.",
    "8. Anti-patterns (never do these): searching or reading 'to be safe' when you already have a confident, groundable answer; re-reading the same file without new cause; splitting a batchable operation into a loop of single-item calls; performing a broad exploratory sweep before forming a hypothesis; verifying your own successful action with a second read-back; continuing to act after the definition of done has been met; asking the user for information that one tool call could resolve; making a tool call as a substitute for thinking.",
    "",
    "## Plans are reviewed by the user",
    "- For any task beyond a single obvious edit: do NOT start executing immediately. First reply with a big, highly detailed plan in Markdown — the exact files to create or modify, the content outline, the commands to run, and the verification steps — then STOP (no tool calls) so the user can review it.",
    "- The user may ask for modifications; revise the plan and stop again until they accept it. Only after explicit approval do you start executing.",
    "- For trivial tasks (one clear edit, no ambiguity), skip the plan and execute directly.",
    "",
    "## Clean, organized work",
    "- Write clean code: clear and consistent naming, small focused functions, no dead or commented-out code, no leftovers, no copy-paste of existing logic — reuse and extend instead.",
    "- Keep the project organized: put files where they belong, follow the project's existing structure and conventions, and remove temporary artifacts you created (scratch files, debug prints) before finishing.",
    "- Match the project's existing style (language, formatting, naming) rather than imposing your own.",
    "",
    "## Stay on the objective",
    "- Never drift: do exactly what the objective requires. Do not explore tangential ideas, do not gold-plate, do not silently expand scope, and do not keep working after the goal is met. If the objective is ambiguous, clarify before executing — stopping to ask is legitimate.",
    "",
    "## Testing is part of the job",
    "- Whenever you write or modify code and it can be tested autonomously, ALWAYS test it: install dependencies and run the project's test or syntax-check commands with run_command, then iterate on failures until green or until you have exhausted reasonable attempts.",
    "- Prefer non-interactive checks (python -m py_compile, node --check, pytest, npm test, cargo check, etc.). If the only way to verify is an interactive or long-running program, skip it and say why, or run it with a short timeout; never leave a running process behind.",
    "- Use failed-test output to fix the code, then re-run. Report final verification results (what ran, exit codes) in your closing summary.",
    "",
    "## Tone",
    "Work decisively and quietly. Never narrate your reasoning or your economizing ('I'll avoid an extra call here by...') — just operate this way by default. The user should experience you as someone who gets to the right answer fast. Write concise, useful replies.",
  ].join("\n");
}

async function streamSSE(body: ReadableStream<Uint8Array> | null, onEvent: (data: string) => void) {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) onEvent(data);
        }
      }
    }
  }
}

function tryParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

class ThinkSplitter {
  private pending = "";

  push(delta: string, emit: (kind: "text" | "think", s: string) => void) {
    this.pending += delta;
    for (;;) {
      const openIdx = this.pending.indexOf("<think>");
      const closeIdx = this.pending.indexOf("</think>");
      if (closeIdx !== -1 && (openIdx === -1 || openIdx > closeIdx)) {
        emit("text", this.pending.slice(0, closeIdx + 8));
        this.pending = this.pending.slice(closeIdx + 8);
        continue;
      }
      if (openIdx === -1) {
        emit("text", this.pending);
        this.pending = "";
        return;
      }
      if (closeIdx !== -1) {
        emit("text", this.pending.slice(0, openIdx));
        emit("think", this.pending.slice(openIdx + 7, closeIdx));
        this.pending = this.pending.slice(closeIdx + 8);
        continue;
      }
      emit("text", this.pending.slice(0, openIdx));
      this.pending = this.pending.slice(openIdx);
      return;
    }
  }

  flush(emit: (kind: "text" | "think", s: string) => void) {
    if (!this.pending) return;
    if (this.pending.startsWith("<think>")) {
      emit("think", this.pending.slice(7));
    } else {
      emit("text", this.pending);
    }
    this.pending = "";
  }
}

function splitThink(content: string): { text: string; thinking: string } {
  let text = "";
  let thinking = "";
  const splitter = new ThinkSplitter();
  const emit = (kind: "text" | "think", s: string) => {
    if (kind === "think") thinking += s;
    else text += s;
  };
  splitter.push(content, emit);
  splitter.flush(emit);
  return { text, thinking };
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || String(err);
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function toGeminiContents(historyMsgs: OpenAIMessage[]) {
  const out: Record<string, unknown>[] = [];
  for (const m of historyMsgs) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      out.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name ?? "", response: tryParseJson(m.content ?? "", { text: m.content }) } }],
      });
    } else if (m.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls ?? []) {
        parts.push({ functionCall: { name: tc.function.name, args: tryParseJson(tc.function.arguments, {}) } });
      }
      out.push({ role: "model", parts });
    } else {
      out.push({ role: m.role, parts: [{ text: m.content }] });
    }
  }
  return out;
}

async function requestTurnOpenAI(
  url: string,
  apiKey: string,
  modelName: string,
  messages: OpenAIMessage[],
  systemPrompt: string,
  reasoningLevel: ReasoningLevel | undefined,
  isNim: boolean,
  onText: (delta: string) => void,
  onThinking: (delta: string) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      stream: true,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools: TOOLS,
      tool_choice: "auto",
      ...(reasoningLevel ? { reasoning_effort: reasoningLevel } : {}),
      ...(isNim && reasoningLevel ? { chat_template_kwargs: { thinking: true } } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  if (!res.body) {
    const data = await res.json();
    const msg = data?.choices?.[0]?.message ?? {};
    const split = splitThink(String(msg?.content ?? ""));
    const text = split.text;
    let thinking = split.thinking;
    if (typeof msg?.reasoning_content === "string") thinking += msg.reasoning_content;
    if (typeof msg?.reasoning === "string") thinking += msg.reasoning;
    if (thinking) onThinking(thinking);
    const rawCalls = data?.choices?.[0]?.message?.tool_calls ?? [];
    const toolCalls: ToolCall[] = rawCalls.map((tc: Record<string, unknown>) => ({
      id: String(tc.id ?? ""),
      name: String((tc.function as Record<string, unknown>)?.name ?? ""),
      args: tryParseJson(String((tc.function as Record<string, unknown>)?.arguments ?? "{}"), {}),
    }));
    if (text) onText(text);
    return {
      toolCalls,
      thinking,
      assistantMessage: {
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            }))
          : undefined,
      },
    };
  }

  let text = "";
  let thinking = "";
  const acc = new Map<
    number,
    { id: string; name: string; args: string }
  >();
  const splitter = new ThinkSplitter();
  const emitContent = (kind: "text" | "think", s: string) => {
    if (kind === "think") {
      thinking += s;
      onThinking(s);
    } else {
      text += s;
      onText(s);
    }
  };
  await streamSSE(res.body, (data) => {
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data);
      const choice = json?.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        splitter.push(delta.content, emitContent);
      }
      if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
        thinking += delta.reasoning_content;
        onThinking(delta.reasoning_content);
      }
      if (typeof delta?.reasoning === "string" && delta.reasoning) {
        thinking += delta.reasoning;
        onThinking(delta.reasoning);
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls as Record<string, unknown>[]) {
          const index = Number(tc.index ?? 0);
          const entry = acc.get(index) ?? { id: "", name: "", args: "" };
          if (tc.id) entry.id = String(tc.id);
          if ((tc.function as Record<string, unknown>)?.name) {
            entry.name += String((tc.function as Record<string, unknown>).name);
          }
          if ((tc.function as Record<string, unknown>)?.arguments) {
            entry.args += String((tc.function as Record<string, unknown>).arguments);
          }
          acc.set(index, entry);
        }
      }
    } catch {
      // ignore malformed events
    }
  });
  splitter.flush(emitContent);

  const toolCalls: ToolCall[] = [...acc.values()]
    .filter((e) => e.name)
    .map((e) => ({ id: e.id, name: e.name, args: tryParseJson(e.args, {}) }));

  return {
    toolCalls,
    thinking,
    assistantMessage: {
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls.length
        ? toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          }))
        : undefined,
    },
  };
}

function geminiThinkingBudget(level: ReasoningLevel): number {
  switch (level) {
    case "low":
      return 1024;
    case "high":
      return 32768;
    default:
      return 16384;
  }
}
async function requestTurnGemini(
  url: string,
  apiKey: string,
  messages: OpenAIMessage[],
  systemPrompt: string,
  reasoningLevel: ReasoningLevel | undefined,
  onText: (delta: string) => void,
  onThinking: (delta: string) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const functionDeclarations = TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
  const res = await fetch(`${url}?alt=sse&key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: toGeminiContents(messages),
      tools: [{ functionDeclarations }],
      ...(reasoningLevel
        ? {
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: geminiThinkingBudget(reasoningLevel),
                includeThoughts: true,
              },
            },
          }
        : {}),
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  if (!res.body) {
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    let text = "";
    let thinking = "";
    const functionCalls: ToolCall[] = [];
    for (const part of parts as Record<string, unknown>[]) {
      if (typeof part.text === "string") {
        if (part.thought === true) {
          thinking += part.text;
        } else {
          text += part.text;
        }
      }
      if (part.functionCall) {
        const fc = part.functionCall as Record<string, unknown>;
        functionCalls.push({
          id: `gemini-${functionCalls.length}`,
          name: String(fc.name ?? ""),
          args: (fc.args as Record<string, unknown>) ?? {},
        });
      }
    }
    if (thinking) onThinking(thinking);
    if (text) onText(text);
    return {
      toolCalls: functionCalls,
      thinking,
      assistantMessage: {
        role: "assistant",
        content: text || null,
        tool_calls: functionCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      },
    };
  }

  let text = "";
  let thinking = "";
  const functionCalls: ToolCall[] = [];
  await streamSSE(res.body, (data) => {
    try {
      const json = JSON.parse(data);
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts as Record<string, unknown>[]) {
        if (typeof part.text === "string") {
          if (part.thought === true) {
            thinking += part.text;
            onThinking(part.text);
          } else {
            text += part.text;
            onText(part.text);
          }
        }
        if (part.functionCall) {
          const fc = part.functionCall as Record<string, unknown>;
          functionCalls.push({
            id: `gemini-${functionCalls.length}`,
            name: String(fc.name ?? ""),
            args: (fc.args as Record<string, unknown>) ?? {},
          });
        }
      }
    } catch {
      // ignore malformed events
    }
  });

  return {
    toolCalls: functionCalls,
    thinking,
    assistantMessage: {
      role: "assistant",
      content: text || null,
      tool_calls: functionCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    },
  };
}

export async function runAgenticLoop(
  params: {
    model: Model;
    apiKey: string;
    projectName: string;
    folder: string | null;
    history: HistoryMessage[];
    reasoningLevel?: ReasoningLevel;
    contextLength?: number;
  },
  runTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  cbs: AgentCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { model, apiKey, projectName, folder, history } = params;
  const contextLength = params.contextLength ?? DEFAULT_CONTEXT_WINDOW;
  const systemPrompt = systemPromptFor(projectName, folder);
  const isGemini = model.providerId === "google";
  const url = endpointFor(model.providerId, model.name);
  const reasoningLevel = reasoningLevelFor(model, params.reasoningLevel);
  const isNim = model.providerId === "nvidia-nim";
  const historyMsgs: OpenAIMessage[] = history.map((m) => ({ role: m.role, content: m.text }));

  function payloadTokens(): number {
    let total = estimateTokens(systemPrompt) + estimateTokens(JSON.stringify(TOOLS));
    for (const m of historyMsgs) {
      total += estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""));
    }
    return total;
  }

  async function compressContext(): Promise<string> {
    const summaryPrompt = [
      "You are a conversation compression engine. Compress the conversation below into a concise but complete summary that preserves:",
      "- the user's objective and all requirements, preferences and constraints stated so far",
      "- every important fact, decision and conclusion reached",
      "- all tool results that matter (file paths, content snippets, command outputs, errors)",
      "- any outstanding work, open questions and next steps",
      "Keep file paths, code and error messages verbatim where possible. Output ONLY the summary, no preamble.",
      "Target length: around 800-1500 tokens.",
    ].join("\n");
    let summary = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const turn = isGemini
        ? await requestTurnGemini(url, apiKey, historyMsgs, summaryPrompt, undefined, (d) => { summary += d; }, () => {}, controller.signal)
        : await requestTurnOpenAI(url, apiKey, model.name, historyMsgs, summaryPrompt, undefined, isNim, (d) => { summary += d; }, () => {}, controller.signal);
      clearTimeout(timeout);
      if (typeof turn.assistantMessage.content === "string" && turn.assistantMessage.content.trim()) {
        summary = turn.assistantMessage.content.trim();
      }
    } catch {
      summary = "";
    }
    if (summary) {
      const kept = historyMsgs.slice(-COMPRESS_KEEP_MESSAGES);
      historyMsgs.splice(0, historyMsgs.length);
      historyMsgs.push({
        role: "user",
        content: "Earlier in this conversation (compressed into a summary):\n\n" + summary,
      });
      historyMsgs.push(...kept);
    } else {
      historyMsgs.splice(0, Math.max(0, historyMsgs.length - COMPRESS_KEEP_MESSAGES));
    }
    return summary;
  }

  for (;;) {
    if (historyMsgs.length > COMPRESS_KEEP_MESSAGES && payloadTokens() > contextLength * COMPRESS_THRESHOLD) {
      const summary = await compressContext();
      cbs.onCompress?.(summary);
    }
    cbs.onTurnStart();
    const turn = isGemini
      ? await requestTurnGemini(url, apiKey, historyMsgs, systemPrompt, reasoningLevel, cbs.onText, cbs.onThinking ?? (() => {}), signal)
      : await requestTurnOpenAI(url, apiKey, model.name, historyMsgs, systemPrompt, reasoningLevel, isNim, cbs.onText, cbs.onThinking ?? (() => {}), signal);

    historyMsgs.push(turn.assistantMessage);
    if (!turn.toolCalls.length) return;

    for (const call of turn.toolCalls) {
      cbs.onToolStart(call);
      let result: string;
      try {
        result = await runTool(call.name, call.args);
        cbs.onToolDone(call, result);
      } catch (err) {
        result = `Error: ${errMessage(err)}`;
        cbs.onToolError(call, result);
      }
      historyMsgs.push({ role: "tool", tool_call_id: call.id, name: call.name, content: result });
    }
  }
}
