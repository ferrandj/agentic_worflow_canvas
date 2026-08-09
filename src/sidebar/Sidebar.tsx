import { useState } from "react";
import type { CanvasListing } from "../lib/api";
import { useCanvasStore } from "../state/store";

const FOLDED_KEY = "afc:sidebarFolded";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Sidebar({
  folder,
  canvases,
  loadingFolder,
  onSetFolder,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: {
  folder: string | null;
  canvases: CanvasListing[];
  loadingFolder: boolean;
  onSetFolder: (path: string) => Promise<boolean>;
  onOpen: (name: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (name: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const activeName = useCanvasStore((s) => s.canvasName);
  const [folded, setFolded] = useState(() => localStorage.getItem(FOLDED_KEY) === "1");
  const [folderInput, setFolderInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const toggleFolded = () => {
    setFolded((f) => {
      localStorage.setItem(FOLDED_KEY, f ? "0" : "1");
      return !f;
    });
  };

  if (folded) {
    return (
      <button
        data-testid="sidebar-unfold"
        onClick={toggleFolded}
        title="Show canvases"
        className="absolute left-4 top-4 z-20 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm shadow-lg shadow-slate-900/5 backdrop-blur-xl transition-transform hover:scale-105 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200"
      >
        ☰
      </button>
    );
  }

  return (
    <div
      data-testid="sidebar"
      className="z-10 flex h-full w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Agent Flow Canvas
        </span>
        <button
          data-testid="sidebar-fold"
          onClick={toggleFolded}
          title="Hide sidebar"
          className="rounded-lg px-1.5 py-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          ‹
        </button>
      </div>

      <div className="border-y border-slate-200/80 px-4 py-3 dark:border-slate-800">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Canvas folder
        </div>
        {folder ? (
          <div className="mb-2 truncate rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={folder}>
            {folder}
          </div>
        ) : loadingFolder ? (
          <div className="mb-2 text-xs text-slate-400">Loading…</div>
        ) : (
          <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Pick a folder to store your canvases.
          </div>
        )}
        <div className="flex gap-1.5">
          <input
            data-testid="folder-input"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="~/canvases"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && folderInput.trim()) {
                if (await onSetFolder(folderInput.trim())) setFolderInput("");
              }
            }}
          />
          <button
            data-testid="folder-set"
            onClick={async () => {
              if (folderInput.trim() && (await onSetFolder(folderInput.trim()))) setFolderInput("");
            }}
            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Set
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {canvases.map((canvas) => (
          <div
            key={canvas.name}
            data-testid={`canvas-item-${canvas.name}`}
            className={`group mb-0.5 flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 transition-colors ${
              canvas.name === activeName
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
            onClick={() => canvas.name !== activeName && onOpen(canvas.name)}
          >
            {renaming === canvas.name ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    onRename(canvas.name, renameValue.trim());
                    setRenaming(null);
                  }
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={() => setRenaming(null)}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-900 dark:border-slate-600"
              />
            ) : (
              <>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{canvas.name}</div>
                  <div className="text-[10px] opacity-60">{relativeTime(canvas.updatedAt)}</div>
                </div>
                <div className="hidden shrink-0 gap-0.5 group-hover:flex">
                  <button
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenaming(canvas.name);
                      setRenameValue(canvas.name);
                    }}
                    className="rounded px-1 text-[11px] opacity-70 hover:opacity-100"
                  >
                    ✎
                  </button>
                  <button
                    title="Delete"
                    data-testid={`canvas-delete-${canvas.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete canvas "${canvas.name}"?`)) onDelete(canvas.name);
                    }}
                    className="rounded px-1 text-[11px] opacity-70 hover:opacity-100"
                  >
                    🗑
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {folder && canvases.length === 0 && (
          <div className="px-2.5 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            No canvases yet.
          </div>
        )}
      </div>

      {folder && (
        <div className="border-t border-slate-200/80 p-2.5 dark:border-slate-800">
          {creating ? (
            <input
              autoFocus
              data-testid="new-canvas-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="canvas name"
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newName.trim()) {
                  if (await onCreate(newName.trim())) {
                    setCreating(false);
                    setNewName("");
                  }
                }
                if (e.key === "Escape") setCreating(false);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          ) : (
            <button
              data-testid="new-canvas"
              onClick={() => setCreating(true)}
              className="w-full rounded-xl border border-dashed border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-200"
            >
              + New canvas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
