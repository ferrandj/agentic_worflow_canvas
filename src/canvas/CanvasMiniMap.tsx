import { useCallback, useRef } from "react";
import { Panel, useReactFlow, useStore, useViewport } from "@xyflow/react";
import type { CanvasDoc } from "@shared/model/types";
import { isContainerType } from "@shared/model/types";
import type { Rect } from "@shared/model/geometry";
import { rectCenter } from "@shared/model/geometry";
import { TYPE_STYLES } from "./nodes/typeStyles";

const WIDTH = 208;
const HEIGHT = 148;
const PADDING = 60;

/**
 * A fully custom minimap. React Flow's built-in <MiniMap> only draws node
 * rectangles (no edges), and a large group/platform frame -- itself just
 * another node, sized to its whole bounding box -- visually dominates the
 * small leaves and notes nested inside it. This one draws every element
 * (containers as a faint outline so members stay visible on top, plus
 * edges as thin connecting lines) and doubles as a draggable viewport.
 */
export function CanvasMiniMap({ doc, rects }: { doc: CanvasDoc; rects: Map<string, Rect> }) {
  // All hooks must run unconditionally -- the empty-canvas guard is applied
  // only to the JSX output, at the very end.
  const { setViewport } = useReactFlow();
  const viewport = useViewport();
  const wrapperWidth = useStore((s) => s.width) || 1;
  const wrapperHeight = useStore((s) => s.height) || 1;
  const svgRef = useRef<SVGSVGElement>(null);

  const allRects = [...rects.values()];
  const visible = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    w: wrapperWidth / viewport.zoom,
    h: wrapperHeight / viewport.zoom,
  };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of allRects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (!Number.isFinite(minX)) {
    minX = visible.x;
    minY = visible.y;
    maxX = visible.x + visible.w;
    maxY = visible.y + visible.h;
  }
  // Include the current viewport too, so panning out doesn't clip the indicator.
  minX = Math.min(minX, visible.x) - PADDING;
  minY = Math.min(minY, visible.y) - PADDING;
  maxX = Math.max(maxX, visible.x + visible.w) + PADDING;
  maxY = Math.max(maxY, visible.y + visible.h) + PADDING;

  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const scale = Math.min(WIDTH / contentW, HEIGHT / contentH);
  const offX = (WIDTH - contentW * scale) / 2;
  const offY = (HEIGHT - contentH * scale) / 2;
  const px = (x: number) => (x - minX) * scale + offX;
  const py = (y: number) => (y - minY) * scale + offY;

  const jumpTo = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const localX = clientX - box.left;
      const localY = clientY - box.top;
      const worldX = (localX - offX) / scale + minX;
      const worldY = (localY - offY) / scale + minY;
      setViewport(
        { x: wrapperWidth / 2 - worldX * viewport.zoom, y: wrapperHeight / 2 - worldY * viewport.zoom, zoom: viewport.zoom },
        { duration: 200 }
      );
    },
    [minX, minY, offX, offY, scale, setViewport, viewport.zoom, wrapperWidth, wrapperHeight]
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    jumpTo(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons !== 1) return;
    jumpTo(e.clientX, e.clientY);
  };

  if (allRects.length === 0) return null;

  const containers = doc.nodes.filter((n) => isContainerType(n.type));
  const leaves = doc.nodes.filter((n) => !isContainerType(n.type));

  return (
    <Panel position="bottom-right" className="!m-3">
      <svg
        ref={svgRef}
        data-testid="canvas-minimap"
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="cursor-pointer touch-none rounded-xl border border-slate-200/80 bg-white/90 shadow-md backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/90"
      >
        {/* containers: faint fill + outline so members stay visible on top */}
        {containers.map((node) => {
          const r = rects.get(node.id);
          if (!r) return null;
          const color = TYPE_STYLES[node.type].minimap;
          return (
            <rect
              key={node.id}
              x={px(r.x)}
              y={py(r.y)}
              width={r.w * scale}
              height={r.h * scale}
              rx={3}
              fill={color}
              fillOpacity={0.14}
              stroke={color}
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          );
        })}

        {/* edges: thin connecting lines */}
        {doc.edges.map((edge) => {
          const from = rects.get(edge.from);
          const to = rects.get(edge.to);
          if (!from || !to) return null;
          const c1 = rectCenter(from);
          const c2 = rectCenter(to);
          return (
            <line
              key={edge.id}
              x1={px(c1.x)}
              y1={py(c1.y)}
              x2={px(c2.x)}
              y2={py(c2.y)}
              stroke="var(--afc-edge)"
              strokeWidth={1}
              strokeOpacity={0.85}
            />
          );
        })}

        {/* leaves and notes: solid markers, always on top */}
        {leaves.map((node) => {
          const r = rects.get(node.id);
          if (!r) return null;
          const color = TYPE_STYLES[node.type].minimap;
          const w = Math.max(2.5, r.w * scale);
          const h = Math.max(2.5, r.h * scale);
          return <rect key={node.id} x={px(r.x)} y={py(r.y)} width={w} height={h} rx={1} fill={color} />;
        })}

        {/* current viewport indicator */}
        <rect
          data-testid="minimap-viewport"
          x={px(visible.x)}
          y={py(visible.y)}
          width={visible.w * scale}
          height={visible.h * scale}
          fill="#6366f1"
          fillOpacity={0.08}
          stroke="#6366f1"
          strokeWidth={1.5}
        />
      </svg>
    </Panel>
  );
}
