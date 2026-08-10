import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import type { CanvasNode } from "@shared/model/types";
import { isContainerType } from "@shared/model/types";
import { rectContainsPoint, rectCenter, depthOf } from "@shared/model/geometry";
import { ancestorsOf, isDescendant } from "@shared/model/grouping";
import { useCanvasStore } from "../state/store";
import { toFlow } from "../state/flowAdapter";
import { LeafNode } from "./nodes/LeafNode";
import { ContainerNode } from "./nodes/ContainerNode";
import { NoteNode } from "./nodes/NoteNode";
import { TYPE_STYLES } from "./nodes/typeStyles";
import { LabeledEdge } from "./edges/LabeledEdge";
import { ContextMenu, ADD_TYPES, type MenuState } from "./ContextMenu";
import { ResizeHandles } from "./ResizeHandles";
import type { Theme } from "../lib/theme";

const nodeTypes = { leaf: LeafNode, container: ContainerNode, note: NoteNode };
const edgeTypes = { labeled: LabeledEdge };

export function FlowCanvas({ theme }: { theme: Theme }) {
  const doc = useCanvasStore((s) => s.doc);
  const selection = useCanvasStore((s) => s.selection);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const dragSnapshot = useRef<Map<string, { x: number; y: number }> | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const { nodes, edges, rects } = useMemo(
    () => (doc ? toFlow(doc, selection, selectedEdgeId) : { nodes: [], edges: [], rects: new Map() }),
    [doc, selection, selectedEdgeId]
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const store = useCanvasStore.getState();
    let nextSelection: Set<string> | null = null;
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        store.moveNodeTo(change.id, change.position.x, change.position.y);
      } else if (change.type === "select") {
        nextSelection = nextSelection ?? new Set(store.selection);
        if (change.selected) nextSelection.add(change.id);
        else nextSelection.delete(change.id);
      }
    }
    if (nextSelection) store.setSelection(nextSelection);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const store = useCanvasStore.getState();
    for (const change of changes) {
      if (change.type === "select") {
        store.setSelectedEdge(change.selected ? change.id : null);
      }
    }
  }, []);

  const onNodesDelete = useCallback((deleted: RFNode[]) => {
    useCanvasStore.getState().deleteNodes(deleted.map((n) => n.id));
  }, []);

  const onEdgesDelete = useCallback((deleted: RFEdge[]) => {
    useCanvasStore.getState().deleteEdges(deleted.map((e) => e.id));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      useCanvasStore.getState().addEdge(connection.source, connection.target);
    }
  }, []);

  const onNodeDragStart = useCallback(() => {
    const { doc: current } = useCanvasStore.getState();
    if (!current) return;
    dragSnapshot.current = new Map(current.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  }, []);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: RFNode, draggedNodes: RFNode[]) => {
      if (draggedNodes.length !== 1) return; // multi-drag never joins
      const store = useCanvasStore.getState();
      const current = store.doc;
      if (!current) return;

      const { rects: liveRects } = toFlow(current, new Set(), null);
      const draggedRect = liveRects.get(node.id);
      const dragged = current.nodes.find((n) => n.id === node.id);
      if (!draggedRect || !dragged) return;

      const center = rectCenter(draggedRect);
      const excluded = new Set<string>([node.id, ...ancestorsOf(current, node.id)]);

      let target: CanvasNode | null = null;
      let targetDepth = -1;
      for (const candidate of current.nodes) {
        if (excluded.has(candidate.id)) continue;
        if (isDescendant(current, node.id, candidate.id)) continue;
        const rect = liveRects.get(candidate.id);
        if (!rect || !rectContainsPoint(rect, center.x, center.y)) continue;
        const depth = depthOf(current, candidate.id);
        // Prefer leaves over the container that encloses them, then deepest.
        const effectiveDepth = isContainerType(candidate.type) ? depth : depth + 0.5;
        if (effectiveDepth > targetDepth) {
          targetDepth = effectiveDepth;
          target = candidate;
        }
      }

      if (!target) {
        dragSnapshot.current = null;
        return;
      }
      // Dropping inside the container it's already in: plain move.
      if (isContainerType(target.type) && dragged.parent === target.id) {
        dragSnapshot.current = null;
        return;
      }
      // Dropping onto a sibling that's already in the same group/platform:
      // plain move, not a fresh wrap-in-group. Wrapping siblings creates a
      // new nested group and reparents both into it, which can leave their
      // original (non-null) parent with a single child -- cleanup's
      // auto-dissolve then deletes it, silently downgrading a platform to a
      // plain group and losing its identity (issue #5).
      if (!isContainerType(target.type) && target.parent !== null && target.parent === dragged.parent) {
        dragSnapshot.current = null;
        return;
      }

      const ok = store.dropJoin(node.id, target.id);
      if (!ok && dragSnapshot.current) {
        // Rejected (e.g. person onto platform): revert to drag-start positions.
        const snapshot = dragSnapshot.current;
        store.mutateDoc((d) => ({
          ...d,
          nodes: d.nodes.map((n) => {
            const pos = snapshot.get(n.id);
            return pos ? { ...n, x: pos.x, y: pos.y } : n;
          }),
        }));
      }
      dragSnapshot.current = null;
    },
    []
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, rfNode: RFNode) => {
    event.preventDefault();
    const store = useCanvasStore.getState();
    const current = store.doc;
    if (!current) return;
    const node = current.nodes.find((n) => n.id === rfNode.id);
    if (!node) return;

    const items: MenuState["items"] = [];
    if (node.parent) {
      items.push({
        label: "Remove from group",
        testId: "menu-remove-from-group",
        onClick: () => store.removeNodeFromGroup(node.id),
      });
    }
    if (isContainerType(node.type)) {
      items.push({
        label: node.type === "platform" ? "Dissolve platform" : "Degroup",
        testId: "menu-degroup",
        onClick: () => store.degroupContainer(node.id),
      });
    } else {
      items.push({
        label: "Duplicate",
        testId: "menu-duplicate",
        onClick: () => store.duplicateNode(node.id),
      });
    }
    items.push({
      label: isContainerType(node.type) ? "Delete (with contents)" : "Delete",
      testId: "menu-delete",
      danger: true,
      onClick: () => store.deleteNodes([node.id]),
    });

    setMenu({ x: event.clientX, y: event.clientY, items });
  }, []);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: ADD_TYPES.map(({ type, label }) => ({
          label,
          testId: `menu-add-${type}`,
          onClick: () => useCanvasStore.getState().addNode(type, pos.x, pos.y),
        })),
      });
    },
    [screenToFlowPosition]
  );

  const onPaneClick = useCallback(() => {
    const store = useCanvasStore.getState();
    store.setSelection(new Set());
    store.setSelectedEdge(null);
    setMenu(null);
  }, []);

  const minimapColor = useCallback((n: RFNode) => {
    const data = n.data as { node?: CanvasNode };
    return data.node ? TYPE_STYLES[data.node.type].minimap : "#94a3b8";
  }, []);

  return (
    <div className="relative h-full w-full" data-testid="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={theme}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        deleteKeyCode={["Backspace", "Delete"]}
        connectionRadius={40}
        elevateNodesOnSelect={false}
        fitView
        fitViewOptions={{ maxZoom: 1.2, padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} className="!text-slate-300 dark:!text-slate-700" />
        <Controls className="!shadow-md" showInteractive={false} />
        <MiniMap
          nodeColor={minimapColor}
          className="!rounded-xl !shadow-md"
          maskColor={theme === "dark" ? "rgba(2,6,23,0.7)" : "rgba(241,245,249,0.7)"}
          pannable
          zoomable
        />
      </ReactFlow>
      {doc && <ResizeHandles doc={doc} selection={selection} rects={rects} />}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
