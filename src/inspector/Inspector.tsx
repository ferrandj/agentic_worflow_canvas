import { useMemo, useState } from "react";
import type { NodeType } from "@shared/model/types";
import { isContainerType } from "@shared/model/types";
import { isInPlatformScope } from "@shared/model/grouping";
import { childrenOf } from "@shared/model/geometry";
import { useCanvasStore } from "../state/store";
import { TYPE_STYLES } from "../canvas/nodes/typeStyles";
import { LogoImg } from "../canvas/nodes/LogoImg";
import { LogoPicker } from "./LogoPicker";

const LEAF_TYPES: NodeType[] = ["person", "agent", "code"];

export function Inspector() {
  const doc = useCanvasStore((s) => s.doc);
  const selection = useCanvasStore((s) => s.selection);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const updateEdgeLabel = useCanvasStore((s) => s.updateEdgeLabel);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const deleteEdges = useCanvasStore((s) => s.deleteEdges);
  const removeNodeFromGroup = useCanvasStore((s) => s.removeNodeFromGroup);
  const degroupContainer = useCanvasStore((s) => s.degroupContainer);

  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  const node = useMemo(() => {
    if (!doc || selection.size !== 1) return null;
    const id = [...selection][0];
    return doc.nodes.find((n) => n.id === id) ?? null;
  }, [doc, selection]);

  const edge = useMemo(() => {
    if (!doc || !selectedEdgeId || node) return null;
    return doc.edges.find((e) => e.id === selectedEdgeId) ?? null;
  }, [doc, selectedEdgeId, node]);

  if (!doc || (!node && !edge)) return null;

  return (
    <div
      data-testid="inspector"
      className="absolute right-4 top-20 z-20 w-64 rounded-2xl border border-slate-200/80 bg-white/85 p-3.5 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/85 dark:shadow-black/20"
    >
      {node && (
        <>
          <div className="mb-2.5 flex items-center justify-between">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TYPE_STYLES[node.type].chip}`}
            >
              {TYPE_STYLES[node.type].icon} {TYPE_STYLES[node.type].label}
            </span>
          </div>

          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Label
          </label>
          <input
            data-testid="inspector-label"
            value={node.label}
            onChange={(e) => updateNode(node.id, { label: e.target.value })}
            className="mb-2.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />

          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Note
          </label>
          <textarea
            value={node.note}
            onChange={(e) => updateNode(node.id, { note: e.target.value })}
            rows={2}
            className="mb-2.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />

          {LEAF_TYPES.includes(node.type) && (
            <>
              <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Type
              </label>
              <select
                value={node.type}
                onChange={(e) => updateNode(node.id, { type: e.target.value as NodeType })}
                className="mb-2.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {LEAF_TYPES.map((t) => {
                  const personBlocked =
                    t === "person" && node.parent !== null && isInPlatformScope(doc, node.parent);
                  return (
                    <option key={t} value={t} disabled={personBlocked}>
                      {TYPE_STYLES[t].label}
                      {personBlocked ? " (not allowed in platform)" : ""}
                    </option>
                  );
                })}
              </select>
            </>
          )}

          {node.type === "platform" && (
            <>
              <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Logo
              </label>
              <button
                onClick={() => setLogoPickerOpen(true)}
                className="mb-2.5 flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <LogoImg slug={node.logo} size={16} />
                {node.logo ?? "Choose a logo…"}
              </button>
            </>
          )}

          <div className="mt-1 flex flex-col gap-1.5">
            {node.parent && (
              <button
                data-testid="inspector-remove-from-group"
                onClick={() => removeNodeFromGroup(node.id)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Remove from group
              </button>
            )}
            {isContainerType(node.type) && childrenOf(doc, node.id).length > 0 && (
              <button
                data-testid="inspector-degroup"
                onClick={() => degroupContainer(node.id)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {node.type === "platform" ? "Dissolve platform" : "Degroup"}
              </button>
            )}
            <button
              onClick={() => deleteNodes([node.id])}
              className="w-full rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              Delete{isContainerType(node.type) ? " (with contents)" : ""}
            </button>
          </div>

          <LogoPicker
            open={logoPickerOpen}
            onClose={() => setLogoPickerOpen(false)}
            onSelect={(slug) => updateNode(node.id, { logo: slug })}
          />
        </>
      )}

      {edge && (
        <>
          <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Edge
          </div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Label
          </label>
          <input
            value={edge.label}
            onChange={(e) => updateEdgeLabel(edge.id, e.target.value)}
            placeholder="e.g. ticket"
            className="mb-2.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={() => deleteEdges([edge.id])}
            className="w-full rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            Delete edge
          </button>
        </>
      )}
    </div>
  );
}
