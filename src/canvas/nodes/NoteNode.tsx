import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { NOTE_W, NOTE_H } from "@shared/model/geometry";
import type { LeafNodeData } from "../../state/flowAdapter";
import { useCanvasStore } from "../../state/store";
import { TYPE_STYLES } from "./typeStyles";

/**
 * A free-floating sticky note. Unlike the other block types it carries no
 * workflow semantics (no ports, no Mermaid representation) and is edited
 * directly in place rather than through the inspector.
 */
function NoteNodeImpl({ data, selected }: NodeProps) {
  const { node } = data as LeafNodeData;
  const style = TYPE_STYLES.note;

  return (
    <div
      data-testid={`node-${node.label || "note"}`}
      className={`flex h-full w-full flex-col gap-1.5 rounded-lg border p-3 shadow-md transition-shadow hover:shadow-lg ${style.card} ${
        selected ? "ring-2 ring-slate-900/70 dark:ring-white/80" : ""
      }`}
      style={{ width: NOTE_W, height: NOTE_H }}
    >
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${style.headerText}`}>
        <span className="text-[11px] leading-none">{style.icon}</span>
        Note
      </div>
      <textarea
        data-testid="note-textarea"
        className="nodrag h-full w-full flex-1 resize-none bg-transparent text-sm leading-snug outline-none placeholder:opacity-50"
        placeholder="Type a note…"
        value={node.label}
        onChange={(e) => useCanvasStore.getState().updateNode(node.id, { label: e.target.value })}
      />
    </div>
  );
}

export const NoteNode = memo(NoteNodeImpl);
