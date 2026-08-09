import type { CanvasDoc, CanvasNode, NodeType } from "../model/types.js";
import { emptyDoc, uid } from "../model/types.js";

export class MermaidParseError extends Error {
  constructor(
    public line: number,
    message: string
  ) {
    super(`Line ${line}: ${message}`);
  }
}

interface ParsedRef {
  id: string;
  type?: NodeType;
  label?: string;
}

const UNSUPPORTED_ARROWS = ["-.->", "==>", "--x", "--o", "<-->", "o--", "x--"];

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1);
  return t;
}

/**
 * Parse a node reference which may carry an inline definition:
 *   id            bare reference
 *   id["Label"]   agent (rect)     — label may be unquoted
 *   id(["Label"]) person (stadium)
 *   id[["Label"]] code (subroutine)
 */
function parseRef(raw: string, lineNo: number): ParsedRef {
  const s = raw.trim();
  let m = s.match(/^([A-Za-z0-9_.-]+)\(\[(.+)\]\)$/);
  if (m) return { id: m[1], type: "person", label: unquote(m[2]) };
  m = s.match(/^([A-Za-z0-9_.-]+)\[\[(.+)\]\]$/);
  if (m) return { id: m[1], type: "code", label: unquote(m[2]) };
  m = s.match(/^([A-Za-z0-9_.-]+)\[(.+)\]$/);
  if (m) return { id: m[1], type: "agent", label: unquote(m[2]) };
  m = s.match(/^([A-Za-z0-9_.-]+)$/);
  if (m) return { id: m[1] };
  if (/^[A-Za-z0-9_.-]+[({>]/.test(s)) {
    throw new MermaidParseError(
      lineNo,
      `Unsupported node shape in "${s}" — supported: id["x"], id(["x"]), id[["x"]]`
    );
  }
  throw new MermaidParseError(lineNo, `Cannot parse node reference "${s}"`);
}

/**
 * Parse our mermaid flowchart dialect back into a CanvasDoc.
 * Positions are NOT assigned (all zero) — run autoLayout on the result.
 */
export function parseMermaid(text: string): CanvasDoc {
  const doc = emptyDoc();
  const byMermaidId = new Map<string, CanvasNode>();
  const parentStack: (string | null)[] = [null];
  const logoDirectives: { mid: string; slug: string }[] = [];
  const platformIds = new Set<string>();
  let sawHeader = false;

  const ensureNode = (ref: ParsedRef, lineNo: number): CanvasNode => {
    let node = byMermaidId.get(ref.id);
    if (!node) {
      node = {
        id: uid("n"),
        type: ref.type ?? "agent",
        label: ref.label ?? ref.id.replace(/_/g, " "),
        note: "",
        logo: null,
        parent: parentStack[parentStack.length - 1],
        x: 0,
        y: 0,
      };
      doc.nodes.push(node);
      byMermaidId.set(ref.id, node);
    } else if (ref.type || ref.label) {
      // A later, richer definition updates label/type (but containers keep their type).
      if (ref.label) node.label = ref.label;
      if (ref.type && node.type !== "group" && node.type !== "platform") node.type = ref.type;
    }
    void lineNo;
    return node;
  };

  const lines = text.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = lines[i].trim();
    if (line === "") continue;
    if (line.endsWith(";")) line = line.slice(0, -1).trim();

    // Comments — but keep our logo directive channel.
    if (line.startsWith("%%")) {
      const logo = line.match(/^%%\s*afc:logo\s+([A-Za-z0-9_.-]+)=([A-Za-z0-9_.-]+)$/);
      if (logo) logoDirectives.push({ mid: logo[1], slug: logo[2] });
      continue;
    }

    // Header
    const header = line.match(/^(flowchart|graph)\s+(LR|RL|TB|TD|BT)\s*$/);
    if (header) {
      sawHeader = true;
      continue;
    }
    if (/^(flowchart|graph)\b/.test(line)) {
      throw new MermaidParseError(lineNo, `Unsupported flowchart direction in "${line}"`);
    }

    if (!sawHeader) {
      throw new MermaidParseError(lineNo, 'Expected "flowchart LR" (or graph/TD/TB/RL/BT) header first');
    }

    // Ignored statements
    if (/^(classDef|style|linkStyle|direction)\b/.test(line)) continue;
    if (/^click\b/.test(line)) {
      throw new MermaidParseError(lineNo, "click directives are not supported");
    }

    // class assignment — only "platform" is meaningful to us
    const classMatch = line.match(/^class\s+([A-Za-z0-9_.,\s-]+)\s+([A-Za-z0-9_-]+)$/);
    if (classMatch) {
      if (classMatch[2] === "platform") {
        for (const mid of classMatch[1].split(",").map((s) => s.trim())) {
          if (mid) platformIds.add(mid);
        }
      }
      continue;
    }

    // subgraph
    const sub = line.match(/^subgraph\s+([A-Za-z0-9_.-]+)(?:\s*\[(.+)\])?\s*$/);
    if (sub) {
      const node = ensureNode({ id: sub[1] }, lineNo);
      node.type = "group"; // may be promoted to platform by a class line
      if (sub[2]) node.label = unquote(sub[2]);
      else node.label = sub[1].replace(/_/g, " ");
      parentStack.push(node.id);
      continue;
    }
    if (/^subgraph\b/.test(line)) {
      throw new MermaidParseError(lineNo, `Cannot parse subgraph declaration "${line}"`);
    }

    // end
    if (line === "end") {
      if (parentStack.length === 1) {
        throw new MermaidParseError(lineNo, '"end" without a matching subgraph');
      }
      parentStack.pop();
      continue;
    }

    // Unsupported arrows — check before parsing edges
    for (const arrow of UNSUPPORTED_ARROWS) {
      if (line.includes(arrow)) {
        throw new MermaidParseError(lineNo, `Unsupported arrow "${arrow}" — only --> and -- label --> are supported`);
      }
    }
    if (line.includes("&")) {
      throw new MermaidParseError(lineNo, 'Fan-out with "&" is not supported');
    }

    // Edges
    let m = line.match(/^(.+?)\s*-->\s*\|(.+?)\|\s*(.+)$/); // a -->|label| b
    let from: string | null = null;
    let to: string | null = null;
    let label = "";
    if (m) {
      from = m[1];
      label = unquote(m[2]);
      to = m[3];
    } else {
      m = line.match(/^(.+?)\s+--\s+(.+?)\s+-->\s+(.+)$/); // a -- label --> b
      if (m) {
        from = m[1];
        label = unquote(m[2]);
        to = m[3];
      } else {
        m = line.match(/^(.+?)\s*-->\s*(.+)$/); // a --> b
        if (m) {
          from = m[1];
          to = m[2];
        }
      }
    }

    if (from !== null && to !== null) {
      const fromNode = ensureNode(parseRef(from, lineNo), lineNo);
      const toNode = ensureNode(parseRef(to, lineNo), lineNo);
      doc.edges.push({ id: uid("e"), from: fromNode.id, to: toNode.id, label });
      continue;
    }

    // Standalone node definition
    ensureNode(parseRef(line, lineNo), lineNo);
  }

  if (parentStack.length > 1) {
    throw new MermaidParseError(lines.length, "Unclosed subgraph (missing 'end')");
  }

  for (const mid of platformIds) {
    const node = byMermaidId.get(mid);
    if (node) node.type = "platform";
  }
  for (const { mid, slug } of logoDirectives) {
    const node = byMermaidId.get(mid);
    if (node) node.logo = slug;
  }

  return doc;
}
