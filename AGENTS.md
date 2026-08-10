# Agent Flow Canvas — Agent Guide

This app is designed to be driven by **both humans (browser UI) and AI agents (REST API)**.
Everything the UI can do, an agent can do headlessly with `curl`.

## What this is

A local diagramming tool for sketching AI-agent workflows (human → orchestrator →
subagents → CI → human review). Canvases are stored as JSON files in a folder you
choose; Mermaid is the exchange format for both import and export.

## Quick start

```bash
npm install
npm run dev      # dev: API server on :4001 + web UI on :5173 (proxies /api)
# or production:
npm run build
npm start        # serves the built UI AND the API on http://127.0.0.1:4001
```

The server binds `127.0.0.1` only. In dev, use port **4001** for API calls; in
production both UI and API are on **4001**.

## Configure the canvas folder (required once)

```bash
curl -s -X PUT http://127.0.0.1:4001/api/config \
  -H 'Content-Type: application/json' \
  -d '{"folder":"~/canvases"}'
```

`~` is expanded server-side. The folder must already exist. The choice is persisted
in `~/.agent-flow-canvas/config.json` (override the config dir with `AFC_CONFIG_DIR`).

## REST API reference

All routes are under `http://127.0.0.1:4001`. Errors return
`{ "error": "<Code>", "message": "...", "details"?: ... }` with a proper HTTP status.

| Route | Description |
|---|---|
| `GET /api/health` | `{ ok: true, version: 2 }` |
| `GET /api/config` | Current `{ folder }` (null if unset) |
| `PUT /api/config` | Set folder: `{ "folder": "/path" }` → 404 if missing, 400 if not a dir |
| `GET /api/canvases` | `[{ name, updatedAt }]` — 409 `NoFolderConfigured` if unset |
| `POST /api/canvases` | Create empty canvas: `{ "name": "x" }` → 201, 409 if exists |
| `GET /api/canvases/:name` | Full canvas JSON → 404 |
| `PUT /api/canvases/:name` | Validate + upsert a full canvas doc → 422 on violations |
| `DELETE /api/canvases/:name` | → 204 |
| `POST /api/canvases/:name/rename` | `{ "newName": "y" }` → 409 if target exists |
| `GET /api/canvases/:name/export/mermaid` | `text/plain` Mermaid |
| `POST /api/import/mermaid` | `{ name, mermaid, overwrite? }` → 201 laid-out canvas, 422 `ParseError` with `details.line` |

Canvas names must match `^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$`.

### Typical agent workflows

**Create a canvas from Mermaid** (positions are computed automatically):

```bash
curl -s -X POST http://127.0.0.1:4001/api/import/mermaid \
  -H 'Content-Type: application/json' \
  -d '{"name":"pipeline","mermaid":"flowchart LR\n  Owner([\"Product Owner\"]) -- ticket --> Orchestrator[\"Orchestrator\"]"}'
```

**Read a canvas to answer questions about it:**

```bash
curl -s http://127.0.0.1:4001/api/canvases/pipeline | jq '.nodes[].label'
```

**Edit programmatically** — GET the doc, modify `nodes`/`edges`, PUT it back:

```bash
doc=$(curl -s http://127.0.0.1:4001/api/canvases/pipeline)
# ... transform $doc (add a node, rewire an edge) ...
curl -s -X PUT http://127.0.0.1:4001/api/canvases/pipeline \
  -H 'Content-Type: application/json' -d "$doc"
```

**Export for docs / PR descriptions:**

```bash
curl -s http://127.0.0.1:4001/api/canvases/pipeline/export/mermaid
```

Concurrent writes (browser autosave + agent PUTs) are atomic and serialized
per-canvas; last write wins. Check `meta.updatedAt` if you need to detect races.

## Canvas JSON schema (version 2)

```jsonc
{
  "version": 2,
  "meta": { "createdAt": "ISO", "updatedAt": "ISO" },   // updatedAt is server-managed
  "nodes": [
    {
      "id": "n_abc123",       // internal id — stable, never appears in Mermaid
      "type": "person",        // person | agent | code | group | platform | note
      "label": "Product Owner",
      "note": "",
      "logo": null,             // Simple Icons slug (platforms only), e.g. "github"
      "parent": null,            // id of enclosing group/platform, or null
      "x": 120, "y": 340,        // ABSOLUTE canvas coordinates
      "pad": null                // group/platform only — see "Free resize" below
    }
  ],
  "edges": [
    {
      "id": "e_x", "from": "n_abc123", "to": "n_def456", "label": "ticket",
      "labelOffset": null       // optional {x,y} drag offset from the default label spot
    }
  ]
}
```

Invariants (the server rejects violations with 422):

- `parent` must reference an existing `group` or `platform`; no containment cycles.
- **A `person` may never be inside a `platform`**, directly or transitively.
- Edge endpoints must exist; node ids must be unique.
- Coordinates are always absolute (never parent-relative). Containers have **no
  required stored size** — their rectangle is derived from their children plus
  padding, so you never need to size a group when editing JSON.
- Groups auto-dissolve when left with 0 or 1 members on the next UI mutation;
  platforms persist even when empty.
- Leaf blocks render at a fixed 176×76; notes at 208×152; an empty platform at 220×110.

**Free resize (`pad`):** a group/platform's frame is always at least the bounding
box of its members plus padding (default `{l:28,t:44,r:28,b:28}`), so it can never
clip a member — but the padding on each side can also be stretched larger (via the
UI's resize handles, or by setting `pad` directly in JSON) to add breathing room.
`pad: null`/absent means "use the default"; a stored `pad` is clamped to a minimum
of 8px per side and otherwise always respected as a floor on top of the derived
minimum.

**Notes (`type: "note"`):** a free-floating sticky annotation with no workflow
semantics — no ports, no containment rules, and it is **left out of Mermaid
export entirely** (along with any edge that would touch one, though the UI never
creates such edges). Its text lives in `label`.

## Mermaid dialect

Export produces (and import accepts) this flowchart subset:

```
flowchart LR
  Product_Owner(["Product Owner"])       %% person  = stadium   (["…"])
  Orchestrator["Orchestrator Agent"]     %% agent   = rectangle ["…"]
  CI_Pipeline[["CI Pipeline"]]           %% code    = subroutine [["…"]]
  subgraph GitHub["GitHub"]              %% group/platform = subgraph (nesting OK)
    CI_Pipeline
  end
  Product_Owner -- ticket --> Orchestrator
  Orchestrator --> CI_Pipeline
  classDef platform stroke:#ef4444,stroke-dasharray: 5 5
  class GitHub platform                  %% marks subgraphs as platforms
  %% afc:logo GitHub=github              %% platform logo directive
```

- **Ids are sanitized real names** (`Product Owner` → `Product_Owner`), never
  internal ids. Duplicate labels get deterministic `_2`, `_3` suffixes.
- Import also accepts `graph` headers, `TD/TB/RL/BT` directions, `a -->|label| b`,
  unquoted labels, bare ids in edges (auto-created as agents), and ignores
  `style`/`classDef`/`direction` lines.
- Unsupported syntax (`-.->`, `==>`, `&` fan-out, other node shapes) fails with a
  line-numbered `ParseError` — nothing is silently dropped.
- Round-trip: labels, types, hierarchy, edges and platform logos survive
  canvas → Mermaid → canvas. Positions, notes and internal ids do not (positions
  are recomputed by auto-layout on import).

## Running tests

```bash
npm test          # unit + API tests (Vitest)
npm run test:e2e  # browser tests (Playwright; hermetic, uses temp folders)
npm run typecheck
```

## Repo map

```
shared/   pure domain logic used by client AND server
  model/      types (zod), geometry (derived container rects), grouping rules, logos
  mermaid/    id sanitization, serializer, parser
  layout/     dagre-based auto-layout for imports
server/   Express API: config, atomic file storage, routes
src/      React UI: React Flow canvas, sidebar, toolbar, inspector, stores
tests/    API tests (supertest) and e2e tests (Playwright)
```
