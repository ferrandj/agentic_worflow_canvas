import dagre from "@dagrejs/dagre";
import type { CanvasDoc } from "../model/types.js";
import { isContainerType } from "../model/types.js";
import { LEAF_W, LEAF_H, EMPTY_CONTAINER_W, EMPTY_CONTAINER_H, PAD } from "../model/geometry.js";
import { ancestorsOf } from "../model/grouping.js";

interface Size {
  w: number;
  h: number;
}

interface ScopeLayout {
  size: Size; // content bbox (children only, no PAD)
  offsets: Map<string, { x: number; y: number }>; // child topleft relative to content origin
}

/**
 * Assign x/y positions to every node of a (typically freshly imported) doc.
 * Recursive per-container dagre: each container's direct children are laid out
 * with dagre (LR), deepest containers first so parent layouts know child sizes.
 * Mutates nothing; returns a new doc.
 */
export function autoLayout(doc: CanvasDoc): CanvasDoc {
  const containerSizes = new Map<string, Size>();
  const scopeLayouts = new Map<string | null, ScopeLayout>();

  // Lift an edge endpoint to its top ancestor within the given scope.
  const liftTo = (nodeId: string, scopeId: string | null): string | null => {
    const chain = [nodeId, ...ancestorsOf(doc, nodeId)];
    for (const id of chain) {
      const node = doc.nodes.find((n) => n.id === id)!;
      if ((node.parent ?? null) === scopeId) return id;
    }
    return null;
  };

  const layoutScope = (scopeId: string | null): ScopeLayout => {
    const children = doc.nodes.filter((n) => (n.parent ?? null) === scopeId);

    // Recurse into child containers first so their sizes are known.
    for (const child of children) {
      if (isContainerType(child.type)) {
        const inner = layoutScope(child.id);
        const size: Size =
          inner.offsets.size === 0
            ? { w: EMPTY_CONTAINER_W, h: EMPTY_CONTAINER_H }
            : { w: inner.size.w + PAD.l + PAD.r, h: inner.size.h + PAD.t + PAD.b };
        containerSizes.set(child.id, size);
      }
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const child of children) {
      const size = isContainerType(child.type)
        ? containerSizes.get(child.id)!
        : { w: LEAF_W, h: LEAF_H };
      g.setNode(child.id, { width: size.w, height: size.h });
    }

    for (const edge of doc.edges) {
      const from = liftTo(edge.from, scopeId);
      const to = liftTo(edge.to, scopeId);
      if (from && to && from !== to) g.setEdge(from, to);
    }

    dagre.layout(g);

    const offsets = new Map<string, { x: number; y: number }>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const child of children) {
      const pos = g.node(child.id);
      const size = isContainerType(child.type)
        ? containerSizes.get(child.id)!
        : { w: LEAF_W, h: LEAF_H };
      const x = pos.x - size.w / 2; // dagre positions are centers
      const y = pos.y - size.h / 2;
      offsets.set(child.id, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + size.w);
      maxY = Math.max(maxY, y + size.h);
    }
    // Normalize offsets so the content origin is (0,0).
    for (const [id, off] of offsets) {
      offsets.set(id, { x: off.x - minX, y: off.y - minY });
    }

    const layout: ScopeLayout = {
      size:
        children.length === 0
          ? { w: 0, h: 0 }
          : { w: maxX - minX, h: maxY - minY },
      offsets,
    };
    scopeLayouts.set(scopeId, layout);
    return layout;
  };

  layoutScope(null);

  // Top-down absolute placement.
  const positions = new Map<string, { x: number; y: number }>();
  const place = (scopeId: string | null, contentOriginX: number, contentOriginY: number) => {
    const layout = scopeLayouts.get(scopeId);
    if (!layout) return;
    for (const [childId, off] of layout.offsets) {
      const abs = { x: contentOriginX + off.x, y: contentOriginY + off.y };
      positions.set(childId, abs);
      const child = doc.nodes.find((n) => n.id === childId)!;
      if (isContainerType(child.type)) {
        place(childId, abs.x + PAD.l, abs.y + PAD.t);
      }
    }
  };
  place(null, 60, 60);

  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const pos = positions.get(n.id);
      return pos ? { ...n, x: pos.x, y: pos.y } : n;
    }),
  };
}
