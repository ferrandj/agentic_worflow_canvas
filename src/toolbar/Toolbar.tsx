import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import type { NodeType } from "@shared/model/types";
import { useCanvasStore } from "../state/store";
import { api, ApiError } from "../lib/api";
import { TYPE_STYLES } from "../canvas/nodes/typeStyles";
import type { Theme } from "../lib/theme";
import { Modal } from "./Modal";

const ADDABLE: NodeType[] = ["person", "agent", "code", "platform"];

export function Toolbar({
  theme,
  toggleTheme,
  onImported,
}: {
  theme: Theme;
  toggleTheme: () => void;
  onImported: (name: string) => void;
}) {
  const canvasName = useCanvasStore((s) => s.canvasName);
  const saveState = useCanvasStore((s) => s.saveState);
  const addNode = useCanvasStore((s) => s.addNode);
  const doc = useCanvasStore((s) => s.doc);
  const { screenToFlowPosition } = useReactFlow();

  const [exportText, setExportText] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");

  const addAtCenter = (type: NodeType) => {
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2 + (Math.random() * 60 - 30),
      y: window.innerHeight / 2 + (Math.random() * 60 - 30),
    });
    addNode(type, pos.x, pos.y);
  };

  const doExport = async () => {
    if (!canvasName) return;
    try {
      setExportText(await api.exportMermaid(canvasName));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed");
    }
  };

  const doDownloadJson = () => {
    if (!doc || !canvasName) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${canvasName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    try {
      await api.importMermaid(importName.trim(), importText);
      toast.success(`Imported "${importName.trim()}"`);
      setImportOpen(false);
      setImportText("");
      onImported(importName.trim());
      setImportName("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    }
  };

  const saveDot =
    saveState === "clean"
      ? "bg-emerald-500"
      : saveState === "error"
        ? "bg-rose-500"
        : "bg-amber-400 animate-pulse";

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/80 px-2.5 py-2 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-black/20">
          {ADDABLE.map((type) => (
            <button
              key={type}
              data-testid={`add-${type}`}
              onClick={() => addAtCenter(type)}
              disabled={!doc}
              title={`Add ${TYPE_STYLES[type].label}`}
              className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 ${TYPE_STYLES[type].card}`}
            >
              <span className="mr-1">{TYPE_STYLES[type].icon}</span>
              {TYPE_STYLES[type].label}
            </button>
          ))}

          <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

          <button
            onClick={() => setImportOpen(true)}
            className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Import Mermaid
          </button>
          <button
            data-testid="export-mermaid"
            onClick={doExport}
            disabled={!canvasName}
            className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Export Mermaid
          </button>
          <button
            onClick={doDownloadJson}
            disabled={!doc}
            className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            JSON
          </button>

          <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            title="Toggle theme"
            className="rounded-xl px-2.5 py-1.5 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <div
            className="flex items-center gap-1.5 pl-1 pr-2 text-[11px] font-medium text-slate-500 dark:text-slate-400"
            title={saveState}
            data-testid="save-state"
            data-save-state={saveState}
          >
            <span className={`h-2 w-2 rounded-full ${saveDot}`} />
            {saveState === "clean" ? "Saved" : saveState === "error" ? "Save failed" : "Saving…"}
          </div>
        </div>
      </div>

      <Modal open={exportText !== null} onClose={() => setExportText(null)} title="Mermaid export">
        <pre
          data-testid="mermaid-output"
          className="max-h-96 overflow-auto rounded-xl bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        >
          {exportText}
        </pre>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(exportText ?? "");
              toast.success("Copied to clipboard");
            }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Copy
          </button>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Mermaid">
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          New canvas name
        </label>
        <input
          value={importName}
          onChange={(e) => setImportName(e.target.value)}
          placeholder="my-canvas"
          className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Mermaid source (flowchart)
        </label>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          placeholder={"flowchart LR\n  Product_Owner([\"Product Owner\"]) --> Orchestrator[\"Orchestrator\"]"}
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={doImport}
            disabled={!importName.trim() || !importText.trim()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Import
          </button>
        </div>
      </Modal>
    </>
  );
}
