import { BaseDirectory, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Model, Project, Skill } from "./App";
import type { ReasoningLevel } from "./ai";

const FILE = "state.json";
const LEGACY_FILE = ".fasocode/state.json";

export type PersistedState = {
  apiKeys: Record<string, string>;
  models: Model[];
  skills: Skill[];
  projects: Project[];
  selectedModelId: number | null;
  selectedProjectId: number | null;
  selectedChatId: number | null;
  reasoningLevel: ReasoningLevel;
};

export type LoadResult = {
  state: PersistedState | null;
  error: string | null;
  missing: boolean;
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMissing(message: string): boolean {
  return /os error 2|ENOENT|not found|no such file|inexistente|does not exist/i.test(message);
}

export async function loadState(): Promise<LoadResult> {
  try {
    const raw = await readTextFile(FILE, { baseDir: BaseDirectory.AppConfig });
    const parsed = JSON.parse(raw) as PersistedState;
    console.log("[store] loaded state from", FILE, "(app config dir)");
    return { state: parsed, error: null, missing: false };
  } catch (err) {
    const message = messageOf(err);
    try {
      const legacyRaw = await readTextFile(LEGACY_FILE, { baseDir: BaseDirectory.Home });
      const parsed = JSON.parse(legacyRaw) as PersistedState;
      console.log("[store] migrated state from legacy location", LEGACY_FILE, "- primary read failed:", message);
      await saveState(parsed);
      return { state: parsed, error: null, missing: false };
    } catch (legacyErr) {
      const msg = messageOf(legacyErr);
      const missing = isMissing(message) && isMissing(msg);
      console.error(`[store] failed to load state (both locations missing: ${missing}):`, message, "|", msg);
      return { state: null, error: message, missing };
    }
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  return new Promise((resolve) => {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const s = pendingState;
      pendingState = null;
      if (!s) {
        resolve();
        return;
      }
      writeState(s).then(resolve, resolve);
    }, 600);
  });
}

export function flushState(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const s = pendingState;
  pendingState = null;
  if (s) void writeState(s);
}

let pendingState: PersistedState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function writeState(state: PersistedState): Promise<void> {
  try {
    await mkdir(".", { baseDir: BaseDirectory.AppConfig, recursive: true });
    await writeTextFile(FILE, JSON.stringify(state), { baseDir: BaseDirectory.AppConfig });
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}
