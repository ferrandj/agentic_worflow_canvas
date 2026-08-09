import type { CanvasDoc, CanvasNode } from "./types.js";
import { isContainerType, uid } from "./types.js";
import { childrenOf, deriveRects, nodeById } from "./geometry.js";

/** All ancestor ids of a node, nearest first. */
export function ancestorsOf(doc: CanvasDoc, id: string): string[] {
  const out: string[] = [];
  let cur = nodeById(doc, id);
  const seen = new Set<string>();
  while (cur?.parent && !seen.has(cur.parent)) {
    seen.add(cur.parent);
    out.push(cur.parent);
    cur = nodeById(doc, cur.parent);
  }
  return out;
}

export function isDescendant(doc: CanvasDoc, candidateAncestorId: string, id: string): boolean {
  return ancestorsOf(doc, id).includes(candidateAncestorId);
}

/** Deep check: does this node, or any of its descendants, have type "person"? */
export function hasPerson(doc: CanvasDoc, id: string): boolean {
  const node = nodeById(doc, id);
  if (!node) return false;
  if (node.type === "person") return true;
  return childrenOf(doc, id).some((child) => hasPerson(doc, child.id));
}

/** Is `id` a platform, or inside one (any ancestor a platform)? */
export function isInPlatformScope(doc: CanvasDoc, id: string): boolean {
  const node = nodeById(doc, id);
  if (!node) return false;
  if (node.type === "platform") return true;
  return ancestorsOf(doc, id).some((aid) => nodeById(doc, aid)?.type === "platform");
}

/**
 * Auto-dissolve pass, run after every structural mutation:
 *  - a group with 0 children is deleted
 *  - a group with exactly 1 child is dissolved (child reparented up)
 *  - platforms are exempt from both rules (an empty platform is meaningful)
 * Runs to a fixed point since one dissolve can cascade into another.
 */
export function cleanup(doc: CanvasDoc): CanvasDoc {
  let nodes = doc.nodes;
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.type !== "group") continue;
      const children = nodes.filter((n) => n.parent === node.id);
      if (children.length === 0) {
        nodes = nodes.filter((n) => n.id !== node.id);
        changed = true;
        break;
      }
      if (children.length === 1) {
        const only = children[0];
        nodes = nodes
          .filter((n) => n.id !== node.id)
          .map((n) => (n.id === only.id ? { ...n, parent: node.parent } : n));
        changed = true;
        break;
      }
    }
  }
  if (nodes === doc.nodes) return doc;
  return { ...doc, nodes };
}

export class GroupingError extends Error {
  constructor(
    public code: "PersonInPlatform" | "Cycle" | "NotFound" | "NotAContainer",
    message: string
  ) {
    super(message);
  }
}

/**
 * Reparent `nodeId` (leaf or whole container subtree) into container `targetId`.
 * Absolute coordinates are untouched — joining is a pure data change.
 */
export function joinContainer(doc: CanvasDoc, nodeId: string, targetId: string): CanvasDoc {
  const node = nodeById(doc, nodeId);
  const target = nodeById(doc, targetId);
  if (!node || !target) throw new GroupingError("NotFound", "Node or target not found");
  if (!isContainerType(target.type)) {
    throw new GroupingError("NotAContainer", "Target is not a group or platform");
  }
  if (nodeId === targetId || isDescendant(doc, nodeId, targetId)) {
    throw new GroupingError("Cycle", "Cannot move a container into its own descendant");
  }
  if (isInPlatformScope(doc, targetId) && hasPerson(doc, nodeId)) {
    throw new GroupingError("PersonInPlatform", "Platforms can't contain Person blocks");
  }
  const nodes = doc.nodes.map((n) => (n.id === nodeId ? { ...n, parent: targetId } : n));
  return cleanup({ ...doc, nodes });
}

/**
 * Dropping one node onto a leaf: both become children of a brand-new group,
 * created in the target's parent scope.
 */
export function wrapInGroup(doc: CanvasDoc, draggedId: string, targetId: string): CanvasDoc {
  const dragged = nodeById(doc, draggedId);
  const target = nodeById(doc, targetId);
  if (!dragged || !target) throw new GroupingError("NotFound", "Node or target not found");
  if (isDescendant(doc, draggedId, targetId)) {
    throw new GroupingError("Cycle", "Cannot group a container with its own descendant");
  }
  if (
    target.parent !== null &&
    isInPlatformScope(doc, target.parent) &&
    hasPerson(doc, draggedId)
  ) {
    throw new GroupingError("PersonInPlatform", "Platforms can't contain Person blocks");
  }
  const group: CanvasNode = {
    id: uid("n"),
    type: "group",
    label: "Group",
    note: "",
    logo: null,
    parent: target.parent,
    x: 0,
    y: 0,
  };

  // Drop-to-wrap means the two rects overlap; park the dragged node (and its
  // subtree, if it's a container) beside the target so both stay visible.
  const rects = deriveRects(doc);
  const draggedRect = rects.get(draggedId)!;
  const targetRect = rects.get(targetId)!;
  let dx = 0;
  let dy = 0;
  if (
    draggedRect.x < targetRect.x + targetRect.w &&
    draggedRect.x + draggedRect.w > targetRect.x &&
    draggedRect.y < targetRect.y + targetRect.h &&
    draggedRect.y + draggedRect.h > targetRect.y
  ) {
    dx = targetRect.x + targetRect.w + 24 - draggedRect.x;
    dy = targetRect.y - draggedRect.y;
  }
  const subtree = new Set<string>([draggedId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of doc.nodes) {
      if (n.parent && subtree.has(n.parent) && !subtree.has(n.id)) {
        subtree.add(n.id);
        grew = true;
      }
    }
  }

  const nodes = [
    ...doc.nodes.map((n) => {
      const moved = subtree.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n;
      return moved.id === draggedId || moved.id === targetId
        ? { ...moved, parent: group.id }
        : moved;
    }),
    group,
  ];
  return cleanup({ ...doc, nodes });
}

/**
 * Explicit "Remove from group": reparent to the grandparent and relocate the
 * node just below its former container so it's visibly outside.
 */
export function removeFromGroup(doc: CanvasDoc, nodeId: string): CanvasDoc {
  const node = nodeById(doc, nodeId);
  if (!node) throw new GroupingError("NotFound", "Node not found");
  if (!node.parent) return doc;
  const parent = nodeById(doc, node.parent);
  if (!parent) return doc;

  const rects = deriveRects(doc);
  const parentRect = rects.get(parent.id)!;
  const nodeRect = rects.get(nodeId)!;
  const dx = parentRect.x - nodeRect.x;
  const dy = parentRect.y + parentRect.h + 24 - nodeRect.y;

  // Move the node (and, if it's a container, all its descendants) below the group.
  const subtree = new Set<string>([nodeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of doc.nodes) {
      if (n.parent && subtree.has(n.parent) && !subtree.has(n.id)) {
        subtree.add(n.id);
        grew = true;
      }
    }
  }

  const nodes = doc.nodes.map((n) => {
    if (n.id === nodeId) {
      return { ...n, parent: parent.parent, x: n.x + dx, y: n.y + dy };
    }
    if (subtree.has(n.id)) {
      return { ...n, x: n.x + dx, y: n.y + dy };
    }
    return n;
  });
  return cleanup({ ...doc, nodes });
}

/**
 * Explicit "Degroup": dissolve the container, reparenting all direct children
 * to the container's own parent. Works on platforms too (explicit action).
 */
export function degroup(doc: CanvasDoc, containerId: string): CanvasDoc {
  const container = nodeById(doc, containerId);
  if (!container) throw new GroupingError("NotFound", "Container not found");
  if (!isContainerType(container.type)) {
    throw new GroupingError("NotAContainer", "Node is not a group or platform");
  }
  const nodes = doc.nodes
    .filter((n) => n.id !== containerId)
    .map((n) => (n.parent === containerId ? { ...n, parent: container.parent } : n));
  return cleanup({ ...doc, nodes });
}

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
}

/** Structural invariants the server enforces on every write. */
export function validateDoc(doc: CanvasDoc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  if (byId.size !== doc.nodes.length) {
    issues.push({ code: "DuplicateNodeId", message: "Node ids must be unique" });
  }

  for (const node of doc.nodes) {
    if (node.parent !== null) {
      const parent = byId.get(node.parent);
      if (!parent) {
        issues.push({
          code: "MissingParent",
          message: `Node "${node.label}" references missing parent ${node.parent}`,
          nodeId: node.id,
        });
      } else if (!isContainerType(parent.type)) {
        issues.push({
          code: "ParentNotContainer",
          message: `Node "${node.label}" has a non-container parent "${parent.label}"`,
          nodeId: node.id,
        });
      }
    }
    // Cycle check
    const seen = new Set<string>();
    let cur: CanvasNode | undefined = node;
    while (cur?.parent) {
      if (seen.has(cur.parent)) {
        issues.push({
          code: "Cycle",
          message: `Containment cycle involving node "${node.label}"`,
          nodeId: node.id,
        });
        break;
      }
      seen.add(cur.parent);
      cur = byId.get(cur.parent);
    }
  }

  // Person-in-platform (transitively)
  for (const node of doc.nodes) {
    if (node.type !== "person") continue;
    if (ancestorsOf(doc, node.id).some((aid) => byId.get(aid)?.type === "platform")) {
      issues.push({
        code: "PersonInPlatform",
        message: `Person "${node.label}" cannot be inside a platform`,
        nodeId: node.id,
      });
    }
  }

  for (const edge of doc.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      issues.push({
        code: "DanglingEdge",
        message: `Edge ${edge.id} references a missing node`,
      });
    }
  }

  return issues;
}
