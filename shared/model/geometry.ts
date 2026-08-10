import type { CanvasDoc, CanvasNode } from "./types.js";
import { isContainerType } from "./types.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LEAF_W = 176;
export const LEAF_H = 76;
export const NOTE_W = 208;
export const NOTE_H = 152;
export const EMPTY_CONTAINER_W = 220;
export const EMPTY_CONTAINER_H = 110;
export const PAD = { l: 28, t: 44, r: 28, b: 28 } as const;
export const MIN_PAD = 8;

function leafSize(node: CanvasNode): { w: number; h: number } {
  return node.type === "note" ? { w: NOTE_W, h: NOTE_H } : { w: LEAF_W, h: LEAF_H };
}

/**
 * A container's padding is the user's stored pad (from dragging a resize
 * handle — see issue #4), clamped to a sane minimum, falling back to the
 * default when nothing has been stretched yet.
 */
export function effectivePad(node: CanvasNode): { l: number; t: number; r: number; b: number } {
  const stored = node.pad;
  if (!stored) return PAD;
  return {
    l: Math.max(MIN_PAD, stored.l),
    t: Math.max(MIN_PAD, stored.t),
    r: Math.max(MIN_PAD, stored.r),
    b: Math.max(MIN_PAD, stored.b),
  };
}

export function rectContainsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectCenter(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function childrenOf(doc: CanvasDoc, parentId: string): CanvasNode[] {
  return doc.nodes.filter((n) => n.parent === parentId);
}

export function nodeById(doc: CanvasDoc, id: string): CanvasNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

/**
 * Derive every node's rectangle in absolute world coordinates.
 * Containers have no stored size: their rect is the bounding box of their
 * children plus PAD. An empty container (platforms may be empty) uses its
 * stored x/y with a fixed size.
 */
export function deriveRects(doc: CanvasDoc): Map<string, Rect> {
  const rects = new Map<string, Rect>();

  const compute = (node: CanvasNode, visiting: Set<string>): Rect => {
    const cached = rects.get(node.id);
    if (cached) return cached;
    if (visiting.has(node.id)) {
      // Cycle guard — treat as a leaf to avoid infinite recursion.
      const fallback = { x: node.x, y: node.y, w: LEAF_W, h: LEAF_H };
      rects.set(node.id, fallback);
      return fallback;
    }
    visiting.add(node.id);

    let rect: Rect;
    if (isContainerType(node.type)) {
      const children = childrenOf(doc, node.id);
      const pad = effectivePad(node);
      if (children.length === 0) {
        rect = { x: node.x, y: node.y, w: EMPTY_CONTAINER_W, h: EMPTY_CONTAINER_H };
      } else {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const child of children) {
          const r = compute(child, visiting);
          minX = Math.min(minX, r.x);
          minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + r.w);
          maxY = Math.max(maxY, r.y + r.h);
        }
        // Padding is at least the auto-hug default but can be stretched
        // larger by the user (resize handles) on any side independently —
        // it can never shrink the frame below its members' bounding box.
        rect = {
          x: minX - pad.l,
          y: minY - pad.t,
          w: maxX - minX + pad.l + pad.r,
          h: maxY - minY + pad.t + pad.b,
        };
      }
    } else {
      const size = leafSize(node);
      rect = { x: node.x, y: node.y, w: size.w, h: size.h };
    }

    rects.set(node.id, rect);
    visiting.delete(node.id);
    return rect;
  };

  for (const node of doc.nodes) compute(node, new Set());
  return rects;
}

export function depthOf(doc: CanvasDoc, id: string): number {
  let depth = 0;
  let cur = nodeById(doc, id);
  const seen = new Set<string>();
  while (cur?.parent && !seen.has(cur.parent)) {
    seen.add(cur.parent);
    depth += 1;
    cur = nodeById(doc, cur.parent);
  }
  return depth;
}
