import {
  promises as fs,
  realpathSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { CanvasDocSchema, type CanvasDoc } from "../shared/model/types.js";
import { validateDoc } from "../shared/model/grouping.js";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

export interface CanvasListing {
  name: string;
  updatedAt: string;
}

export class StorageError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function validateName(name: string): void {
  if (!NAME_RE.test(name) || name.includes("..")) {
    throw new StorageError(
      400,
      "InvalidName",
      "Canvas names must match ^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$ and not contain '..'"
    );
  }
}

/** Resolve a canvas file path, defending against path traversal. */
export function canvasPath(folder: string, name: string): string {
  validateName(name);
  const root = realpathSync(folder);
  const resolved = resolve(root, `${name}.json`);
  if (!resolved.startsWith(root + sep)) {
    throw new StorageError(400, "InvalidName", "Canvas name escapes the canvas folder");
  }
  return resolved;
}

// Per-canvas promise queue so concurrent writes to one file serialize.
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  writeQueues.set(key, next.catch(() => {}));
  return next;
}

export async function listCanvases(folder: string): Promise<CanvasListing[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(folder);
  } catch {
    throw new StorageError(404, "FolderNotFound", `Cannot read folder: ${folder}`);
  }
  const out: CanvasListing[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.startsWith(".")) continue;
    const name = entry.slice(0, -".json".length);
    if (!NAME_RE.test(name)) continue;
    try {
      const stat = await fs.stat(join(folder, entry));
      out.push({ name, updatedAt: stat.mtime.toISOString() });
    } catch {
      /* raced deletion — skip */
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function readCanvas(folder: string, name: string): Promise<CanvasDoc> {
  const file = canvasPath(folder, name);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new StorageError(404, "CanvasNotFound", `Canvas "${name}" not found`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorageError(422, "CorruptCanvas", `Canvas "${name}" is not valid JSON`);
  }
  const result = CanvasDocSchema.safeParse(parsed);
  if (!result.success) {
    throw new StorageError(422, "InvalidCanvas", `Canvas "${name}" fails schema validation`, {
      issues: result.error.issues.slice(0, 5),
    });
  }
  return result.data;
}

/**
 * Validate + write a canvas atomically (tmp file + rename). Bumps updatedAt.
 * Returns the doc as written.
 */
export async function writeCanvas(
  folder: string,
  name: string,
  doc: unknown
): Promise<CanvasDoc> {
  const file = canvasPath(folder, name);

  const result = CanvasDocSchema.safeParse(doc);
  if (!result.success) {
    throw new StorageError(422, "InvalidCanvas", "Canvas fails schema validation", {
      issues: result.error.issues.slice(0, 5),
    });
  }
  const issues = validateDoc(result.data);
  if (issues.length > 0) {
    throw new StorageError(422, "InvariantViolation", issues[0].message, { issues });
  }

  const stamped: CanvasDoc = {
    ...result.data,
    meta: { ...result.data.meta, updatedAt: new Date().toISOString() },
  };

  return enqueue(file, async () => {
    const tmp = join(folder, `.${name}.json.tmp-${randomBytes(4).toString("hex")}`);
    await fs.writeFile(tmp, JSON.stringify(stamped, null, 2));
    await fs.rename(tmp, file);
    return stamped;
  });
}

export async function canvasExists(folder: string, name: string): Promise<boolean> {
  try {
    await fs.access(canvasPath(folder, name));
    return true;
  } catch {
    return false;
  }
}

export async function deleteCanvas(folder: string, name: string): Promise<void> {
  const file = canvasPath(folder, name);
  try {
    await fs.unlink(file);
  } catch {
    throw new StorageError(404, "CanvasNotFound", `Canvas "${name}" not found`);
  }
}

export async function renameCanvas(
  folder: string,
  name: string,
  newName: string
): Promise<void> {
  const from = canvasPath(folder, name);
  const to = canvasPath(folder, newName);
  if (!(await canvasExists(folder, name))) {
    throw new StorageError(404, "CanvasNotFound", `Canvas "${name}" not found`);
  }
  if (await canvasExists(folder, newName)) {
    throw new StorageError(409, "CanvasExists", `Canvas "${newName}" already exists`);
  }
  await fs.rename(from, to);
}
