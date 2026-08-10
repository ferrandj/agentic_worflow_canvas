import { memo, useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useCanvasStore } from "../../state/store";
import type { LabeledEdgeData } from "../../state/flowAdapter";

// Default label position is offset above the path rather than centered on
// it, so a fresh label never spawns on top of / under the arrow line.
const DEFAULT_OFFSET = { x: 0, y: -16 };

function LabeledEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const { getZoom } = useReactFlow();
  const dragRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(
    null
  );

  const [path, pathLabelX, pathLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const offset = (data as LabeledEdgeData | undefined)?.labelOffset ?? DEFAULT_OFFSET;
  const labelX = pathLabelX + offset.x;
  const labelY = pathLabelY + offset.y;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const zoom = getZoom() || 1;
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    useCanvasStore.getState().updateEdgeLabelOffset(id, {
      x: dragRef.current.startOffset.x + dx,
      y: dragRef.current.startOffset.y + dy,
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

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
            data-testid={`edge-label-${id}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute cursor-grab touch-none select-none rounded-md border border-slate-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur hover:border-slate-300 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const LabeledEdge = memo(LabeledEdgeImpl);
