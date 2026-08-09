import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface AppConfig {
  folder: string | null;
}

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

export class ConfigStore {
  private file: string;

  constructor(private configDir: string) {
    this.file = join(configDir, "config.json");
  }

  read(): AppConfig {
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8"));
      if (raw && typeof raw.folder === "string") return { folder: raw.folder };
    } catch {
      /* missing or corrupt -> defaults */
    }
    return { folder: null };
  }

  write(config: AppConfig): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(config, null, 2));
  }

  /** Validates and persists a canvas folder path. Throws {status, code, message}. */
  setFolder(input: string): AppConfig {
    const folder = resolve(expandHome(input.trim()));
    if (!existsSync(folder)) {
      throw { status: 404, code: "FolderNotFound", message: `Folder does not exist: ${folder}` };
    }
    if (!statSync(folder).isDirectory()) {
      throw { status: 400, code: "NotADirectory", message: `Not a directory: ${folder}` };
    }
    const config = { folder };
    this.write(config);
    return config;
  }

  /** Returns the configured folder or throws a 409. */
  requireFolder(): string {
    const { folder } = this.read();
    if (!folder) {
      throw {
        status: 409,
        code: "NoFolderConfigured",
        message: "No canvas folder configured. PUT /api/config with { folder } first.",
      };
    }
    return folder;
  }
}
