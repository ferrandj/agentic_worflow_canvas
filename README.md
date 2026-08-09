# Agent Flow Canvas

An infinite-canvas diagramming tool purpose-built for sketching AI-agent workflows —
the kind of diagram that shows a human handing a ticket to an orchestrator, which
fans out to subagents, which push into a CI platform, which comes back to a human
reviewer.

It has a fixed vocabulary of block types instead of freeform shapes:

| Type | Meaning | Can contain children? |
|---|---|---|
| **Person** | a human in the loop | No |
| **Agent** | an AI agent / subagent | No |
| **Code** | a script, service, pipeline step | No |
| **Group** | pure visual grouping, no semantics | Yes — anything |
| **Platform** | a tool/runtime agents & code run inside | Yes — agents and code only, never people |

Groups and Platforms only exist as containers: drop a second block onto one and it
becomes a container; drop it back down to 0–1 children and it dissolves (Platforms
are exempt — an empty/single-member platform still persists as a labeled card).

## Using it as a Claude artifact

`src/AgentFlowCanvas.jsx` is a single, self-contained React component (default
export, no relative imports, no npm packages beyond React, Tailwind utility classes
only). Copy its contents directly into a Claude artifact — it should run unmodified.

## Running locally

```bash
npm install
npm run dev
```

This spins up a minimal Vite harness (`index.html` + `src/main.jsx`) purely so the
component can be clicked through in a real browser during development. Tailwind is
loaded via the CDN `<script>` tag in `index.html` (matching how the artifact sandbox
provides it) rather than installed as a build dependency, so styling behaves
identically in both environments.

`npm run build` performs a production build, useful mainly as a fast way to catch
syntax errors — there's no deployment target implied by this repo.

## Data model

Everything (leaf blocks and containers) lives in one flat map, keyed by id:

```js
items = {
  [id]: {
    id, type,      // "human" | "agent" | "code" | "group" | "platform"
    label, note,
    logo,           // Simple Icons slug, platform-only
    x, y,            // absolute world coordinates (leaves only)
    parent,           // id of containing group/platform, or null
    pad,               // {l,t,r,b} padding around children
    collapsed,          // bool — is this container's content hidden?
  }
}
edges = [{ id, from, to, label }]
```

Containers store no size or position — a container's rectangle is derived every
render from the bounding box of its children plus `pad`. Leaf `x`/`y` are absolute
world coordinates, not parent-relative, which is what lets a block move into or out
of a group as a pure data change (`parent` field) rather than a geometry change.

## Interactions

- **Move tool:** drag a block. Drop onto another leaf → both become a new Group.
  Drop onto an existing Group/Platform → it joins. Drag a block far enough past its
  container's edge and it detaches.
- **Connect tool:** tap a block, then tap the target block, to draw an arrow (or
  drag from the port on a block's right edge).
- **Select tool:** tap blocks to toggle them in/out of a multi-selection; drag on
  empty canvas draws a marquee.
- Multi-select + the Group button (or Ctrl/Cmd+G) groups an arbitrary selection.
- A selected container shows 8 resize handles that stretch its padding.
- The eye icon on a container's tab collapses it into a translucent card; arrows
  pointing at now-hidden content re-target the collapsed card automatically.
- Pan: drag empty canvas. Zoom: Ctrl/Cmd+wheel, trackpad pinch, or touch pinch.

## Persistence, export, import

- Auto-saves on a 700ms debounce — to the artifact's `window.storage` when running
  as an artifact, falling back to `localStorage` (and then an in-memory store) when
  running standalone.
- **Export** writes `agent-flow.json`: `{ version, items, edges }`.
- **Import** reads that shape back, or a legacy `{nodes, edges, groups}` shape.
- **Copy as Mermaid** serializes the board to a `flowchart LR` Mermaid diagram
  (containers become `subgraph`s) for pasting into a Markdown doc or PR description.
  This is one-way — Mermaid text can't be re-imported.

## Non-goals

Not a general diagramming tool, not real-time collaborative, not a workflow
*execution* engine — it only draws the shape of a workflow, it doesn't run one.
