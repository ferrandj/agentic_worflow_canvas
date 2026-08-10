import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { CanvasDoc, CanvasNode } from "@shared/model/types";
import { isContainerType } from "@shared/model/types";
import { deriveRects, depthOf, childrenOf, type Rect } from "@shared/model/geometry";

export interface LeafNodeData extends Record<string, unknown> {
  node: CanvasNode;
}

export interface ContainerNodeData extends Record<string, unknown> {
  node: CanvasNode;
  childCount: number;
}

export interface LabeledEdgeData extends Record<string, unknown> {
  labelOffset: { x: number; y: number } | null;
}

/**
 * Derive React Flow state from the canonical doc.
 *
 * Deliberate design: every RF node is a ROOT-level node positioned at its
 * absolute derived rect — we never use RF's parentId/relative coordinates.
 * Containment lives only in the doc's `parent` field; container rects are
 * derived. This one-way mapping eliminates the classic subflow drift/jitter
 * problems: dragging any node just writes absolute coords back to the doc,
 * and everything (including auto-hugging container frames) re-derives.
 */
export function toFlow(
  doc: CanvasDoc,
  selection: Set<string>,
  selectedEdgeId: string | null
): { nodes: RFNode[]; edges: RFEdge[]; rects: Map<string, Rect> } {
  const rects = deriveRects(doc);

  const sorted = [...doc.nodes].sort((a, b) => depthOf(doc, a.id) - depthOf(doc, b.id));

  const nodes: RFNode[] = sorted.map((node) => {
    const rect = rects.get(node.id)!;
    const depth = depthOf(doc, node.id);

    if (isContainerType(node.type)) {
      return {
        id: node.id,
        type: "container",
        position: { x: rect.x, y: rect.y },
        data: { node, childCount: childrenOf(doc, node.id).length } satisfies ContainerNodeData,
        width: rect.w,
        height: rect.h,
        selected: selection.has(node.id),
        zIndex: depth,
      };
    }
    return {
      id: node.id,
      type: node.type === "note" ? "note" : "leaf",
      position: { x: rect.x, y: rect.y },
      data: { node } satisfies LeafNodeData,
      selected: selection.has(node.id),
      zIndex: 10 + depth,
    };
  });

  const edges: RFEdge[] = doc.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: "labeled",
    label: edge.label,
    data: { labelOffset: edge.labelOffset ?? null } satisfies LabeledEdgeData,
    selected: edge.id === selectedEdgeId,
    zIndex: 1000,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  }));

  return { nodes, edges, rects };
}
