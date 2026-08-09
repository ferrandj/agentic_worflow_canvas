import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ContainerNodeData } from "../../state/flowAdapter";
import { TYPE_STYLES } from "./typeStyles";
import { LogoImg } from "./LogoImg";

function ContainerNodeImpl({ data, selected, width, height }: NodeProps) {
  const { node, childCount } = data as ContainerNodeData;
  const style = TYPE_STYLES[node.type];

  return (
    <div
      data-testid={`container-${node.label}`}
      className={`h-full w-full rounded-2xl border-2 border-dashed transition-shadow ${style.card} ${
        selected ? "ring-2 ring-slate-900/60 dark:ring-white/70" : ""
      }`}
      style={{ width, height }}
    >
      <div
        className={`absolute -top-3.5 left-4 flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur ${style.chip} border-white/50 dark:border-black/30`}
      >
        {node.type === "platform" && <LogoImg slug={node.logo} size={13} />}
        <span className="max-w-44 truncate">{node.label}</span>
        <span className="opacity-60">· {childCount}</span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!border-slate-400 !bg-white dark:!border-slate-500 dark:!bg-slate-800"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-slate-400 !bg-white dark:!border-slate-500 dark:!bg-slate-800"
      />
    </div>
  );
}

export const ContainerNode = memo(ContainerNodeImpl);
