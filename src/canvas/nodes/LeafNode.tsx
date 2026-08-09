import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { LEAF_W, LEAF_H } from "@shared/model/geometry";
import type { LeafNodeData } from "../../state/flowAdapter";
import { TYPE_STYLES } from "./typeStyles";

function LeafNodeImpl({ data, selected }: NodeProps) {
  const { node } = data as LeafNodeData;
  const style = TYPE_STYLES[node.type];

  return (
    <div
      data-testid={`node-${node.label}`}
      className={`group flex flex-col justify-center rounded-xl border px-3 shadow-sm transition-shadow hover:shadow-md ${style.card} ${
        selected ? "ring-2 ring-slate-900/70 dark:ring-white/80" : ""
      }`}
      style={{ width: LEAF_W, height: LEAF_H }}
    >
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${style.headerText}`}>
        <span className="text-[11px] leading-none">{style.icon}</span>
        {style.label}
      </div>
      <div className="truncate text-sm font-semibold leading-tight">{node.label}</div>
      {node.note && <div className="truncate text-[11px] opacity-70">{node.note}</div>}

      <Handle
        type="target"
        position={Position.Left}
        className="!border-slate-400 !bg-white opacity-40 transition-opacity group-hover:opacity-100 dark:!border-slate-500 dark:!bg-slate-800"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-slate-400 !bg-white opacity-40 transition-opacity group-hover:opacity-100 dark:!border-slate-500 dark:!bg-slate-800"
      />
    </div>
  );
}

export const LeafNode = memo(LeafNodeImpl);
