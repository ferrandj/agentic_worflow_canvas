import type { CanvasDoc, CanvasNode, NodeType } from "./types.js";
import { emptyDoc } from "./types.js";

let counter = 0;

export function makeNode(partial: Partial<CanvasNode> & { type: NodeType }): CanvasNode {
  counter += 1;
  return {
    id: partial.id ?? `t${counter}`,
    type: partial.type,
    label: partial.label ?? `${partial.type} ${counter}`,
    note: partial.note ?? "",
    logo: partial.logo ?? null,
    parent: partial.parent ?? null,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    pad: partial.pad ?? undefined,
  };
}

export function makeDoc(nodes: CanvasNode[], edges: CanvasDoc["edges"] = []): CanvasDoc {
  return { ...emptyDoc(), nodes, edges };
}
