import { create } from "zustand";
import { toast } from "sonner";
import { ApiError } from "./api";

export type LogLevel = "info" | "success" | "error";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  detail?: unknown;
  timestamp: number;
}

interface LogStore {
  entries: LogEntry[];
  unread: number;
  add: (level: LogLevel, message: string, detail?: unknown) => void;
  clear: () => void;
  markRead: () => void;
}

const MAX_ENTRIES = 200;
let counter = 0;

/**
 * A small in-memory log of what the app has done and, critically, why any
 * failure happened -- surfaced in the GUI via LogsPanel so a toast that
 * says "Save failed" doesn't leave the user guessing (issue #6).
 */
export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  unread: 0,
  add: (level, message, detail) => {
    counter += 1;
    const entry: LogEntry = { id: `l${counter}`, level, message, detail, timestamp: Date.now() };
    set((s) => ({
      entries: [entry, ...s.entries].slice(0, MAX_ENTRIES),
      unread: level === "error" ? s.unread + 1 : s.unread,
    }));
  },
  clear: () => set({ entries: [], unread: 0 }),
  markRead: () => set({ unread: 0 }),
}));

/** Normalize any caught error into a JSON-friendly shape for the log panel. */
export function errorDetail(err: unknown): unknown {
  if (err instanceof ApiError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof Error) {
    const withCode = err as Error & { code?: string };
    return withCode.code ? { code: withCode.code, message: err.message } : { message: err.message };
  }
  return err;
}

/** Show the usual toast AND record the full error detail for the Logs panel. */
export function notifyError(message: string, err?: unknown) {
  toast.error(message);
  useLogStore.getState().add("error", message, err !== undefined ? errorDetail(err) : undefined);
}

export function notifySuccess(message: string, detail?: unknown) {
  toast.success(message);
  useLogStore.getState().add("success", message, detail);
}
