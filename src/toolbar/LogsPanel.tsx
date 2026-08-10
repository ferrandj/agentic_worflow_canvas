import { useEffect } from "react";
import { toast } from "sonner";
import { useLogStore, type LogEntry } from "../lib/logger";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const LEVEL_DOT: Record<LogEntry["level"], string> = {
  error: "bg-rose-500",
  success: "bg-emerald-500",
  info: "bg-slate-400",
};

function EntryRow({ entry }: { entry: LogEntry }) {
  return (
    <div
      data-testid="log-entry"
      data-log-level={entry.level}
      className="border-b border-slate-100 px-3 py-2.5 last:border-0 dark:border-slate-800"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[entry.level]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
              {entry.message}
            </span>
            <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
              {relativeTime(entry.timestamp)}
            </span>
          </div>
          {entry.detail !== undefined && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                details
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-100 p-2 text-[10px] leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {JSON.stringify(entry.detail, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export function LogsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const markRead = useLogStore((s) => s.markRead);

  useEffect(() => {
    if (open) markRead();
  }, [open, markRead]);

  if (!open) return null;

  const copyAll = () => {
    const text = entries
      .map((e) => {
        const time = new Date(e.timestamp).toISOString();
        const detail = e.detail !== undefined ? ` ${JSON.stringify(e.detail)}` : "";
        return `[${time}] ${e.level.toUpperCase()} ${e.message}${detail}`;
      })
      .join("\n");
    navigator.clipboard.writeText(text || "(no log entries)");
    toast.success("Logs copied to clipboard");
  };

  return (
    <div
      data-testid="logs-panel"
      className="absolute right-4 top-20 z-20 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/90 dark:shadow-black/20"
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 px-3.5 py-2.5 dark:border-slate-700/80">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Logs
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={copyAll}
            disabled={entries.length === 0}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Copy
          </button>
          <button
            data-testid="logs-clear"
            onClick={clear}
            disabled={entries.length === 0}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-1.5 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-3.5 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Nothing logged yet.
          </div>
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
