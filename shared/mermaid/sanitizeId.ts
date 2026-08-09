const RESERVED = new Set([
  "end",
  "subgraph",
  "flowchart",
  "graph",
  "class",
  "classdef",
  "style",
  "linkstyle",
  "direction",
  "click",
  "o",
  "x",
]);

/** Turn a human label into a mermaid-safe id derived from the real name. */
export function sanitizeId(label: string): string {
  let id = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (id === "" || /^\d/.test(id) || RESERVED.has(id.toLowerCase())) {
    id = `n_${id}`;
  }
  return id;
}

/**
 * Assign a unique mermaid id per node, derived from its label.
 * Deterministic: collisions get _2, _3… in input order.
 */
export function assignIds(nodes: { id: string; label: string }[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const node of nodes) {
    const base = sanitizeId(node.label);
    let candidate = base;
    let i = 2;
    while (taken.has(candidate)) {
      candidate = `${base}_${i}`;
      i += 1;
    }
    taken.add(candidate);
    out.set(node.id, candidate);
  }
  return out;
}

/** Escape a label for use inside a quoted mermaid string. */
export function escapeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/[\[\]{}]/g, "").replace(/\r?\n/g, " ").trim();
}
