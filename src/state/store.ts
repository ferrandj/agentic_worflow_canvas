import { create } from "zustand";
import type { CanvasDoc, CanvasNode, NodeType } from "@shared/model/types";
import { uid, isContainerType } from "@shared/model/types";
import { deriveRects, LEAF_W, LEAF_H, NOTE_W, NOTE_H } from "@shared/model/geometry";
import {
  joinContainer,
  wrapInGroup,
  removeFromGroup,
  degroup,
  cleanup,
  GroupingError,
} from "@shared/model/grouping";
import { notifyError } from "../lib/logger";

export type SaveState = "clean" | "dirty" | "saving" | "error";

interface CanvasStore {
  doc: CanvasDoc | null;
  canvasName: string | null;
  selection: Set<string>;
  selectedEdgeId: string | null;
  saveState: SaveState;

  setDoc: (doc: CanvasDoc | null, name: string | null) => void;
  mutateDoc: (fn: (doc: CanvasDoc) => CanvasDoc) => void;
  markSaved: (state: SaveState) => void;

  setSelection: (ids: Set<string>) => void;
  setSelectedEdge: (id: string | null) => void;

  addNode: (type: NodeType, x: number, y: number) => void;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  deleteNodes: (ids: string[]) => void;
  moveNodeTo: (id: string, absX: number, absY: number) => void;

  addEdge: (from: string, to: string) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  updateEdgeLabelOffset: (id: string, offset: { x: number; y: number }) => void;
  deleteEdges: (ids: string[]) => void;

  dropJoin: (draggedId: string, targetId: string) => boolean;
  removeNodeFromGroup: (id: string) => void;
  degroupContainer: (id: string) => void;
  duplicateNode: (id: string) => void;
}

const TYPE_LABEL: Record<NodeType, string> = {
  person: "Person",
  agent: "Agent",
  code: "Code",
  group: "Group",
  platform: "Platform",
  note: "Note",
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  doc: null,
  canvasName: null,
  selection: new Set(),
  selectedEdgeId: null,
  saveState: "clean",

  setDoc: (doc, name) =>
    set({ doc, canvasName: name, selection: new Set(), selectedEdgeId: null, saveState: "clean" }),

  mutateDoc: (fn) => {
    const { doc } = get();
    if (!doc) return;
    const next = fn(doc);
    if (next !== doc) set({ doc: next, saveState: "dirty" });
  },

  markSaved: (state) => set({ saveState: state }),

  setSelection: (ids) => set({ selection: ids }),
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),

  addNode: (type, x, y) => {
    const { doc } = get();
    const spawnW = type === "note" ? NOTE_W : LEAF_W;
    const spawnH = type === "note" ? NOTE_H : LEAF_H;
    // Nudge the spawn point to a free spot so stacked adds don't overlap.
    let px = x;
    let py = y;
    if (doc) {
      const rects = [...deriveRects(doc).values()];
      const collides = (cx: number, cy: number) =>
        rects.some(
          (r) =>
            cx < r.x + r.w + 16 && cx + spawnW + 16 > r.x && cy < r.y + r.h + 16 && cy + spawnH + 16 > r.y
        );
      for (let i = 0; i < 200 && collides(px, py); i++) {
        px += 48;
        if (i % 8 === 7) {
          px = x;
          py += 56;
        }
      }
    }
    const node: CanvasNode = {
      id: uid("n"),
      type,
      // Notes are edited in place and start blank so the placeholder shows.
      label: type === "note" ? "" : `New ${TYPE_LABEL[type]}`,
      note: "",
      logo: null,
      parent: null,
      x: px,
      y: py,
    };
    get().mutateDoc((d) => ({ ...d, nodes: [...d.nodes, node] }));
    set({ selection: new Set([node.id]) });
  },

  updateNode: (id, patch) => {
    get().mutateDoc((doc) => {
      const nodes = doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      return cleanup({ ...doc, nodes });
    });
  },

  deleteNodes: (ids) => {
    get().mutateDoc((doc) => {
      // Deleting a container deletes its whole subtree.
      const toDelete = new Set(ids);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of doc.nodes) {
          if (n.parent && toDelete.has(n.parent) && !toDelete.has(n.id)) {
            toDelete.add(n.id);
            grew = true;
          }
        }
      }
      const nodes = doc.nodes.filter((n) => !toDelete.has(n.id));
      const edges = doc.edges.filter((e) => !toDelete.has(e.from) && !toDelete.has(e.to));
      return cleanup({ ...doc, nodes, edges });
    });
    set({ selection: new Set() });
  },

  moveNodeTo: (id, absX, absY) => {
    get().mutateDoc((doc) => {
      const node = doc.nodes.find((n) => n.id === id);
      if (!node) return doc;
      if (!isContainerType(node.type)) {
        if (node.x === absX && node.y === absY) return doc;
        return {
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === id ? { ...n, x: absX, y: absY } : n)),
        };
      }
      // Container: shift the whole subtree by the delta of its derived origin.
      const rects = deriveRects(doc);
      const rect = rects.get(id)!;
      const dx = absX - rect.x;
      const dy = absY - rect.y;
      if (dx === 0 && dy === 0) return doc;
      const subtree = new Set([id]);
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
      return {
        ...doc,
        nodes: doc.nodes.map((n) =>
          subtree.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n
        ),
      };
    });
  },

  addEdge: (from, to) => {
    get().mutateDoc((doc) => {
      if (from === to) return doc;
      if (doc.edges.some((e) => e.from === from && e.to === to)) return doc;
      return { ...doc, edges: [...doc.edges, { id: uid("e"), from, to, label: "" }] };
    });
  },

  updateEdgeLabel: (id, label) => {
    get().mutateDoc((doc) => ({
      ...doc,
      edges: doc.edges.map((e) => (e.id === id ? { ...e, label } : e)),
    }));
  },

  updateEdgeLabelOffset: (id, offset) => {
    get().mutateDoc((doc) => ({
      ...doc,
      edges: doc.edges.map((e) => (e.id === id ? { ...e, labelOffset: offset } : e)),
    }));
  },

  deleteEdges: (ids) => {
    const idSet = new Set(ids);
    get().mutateDoc((doc) => ({
      ...doc,
      edges: doc.edges.filter((e) => !idSet.has(e.id)),
    }));
  },

  /** Returns true if the join/wrap was applied, false if rejected. */
  dropJoin: (draggedId, targetId) => {
    const { doc } = get();
    if (!doc) return false;
    const target = doc.nodes.find((n) => n.id === targetId);
    if (!target) return false;
    try {
      const next = isContainerType(target.type)
        ? joinContainer(doc, draggedId, targetId)
        : wrapInGroup(doc, draggedId, targetId);
      set({ doc: next, saveState: "dirty" });
      return true;
    } catch (err) {
      if (err instanceof GroupingError && err.code === "PersonInPlatform") {
        notifyError("Platforms can't contain Person blocks", err);
      } else if (err instanceof GroupingError && err.code === "Cycle") {
        notifyError("Can't nest a group inside itself", err);
      }
      return false;
    }
  },

  removeNodeFromGroup: (id) => {
    get().mutateDoc((doc) => removeFromGroup(doc, id));
  },

  degroupContainer: (id) => {
    get().mutateDoc((doc) => degroup(doc, id));
    set({ selection: new Set() });
  },

  duplicateNode: (id) => {
    get().mutateDoc((doc) => {
      const node = doc.nodes.find((n) => n.id === id);
      if (!node || isContainerType(node.type)) return doc;
      const copy: CanvasNode = { ...node, id: uid("n"), x: node.x + 40, y: node.y + 40 };
      return { ...doc, nodes: [...doc.nodes, copy] };
    });
  },
}));
