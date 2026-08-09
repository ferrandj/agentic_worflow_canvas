import type { CanvasDoc, CanvasNode } from "../model/types.js";
import { isContainerType } from "../model/types.js";
import { assignIds, escapeLabel } from "./sanitizeId.js";

function leafLine(node: CanvasNode, id: string): string {
  const label = escapeLabel(node.label) || id;
  switch (node.type) {
    case "person":
      return `${id}(["${label}"])`;
    case "code":
      return `${id}[["${label}"]]`;
    default:
      return `${id}["${label}"]`;
  }
}

/**
 * Serialize a canvas to our mermaid flowchart dialect.
 * Ids are sanitized real names (never internal ids); containers are subgraphs;
 * platforms are marked via `class <id> platform` plus an `%% afc:logo` comment
 * channel for their logo slug.
 */
export function toMermaid(doc: CanvasDoc): string {
  const ids = assignIds(doc.nodes);
  const mid = (nodeId: string) => ids.get(nodeId)!;
  const lines: string[] = ["flowchart LR"];

  const emit = (node: CanvasNode, indent: number) => {
    const pad = "  ".repeat(indent);
    if (isContainerType(node.type)) {
      const label = escapeLabel(node.label) || mid(node.id);
      lines.push(`${pad}subgraph ${mid(node.id)}["${label}"]`);
      for (const child of doc.nodes.filter((n) => n.parent === node.id)) {
        emit(child, indent + 1);
      }
      lines.push(`${pad}end`);
    } else {
      lines.push(`${pad}${leafLine(node, mid(node.id))}`);
    }
  };

  for (const node of doc.nodes.filter((n) => n.parent === null)) {
    emit(node, 1);
  }

  for (const edge of doc.edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (!from || !to) continue;
    const label = escapeLabel(edge.label);
    lines.push(label ? `  ${from} -- ${label} --> ${to}` : `  ${from} --> ${to}`);
  }

  const platforms = doc.nodes.filter((n) => n.type === "platform");
  if (platforms.length > 0) {
    lines.push("  classDef platform stroke:#ef4444,stroke-dasharray: 5 5");
    lines.push(`  class ${platforms.map((p) => mid(p.id)).join(",")} platform`);
    for (const p of platforms) {
      if (p.logo) lines.push(`  %% afc:logo ${mid(p.id)}=${p.logo}`);
    }
  }

  return lines.join("\n") + "\n";
}
