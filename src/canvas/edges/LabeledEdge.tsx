import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

function LabeledEdgeImpl({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  markerEnd,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2.5 : 1.8,
          stroke: selected ? "var(--afc-edge-selected)" : "var(--afc-edge)",
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-md border border-slate-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const LabeledEdge = memo(LabeledEdgeImpl);
