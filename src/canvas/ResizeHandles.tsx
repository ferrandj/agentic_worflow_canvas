import { useRef } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import type { CanvasDoc } from "@shared/model/types";
import { isContainerType } from "@shared/model/types";
import { effectivePad, type Rect } from "@shared/model/geometry";
import { useCanvasStore } from "../state/store";

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { dir: Dir; cursor: string }[] = [
  { dir: "nw", cursor: "nwse-resize" },
  { dir: "n", cursor: "ns-resize" },
  { dir: "ne", cursor: "nesw-resize" },
  { dir: "e", cursor: "ew-resize" },
  { dir: "se", cursor: "nwse-resize" },
  { dir: "s", cursor: "ns-resize" },
  { dir: "sw", cursor: "nesw-resize" },
  { dir: "w", cursor: "ew-resize" },
];

/**
 * Free resize for groups/platforms (GitHub #4). A container's frame is still
 * always at least the bounding box of its members — these handles stretch
 * the padding on each side independently, they never shrink below that
 * auto-hugged minimum (see effectivePad / deriveRects).
 */
export function ResizeHandles({ doc, selection, rects }: { doc: CanvasDoc; selection: Set<string>; rects: Map<string, Rect> }) {
  const { getZoom } = useReactFlow();
  const viewport = useViewport();
  const dragRef = useRef<{
    dir: Dir;
    startX: number;
    startY: number;
    startPad: { l: number; t: number; r: number; b: number };
  } | null>(null);

  if (selection.size !== 1) return null;
  const id = [...selection][0];
  const node = doc.nodes.find((n) => n.id === id);
  if (!node || !isContainerType(node.type)) return null;
  const rect = rects.get(id);
  if (!rect) return null;

  const screen = {
    x: rect.x * viewport.zoom + viewport.x,
    y: rect.y * viewport.zoom + viewport.y,
    w: rect.w * viewport.zoom,
    h: rect.h * viewport.zoom,
  };

  const positions: Record<Dir, { x: number; y: number }> = {
    nw: { x: screen.x, y: screen.y },
    n: { x: screen.x + screen.w / 2, y: screen.y },
    ne: { x: screen.x + screen.w, y: screen.y },
    e: { x: screen.x + screen.w, y: screen.y + screen.h / 2 },
    se: { x: screen.x + screen.w, y: screen.y + screen.h },
    s: { x: screen.x + screen.w / 2, y: screen.y + screen.h },
    sw: { x: screen.x, y: screen.y + screen.h },
    w: { x: screen.x, y: screen.y + screen.h / 2 },
  };

  const onPointerDown = (e: React.PointerEvent, dir: Dir) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { dir, startX: e.clientX, startY: e.clientY, startPad: effectivePad(node) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();
    const zoom = getZoom() || 1;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = (e.clientY - drag.startY) / zoom;
    const pad = { ...drag.startPad };
    if (drag.dir.includes("w")) pad.l = Math.max(8, drag.startPad.l - dx);
    if (drag.dir.includes("e")) pad.r = Math.max(8, drag.startPad.r + dx);
    if (drag.dir.includes("n")) pad.t = Math.max(8, drag.startPad.t - dy);
    if (drag.dir.includes("s")) pad.b = Math.max(8, drag.startPad.b + dy);
    useCanvasStore.getState().updateNode(id, { pad });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  return (
    <>
      {HANDLES.map(({ dir, cursor }) => (
        <div
          key={dir}
          data-testid={`resize-handle-${dir}`}
          onPointerDown={(e) => onPointerDown(e, dir)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute z-30 touch-none rounded-full border-2 border-white bg-slate-900 shadow dark:border-slate-950 dark:bg-white"
          style={{
            left: positions[dir].x - 6,
            top: positions[dir].y - 6,
            width: 12,
            height: 12,
            cursor,
          }}
        />
      ))}
    </>
  );
}
