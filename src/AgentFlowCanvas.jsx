import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";

/* ---------------------------------------------------------------------- */
/* Constants                                                               */
/* ---------------------------------------------------------------------- */

const TYPE_META = {
  human: { label: "Person", swatch: "#f59e0b", bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
  agent: { label: "Agent", swatch: "#6366f1", bg: "#eef2ff", border: "#6366f1", text: "#3730a3" },
  code: { label: "Code", swatch: "#14b8a6", bg: "#f0fdfa", border: "#14b8a6", text: "#115e59" },
  group: { label: "Group", swatch: "#64748b", bg: "#f8fafc", border: "#94a3b8", text: "#334155" },
  platform: { label: "Platform", swatch: "#ef4444", bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
};

const LEAF_W = 176;
const LEAF_H = 74;
const COLLAPSED_W = 190;
const COLLAPSED_H = 64;
const DEFAULT_PAD = { l: 28, t: 44, r: 28, b: 28 };
const DETACH_PX = 34;
const REATTACH_PX = 10;
const STORAGE_KEY = "agent-flow-canvas:v1";
const AUTOSAVE_DEBOUNCE_MS = 700;
const HANAN_CELL_CAP = 12000;

// Simple Icons slugs, grouped for maintainability (flat array at runtime).
const LOGOS = [
  // Atlassian suite
  "jira", "confluence", "trello", "bitbucket", "opsgenie", "statuspage",
  // CI/CD & source control
  "githubactions", "gitlab", "circleci", "jenkins", "travisci", "argo",
  "github", "azuredevops", "teamcity", "spinnaker", "drone", "buildkite",
  // Cloud providers
  "amazonaws", "googlecloud", "microsoftazure", "digitalocean", "linode",
  "cloudflare", "vercel", "netlify", "heroku", "render", "fly",
  // Containers / orchestration
  "docker", "kubernetes", "helm", "terraform", "ansible", "pulumi",
  "vagrant", "packer", "rancher", "openstack",
  // Observability
  "grafana", "prometheus", "datadog", "newrelic", "sentry", "splunk",
  "elastic", "kibana", "pagerduty", "opentelemetry", "honeycomb",
  // Identity / security
  "okta", "auth0", "onepassword", "hashicorpvault", "keycloak",
  "letsencrypt", "cloudflare", "duo",
  // Messaging / collaboration
  "slack", "discord", "microsoftteams", "zoom", "notion", "linear",
  "asana", "airtable", "figma",
  // Databases / data
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "snowflake",
  "apachekafka", "apacheairflow", "dbt", "databricks",
  // AI vendors
  "anthropic", "openai", "googlegemini", "huggingface", "ollama",
  "langchain", "perplexity", "replicate",
  // Package/build tooling
  "npm", "yarn", "webpack", "vite", "gradle", "maven",
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------------------------------------------------------------------- */
/* Storage wrapper: window.storage (artifact sandbox) -> localStorage ->  */
/* in-memory Map, so the same code path works everywhere.                 */
/* ---------------------------------------------------------------------- */

const memoryStore = new Map();

const storage = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
        return await window.storage.get(key);
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem(key);
        return raw != null ? JSON.parse(raw) : null;
      }
    } catch (e) { /* fall through */ }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  async set(key, value) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
        await window.storage.set(key, value);
        return;
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(value));
        return;
      }
    } catch (e) { /* fall through */ }
    memoryStore.set(key, value);
  },
};

/* ---------------------------------------------------------------------- */
/* Geometry helpers                                                        */
/* ---------------------------------------------------------------------- */

const rectContainsPoint = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const rectsIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rectContainsRect = (outer, inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const expandRect = (r, n) => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });
const rectCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ---------------------------------------------------------------------- */
/* Tree / layout                                                           */
/* ---------------------------------------------------------------------- */

function isContainer(item) {
  return item.type === "group" || item.type === "platform";
}

function buildChildrenMap(items) {
  const map = new Map();
  Object.values(items).forEach((it) => {
    if (it.parent) {
      if (!map.has(it.parent)) map.set(it.parent, []);
      map.get(it.parent).push(it.id);
    }
  });
  return map;
}

// Pure function of `items` only (memoized on items reference by caller).
function buildTree(items) {
  const childrenMap = buildChildrenMap(items);
  const rects = new Map();
  const fullRects = new Map(); // bbox rect even for collapsed containers (used to anchor collapsed card position)

  function computeRect(id, visiting) {
    if (rects.has(id)) return rects.get(id);
    const it = items[id];
    if (!it) return null;
    if (visiting.has(id)) return { x: 0, y: 0, w: LEAF_W, h: LEAF_H }; // cycle guard
    visiting.add(id);

    if (isContainer(it)) {
      const kids = childrenMap.get(id) || [];
      let rect;
      if (kids.length === 0) {
        rect = { x: it.x ?? 0, y: it.y ?? 0, w: 200, h: 90 };
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        kids.forEach((kid) => {
          const r = computeRect(kid, visiting);
          if (!r) return;
          minX = Math.min(minX, r.x);
          minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + r.w);
          maxY = Math.max(maxY, r.y + r.h);
        });
        const pad = it.pad || DEFAULT_PAD;
        rect = {
          x: minX - pad.l,
          y: minY - pad.t,
          w: maxX - minX + pad.l + pad.r,
          h: maxY - minY + pad.t + pad.b,
        };
      }
      fullRects.set(id, rect);
      const finalRect = it.collapsed ? { x: rect.x, y: rect.y, w: COLLAPSED_W, h: COLLAPSED_H } : rect;
      rects.set(id, finalRect);
      visiting.delete(id);
      return finalRect;
    } else {
      const rect = { x: it.x ?? 0, y: it.y ?? 0, w: LEAF_W, h: LEAF_H };
      rects.set(id, rect);
      fullRects.set(id, rect);
      visiting.delete(id);
      return rect;
    }
  }

  Object.keys(items).forEach((id) => computeRect(id, new Set()));
  return { rects, fullRects, childrenMap };
}

function ancestorsOf(id, items) {
  const out = [];
  let cur = items[id];
  while (cur && cur.parent) {
    out.push(cur.parent);
    cur = items[cur.parent];
  }
  return out;
}

function isDescendant(candidateAncestorId, id, items) {
  return ancestorsOf(id, items).includes(candidateAncestorId);
}

function isHidden(id, items) {
  // true if any ancestor (excluding self) is collapsed
  return ancestorsOf(id, items).some((aid) => items[aid] && items[aid].collapsed);
}

function nearestCollapsedAncestor(id, items) {
  let cur = items[id];
  while (cur && cur.parent) {
    const p = items[cur.parent];
    if (p && p.collapsed) return p.id;
    cur = p;
  }
  return null;
}

function depthOf(id, items) {
  return ancestorsOf(id, items).length;
}

function hasHuman(idOrIds, items) {
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  const seen = new Set();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const it = items[id];
    if (!it) continue;
    if (it.type === "human") return true;
    Object.values(items).forEach((child) => {
      if (child.parent === id) stack.push(child.id);
    });
  }
  return false;
}

/* ---------------------------------------------------------------------- */
/* cleanup(): fixed-point pass that deletes 0-child groups/platforms and   */
/* dissolves 1-child groups. Platforms are exempt from auto-dissolve.      */
/* ---------------------------------------------------------------------- */

function cleanup(items) {
  let cur = items;
  let changed = true;
  while (changed) {
    changed = false;
    const childrenMap = buildChildrenMap(cur);
    const next = { ...cur };
    for (const it of Object.values(cur)) {
      if (!isContainer(it)) continue;
      if (!next[it.id]) continue; // already removed this pass
      const kids = childrenMap.get(it.id) || [];
      if (kids.length === 0) {
        if (it.type === "platform") continue; // exempt
        delete next[it.id];
        changed = true;
      } else if (kids.length === 1) {
        if (it.type === "platform") continue; // exempt
        const onlyChildId = kids[0];
        if (next[onlyChildId]) {
          next[onlyChildId] = { ...next[onlyChildId], parent: it.parent };
        }
        delete next[it.id];
        changed = true;
      }
    }
    cur = next;
  }
  return cur;
}

/* ---------------------------------------------------------------------- */
/* Reducer                                                                  */
/* ---------------------------------------------------------------------- */

function newGroupItem(type = "group") {
  return {
    id: uid(),
    type,
    label: type === "platform" ? "New Platform" : "Group",
    note: "",
    logo: null,
    parent: null,
    pad: { ...DEFAULT_PAD },
    collapsed: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return { items: action.items, edges: action.edges };

    case "ADD_ITEM": {
      const items = { ...state.items, [action.item.id]: action.item };
      return { ...state, items };
    }

    case "UPDATE_ITEM": {
      const cur = state.items[action.id];
      if (!cur) return state;
      const items = { ...state.items, [action.id]: { ...cur, ...action.patch } };
      return { ...state, items: cleanup(items) };
    }

    case "SET_PAD": {
      const cur = state.items[action.id];
      if (!cur) return state;
      const items = { ...state.items, [action.id]: { ...cur, pad: action.pad } };
      return { ...state, items };
    }

    case "MOVE_BLOCK": {
      const items = { ...state.items };
      action.ids.forEach((id) => {
        const it = items[id];
        if (!it || isContainer(it)) return;
        items[id] = { ...it, x: (it.x ?? 0) + action.dx, y: (it.y ?? 0) + action.dy };
      });
      return { ...state, items };
    }

    case "REPARENT": {
      let items = { ...state.items };
      action.ids.forEach((id) => {
        const it = items[id];
        if (!it) return;
        if (action.newParent && (action.newParent === id || isDescendant(id, action.newParent, items))) return;
        items[id] = { ...it, parent: action.newParent };
      });
      items = cleanup(items);
      return { ...state, items };
    }

    case "WRAP_IN_GROUP": {
      const { aId, bId } = action;
      const a = state.items[aId];
      const b = state.items[bId];
      if (!a || !b) return state;
      const group = newGroupItem("group");
      let items = { ...state.items, [group.id]: group };
      items[aId] = { ...items[aId], parent: group.id };
      items[bId] = { ...items[bId], parent: group.id };
      items = cleanup(items);
      return { ...state, items };
    }

    case "GROUP_SELECTION": {
      const ids = action.ids.filter((id) => state.items[id]);
      if (ids.length === 0) return state;
      // only keep top-level selected ids (drop ids whose ancestor is also selected)
      const topLevel = ids.filter((id) => !ancestorsOf(id, state.items).some((a) => ids.includes(a)));
      const group = newGroupItem("group");
      let items = { ...state.items, [group.id]: group };
      topLevel.forEach((id) => {
        items[id] = { ...items[id], parent: group.id };
      });
      items = cleanup(items);
      return { ...state, items };
    }

    case "UNGROUP": {
      const container = state.items[action.id];
      if (!container || !isContainer(container)) return state;
      let items = { ...state.items };
      Object.values(items)
        .filter((it) => it.parent === action.id)
        .forEach((it) => {
          items[it.id] = { ...it, parent: container.parent };
        });
      delete items[action.id];
      items = cleanup(items);
      return { ...state, items };
    }

    case "DELETE_ITEMS": {
      const toDelete = new Set();
      const stack = [...action.ids];
      while (stack.length) {
        const id = stack.pop();
        if (toDelete.has(id)) continue;
        toDelete.add(id);
        Object.values(state.items).forEach((it) => {
          if (it.parent === id) stack.push(it.id);
        });
      }
      let items = { ...state.items };
      toDelete.forEach((id) => delete items[id]);
      items = cleanup(items);
      const edges = state.edges.filter((e) => !toDelete.has(e.from) && !toDelete.has(e.to));
      return { items, edges };
    }

    case "TOGGLE_COLLAPSE": {
      const it = state.items[action.id];
      if (!it) return state;
      const items = { ...state.items, [action.id]: { ...it, collapsed: !it.collapsed } };
      return { ...state, items };
    }

    case "ADD_EDGE": {
      if (action.from === action.to) return state;
      const exists = state.edges.some((e) => e.from === action.from && e.to === action.to);
      if (exists) return state;
      const edges = [...state.edges, { id: uid(), from: action.from, to: action.to, label: "" }];
      return { ...state, edges };
    }

    case "UPDATE_EDGE": {
      const edges = state.edges.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e));
      return { ...state, edges };
    }

    case "DELETE_EDGE": {
      const edges = state.edges.filter((e) => e.id !== action.id);
      return { ...state, edges };
    }

    case "IMPORT": {
      const items = cleanup(action.items);
      return { items, edges: action.edges };
    }

    default:
      return state;
  }
}

/* ---------------------------------------------------------------------- */
/* Detach / reattach hysteresis                                            */
/*                                                                          */
/* Load-bearing asymmetry: 34px past the FROZEN (drag-start) container      */
/* rect to detach, only 10px back inside it to re-attach. Comparing against */
/* a live-recomputed rect (which shrinks/grows as the dragged child moves)  */
/* reintroduces a flicker bug where nudging a block inside its own group    */
/* visibly resizes the group. Do not "simplify" this to one threshold.      */
/* ---------------------------------------------------------------------- */

function evaluateContainment(pointerWorldPt, frozenContainerRect, currentlyDetached) {
  if (!frozenContainerRect) return currentlyDetached ? "stay-detached" : "stay-attached";
  const outer = expandRect(frozenContainerRect, DETACH_PX);
  const inner = expandRect(frozenContainerRect, -REATTACH_PX);
  const insideOuter = rectContainsPoint(outer, pointerWorldPt.x, pointerWorldPt.y);
  const insideInner = rectContainsPoint(inner, pointerWorldPt.x, pointerWorldPt.y);

  if (!currentlyDetached) {
    // attached: only detach once we go past the outer (34px) boundary
    return insideOuter ? "stay-attached" : "detach";
  } else {
    // detached: only re-attach once back within the inner (10px) boundary
    return insideInner ? "reattach" : "stay-detached";
  }
}

/* ---------------------------------------------------------------------- */
/* Router: A* over a Hanan grid, with straight-line fallback               */
/* ---------------------------------------------------------------------- */

function buildHananGrid(fromRect, toRect, obstacles) {
  const xsSet = new Set();
  const ysSet = new Set();
  [fromRect, toRect, ...obstacles].forEach((r) => {
    xsSet.add(r.x);
    xsSet.add(r.x + r.w);
    ysSet.add(r.y);
    ysSet.add(r.y + r.h);
  });
  const fc = rectCenter(fromRect);
  const tc = rectCenter(toRect);
  xsSet.add(fc.x);
  xsSet.add(tc.x);
  ysSet.add(fc.y);
  ysSet.add(tc.y);
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);
  return { xs, ys };
}

function pointBlocked(x, y, obstacles) {
  return obstacles.some((r) => x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1);
}

function astarRoute(startPt, endPt, grid, obstacles) {
  const { xs, ys } = grid;
  const nx = xs.length, ny = ys.length;
  if (nx * ny > HANAN_CELL_CAP || nx === 0 || ny === 0) return null;

  const idx = (ix, iy) => iy * nx + ix;
  const nearestIdx = (arr, v) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - v);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  const sx = nearestIdx(xs, startPt.x), sy = nearestIdx(ys, startPt.y);
  const ex = nearestIdx(xs, endPt.x), ey = nearestIdx(ys, endPt.y);

  const h = (ix, iy) => Math.abs(xs[ix] - xs[ex]) + Math.abs(ys[iy] - ys[ey]);
  const startKey = idx(sx, sy);
  const endKey = idx(ex, ey);

  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const dirOf = new Map();
  const open = new Map([[startKey, h(sx, sy)]]);
  const closed = new Set();

  const neighbors = (ix, iy) => {
    const out = [];
    if (ix > 0) out.push([ix - 1, iy, "h"]);
    if (ix < nx - 1) out.push([ix + 1, iy, "h"]);
    if (iy > 0) out.push([ix, iy - 1, "v"]);
    if (iy < ny - 1) out.push([ix, iy + 1, "v"]);
    return out;
  };

  let guard = 0;
  while (open.size > 0 && guard++ < HANAN_CELL_CAP) {
    let curKey = null, curF = Infinity;
    for (const [k, f] of open) {
      if (f < curF) { curF = f; curKey = k; }
    }
    if (curKey === null) break;
    if (curKey === endKey) break;
    open.delete(curKey);
    closed.add(curKey);
    const ix = curKey % nx, iy = Math.floor(curKey / nx);

    for (const [nixp, niyp, dir] of neighbors(ix, iy)) {
      const nKey = idx(nixp, niyp);
      if (closed.has(nKey)) continue;
      const midX = (xs[ix] + xs[nixp]) / 2;
      const midY = (ys[iy] + ys[niyp]) / 2;
      if (pointBlocked(midX, midY, obstacles) || pointBlocked(xs[nixp], ys[niyp], obstacles)) continue;
      const stepCost = Math.abs(xs[nixp] - xs[ix]) + Math.abs(ys[niyp] - ys[iy]);
      const turnPenalty = dirOf.get(curKey) && dirOf.get(curKey) !== dir ? 20 : 0;
      const tentativeG = (gScore.get(curKey) ?? Infinity) + stepCost + turnPenalty;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, curKey);
        dirOf.set(nKey, dir);
        open.set(nKey, tentativeG + h(nixp, niyp));
      }
    }
  }

  if (!cameFrom.has(endKey) && startKey !== endKey) return null;

  const path = [];
  let cur = endKey;
  path.push(cur);
  while (cur !== startKey && cameFrom.has(cur)) {
    cur = cameFrom.get(cur);
    path.push(cur);
  }
  path.reverse();
  return path.map((k) => {
    const ix = k % nx, iy = Math.floor(k / nx);
    return { x: xs[ix], y: ys[iy] };
  });
}

function simplifyPath(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const colinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!colinear) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function pathToRoundedD(pts, radius = 8) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const v1 = { x: cur.x - prev.x, y: cur.y - prev.y };
    const v2 = { x: next.x - cur.x, y: next.y - cur.y };
    const len1 = Math.hypot(v1.x, v1.y) || 1;
    const len2 = Math.hypot(v2.x, v2.y) || 1;
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const p1 = { x: cur.x - (v1.x / len1) * r, y: cur.y - (v1.y / len1) * r };
    const p2 = { x: cur.x + (v2.x / len2) * r, y: cur.y + (v2.y / len2) * r };
    d += `L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y} `;
  }
  const last = pts[pts.length - 1];
  d += `L ${last.x} ${last.y}`;
  return d;
}

function edgeEndpointsOnRect(fromRect, toRect) {
  const fc = rectCenter(fromRect), tc = rectCenter(toRect);
  const fromPt = { x: fc.x < tc.x ? fromRect.x + fromRect.w : fromRect.x, y: fc.y };
  const toPt = { x: fc.x < tc.x ? toRect.x : toRect.x + toRect.w, y: tc.y };
  return { fromPt, toPt };
}

function routeEdge(fromRect, toRect, obstacleRects) {
  const { fromPt, toPt } = edgeEndpointsOnRect(fromRect, toRect);
  const pad = 40;
  const bbox = {
    x: Math.min(fromRect.x, toRect.x) - pad,
    y: Math.min(fromRect.y, toRect.y) - pad,
    w: 0, h: 0,
  };
  bbox.w = Math.max(fromRect.x + fromRect.w, toRect.x + toRect.w) + pad - bbox.x;
  bbox.h = Math.max(fromRect.y + fromRect.h, toRect.y + toRect.h) + pad - bbox.y;

  const localObstacles = obstacleRects.filter((r) => rectsIntersect(r, bbox));

  const grid = buildHananGrid(fromRect, toRect, localObstacles);
  const nx = grid.xs.length, ny = grid.ys.length;
  if (nx * ny <= HANAN_CELL_CAP) {
    const raw = astarRoute(fromPt, toPt, grid, localObstacles);
    if (raw && raw.length >= 2) {
      const full = [fromPt, ...raw.slice(1, -1), toPt];
      const simplified = simplifyPath(full);
      return pathToRoundedD(simplified);
    }
  }
  // straight-line fallback
  return pathToRoundedD([fromPt, toPt]);
}

/* ---------------------------------------------------------------------- */
/* Hidden-edge retargeting (derived at render time)                        */
/* ---------------------------------------------------------------------- */

function retargetHiddenEdges(edges, items) {
  return edges.map((e) => {
    const fromHiddenBy = nearestCollapsedAncestor(e.from, items);
    const toHiddenBy = nearestCollapsedAncestor(e.to, items);
    return {
      ...e,
      effectiveFrom: fromHiddenBy || e.from,
      effectiveTo: toHiddenBy || e.to,
    };
  }).filter((e) => e.effectiveFrom !== e.effectiveTo);
}

/* ---------------------------------------------------------------------- */
/* Import / export / Mermaid                                               */
/* ---------------------------------------------------------------------- */

function exportJSON(items, edges) {
  const payload = { version: 1, items, edges };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "agent-flow.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function migrateLegacy(raw) {
  const items = {};
  const idMap = new Map();
  (raw.nodes || []).forEach((n) => {
    const id = n.id || uid();
    idMap.set(n.id, id);
    items[id] = {
      id,
      type: ["human", "agent", "code", "group", "platform"].includes(n.type) ? n.type : "agent",
      label: n.label || n.name || "Untitled",
      note: n.note || "",
      logo: n.logo || null,
      x: n.x ?? 0,
      y: n.y ?? 0,
      parent: null,
      pad: { ...DEFAULT_PAD },
      collapsed: false,
    };
  });
  (raw.groups || []).forEach((g) => {
    const id = g.id || uid();
    idMap.set(g.id, id);
    items[id] = {
      id,
      type: g.type === "platform" ? "platform" : "group",
      label: g.label || g.name || "Group",
      note: g.note || "",
      logo: g.logo || null,
      x: 0, y: 0,
      parent: null,
      pad: { ...DEFAULT_PAD },
      collapsed: false,
    };
    (g.members || g.children || []).forEach((memberId) => {
      const mapped = idMap.get(memberId);
      if (mapped && items[mapped]) items[mapped].parent = id;
    });
  });
  const edges = (raw.edges || []).map((e) => ({
    id: e.id || uid(),
    from: idMap.get(e.from) || e.from,
    to: idMap.get(e.to) || e.to,
    label: e.label || "",
  }));
  return { items, edges };
}

function importJSON(raw) {
  if (raw && raw.version === 1 && raw.items && raw.edges) {
    return { items: raw.items, edges: raw.edges };
  }
  if (raw && (raw.nodes || raw.groups)) {
    return migrateLegacy(raw);
  }
  throw new Error("Unrecognized file format");
}

const MERMAID_SHAPE = {
  human: (id, label) => `${id}(["${label}"])`,
  agent: (id, label) => `${id}["${label}"]`,
  code: (id, label) => `${id}[["${label}"]]`,
};

function sanitizeMermaidText(s) {
  return String(s || "").replace(/"/g, "'").replace(/[\[\]{}]/g, "").replace(/\n/g, " ");
}

function toMermaid(items, edges) {
  const childrenMap = buildChildrenMap(items);
  const lines = ["flowchart LR"];

  function emit(id, indent) {
    const it = items[id];
    if (!it) return;
    const pad = "  ".repeat(indent);
    const label = sanitizeMermaidText(it.label);
    if (isContainer(it)) {
      lines.push(`${pad}subgraph ${id}["${label}"]`);
      (childrenMap.get(id) || []).forEach((cid) => emit(cid, indent + 1));
      lines.push(`${pad}end`);
    } else {
      const shapeFn = MERMAID_SHAPE[it.type] || MERMAID_SHAPE.agent;
      lines.push(`${pad}${shapeFn(id, label)}`);
    }
  }

  Object.values(items)
    .filter((it) => !it.parent)
    .forEach((it) => emit(it.id, 1));

  edges.forEach((e) => {
    if (!items[e.from] || !items[e.to]) return;
    const label = sanitizeMermaidText(e.label);
    lines.push(label ? `  ${e.from} -- ${label} --> ${e.to}` : `  ${e.from} --> ${e.to}`);
  });

  return lines.join("\n");
}

/* ---------------------------------------------------------------------- */
/* Sample seed data                                                        */
/* ---------------------------------------------------------------------- */

function seedItems() {
  const items = {};
  const mk = (type, x, y, label, extra = {}) => {
    const id = uid();
    items[id] = { id, type, label, note: "", logo: null, x, y, parent: null, pad: { ...DEFAULT_PAD }, collapsed: false, ...extra };
    return id;
  };
  const human = mk("human", 40, 200, "Product Owner");
  const orchestrator = mk("agent", 320, 200, "Orchestrator Agent");
  const sub1 = mk("agent", 620, 80, "Coding Subagent");
  const sub2 = mk("agent", 620, 320, "Review Subagent");
  const ci = mk("code", 900, 200, "CI Pipeline");
  const edges = [
    { id: uid(), from: human, to: orchestrator, label: "ticket" },
    { id: uid(), from: orchestrator, to: sub1, label: "" },
    { id: uid(), from: orchestrator, to: sub2, label: "" },
    { id: uid(), from: sub1, to: ci, label: "" },
    { id: uid(), from: sub2, to: ci, label: "" },
  ];
  return { items, edges };
}

/* ---------------------------------------------------------------------- */
/* UI subcomponents                                                        */
/* ---------------------------------------------------------------------- */

function Toolbar({ tool, setTool, onAdd, onGroup, onUngroup, canUngroup, onDelete, canDelete, onExport, onImportClick, onCopyMermaid, mermaidCopied }) {
  const toolBtn = (id, label) => (
    <button
      onClick={() => setTool(id)}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tool === id ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
  const addBtn = (type) => (
    <button
      onClick={() => onAdd(type)}
      className="px-2.5 py-1.5 rounded-md text-xs font-semibold border"
      style={{ borderColor: TYPE_META[type].border, color: TYPE_META[type].text, background: TYPE_META[type].bg }}
    >
      + {TYPE_META[type].label}
    </button>
  );
  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center gap-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm px-3 py-2">
      <div className="flex gap-1">
        {toolBtn("move", "Move")}
        {toolBtn("connect", "Connect")}
        {toolBtn("select", "Select")}
      </div>
      <div className="w-px h-6 bg-slate-200 mx-1" />
      <div className="flex gap-1.5">
        {addBtn("human")}
        {addBtn("agent")}
        {addBtn("code")}
        {addBtn("platform")}
      </div>
      <div className="w-px h-6 bg-slate-200 mx-1" />
      <button onClick={onGroup} className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50">
        Group (⌘G)
      </button>
      <button
        onClick={onUngroup}
        disabled={!canUngroup}
        className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
      >
        Ungroup
      </button>
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-red-300 text-red-600 bg-white hover:bg-red-50 disabled:opacity-40"
      >
        Delete
      </button>
      <div className="flex-1" />
      <button onClick={onExport} className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50">
        Export JSON
      </button>
      <button onClick={onImportClick} className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50">
        Import JSON
      </button>
      <button onClick={onCopyMermaid} className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50">
        {mermaidCopied ? "Copied!" : "Copy as Mermaid"}
      </button>
    </div>
  );
}

function BlockCard({ item, rect, camera, selected, isConnectSource, tool, onPointerDownBlock, onPointerDownPort }) {
  const meta = TYPE_META[item.type];
  const screen = {
    x: rect.x * camera.scale + camera.x,
    y: rect.y * camera.scale + camera.y,
    w: rect.w * camera.scale,
    h: rect.h * camera.scale,
  };
  return (
    <div
      onPointerDown={(e) => onPointerDownBlock(e, item.id)}
      className="absolute rounded-xl border-2 shadow-sm select-none flex flex-col justify-center px-3 py-2"
      style={{
        left: screen.x,
        top: screen.y,
        width: screen.w,
        height: screen.h,
        background: meta.bg,
        borderColor: selected ? "#0f172a" : meta.border,
        boxShadow: selected ? "0 0 0 2px #0f172a55" : isConnectSource ? "0 0 0 2px #0f172a33" : undefined,
        cursor: tool === "move" ? "grab" : tool === "connect" ? "crosshair" : "pointer",
        touchAction: "none",
        transformOrigin: "top left",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: meta.text, opacity: 0.7 }}>
        {meta.label}
      </div>
      <div className="text-sm font-semibold truncate" style={{ color: meta.text }}>
        {item.label}
      </div>
      {item.note ? (
        <div className="text-[11px] truncate" style={{ color: meta.text, opacity: 0.75 }}>
          {item.note}
        </div>
      ) : null}
      {tool === "connect" && (
        <div
          onPointerDown={(e) => onPointerDownPort(e, item.id)}
          className="absolute rounded-full bg-slate-900"
          style={{ right: -7, top: "50%", width: 14, height: 14, transform: "translateY(-50%)", cursor: "crosshair" }}
        />
      )}
    </div>
  );
}

function ContainerFrame({ item, rect, camera, selected, onPointerDownTab, onToggleCollapse }) {
  const meta = TYPE_META[item.type];
  const screen = {
    x: rect.x * camera.scale + camera.x,
    y: rect.y * camera.scale + camera.y,
    w: rect.w * camera.scale,
    h: rect.h * camera.scale,
  };
  return (
    <div
      className="absolute rounded-xl border-2 border-dashed"
      style={{
        left: screen.x,
        top: screen.y,
        width: screen.w,
        height: screen.h,
        borderColor: selected ? "#0f172a" : meta.border,
        background: item.type === "platform" ? "rgba(239,68,68,0.04)" : "rgba(100,116,139,0.04)",
        pointerEvents: "none",
      }}
    >
      <div
        onPointerDown={(e) => onPointerDownTab(e, item.id)}
        className="absolute -top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold shadow-sm border"
        style={{ background: meta.bg, borderColor: meta.border, color: meta.text, pointerEvents: "auto", cursor: "grab", touchAction: "none" }}
      >
        {item.logo && (
          <LogoImg slug={item.logo} size={12} />
        )}
        <span>{item.label}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onToggleCollapse(item.id)}
          className="ml-1 leading-none opacity-70 hover:opacity-100"
          title="Hide content"
        >
          👁
        </button>
      </div>
    </div>
  );
}

function CollapsedCard({ item, rect, camera, selected, hiddenCount, onPointerDownBlock, onDoubleClick }) {
  const meta = TYPE_META[item.type];
  const screen = {
    x: rect.x * camera.scale + camera.x,
    y: rect.y * camera.scale + camera.y,
    w: rect.w * camera.scale,
    h: rect.h * camera.scale,
  };
  return (
    <div
      onPointerDown={(e) => onPointerDownBlock(e, item.id)}
      onDoubleClick={() => onDoubleClick(item.id)}
      className="absolute rounded-xl border-2 border-dashed flex flex-col justify-center px-3 py-2 select-none"
      style={{
        left: screen.x,
        top: screen.y,
        width: screen.w,
        height: screen.h,
        background: meta.bg,
        opacity: 0.75,
        borderColor: selected ? "#0f172a" : meta.border,
        cursor: "pointer",
        touchAction: "none",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: meta.text }}>
        {meta.label} (hidden)
      </div>
      <div className="text-sm font-semibold truncate" style={{ color: meta.text }}>
        {item.label}
      </div>
      <div className="text-[11px]" style={{ color: meta.text, opacity: 0.8 }}>
        {hiddenCount} block{hiddenCount === 1 ? "" : "s"} hidden
      </div>
    </div>
  );
}

function ResizeHandles({ rect, camera, onHandlePointerDown }) {
  const screen = {
    x: rect.x * camera.scale + camera.x,
    y: rect.y * camera.scale + camera.y,
    w: rect.w * camera.scale,
    h: rect.h * camera.scale,
  };
  const positions = [
    ["nw", screen.x, screen.y],
    ["n", screen.x + screen.w / 2, screen.y],
    ["ne", screen.x + screen.w, screen.y],
    ["e", screen.x + screen.w, screen.y + screen.h / 2],
    ["se", screen.x + screen.w, screen.y + screen.h],
    ["s", screen.x + screen.w / 2, screen.y + screen.h],
    ["sw", screen.x, screen.y + screen.h],
    ["w", screen.x, screen.y + screen.h / 2],
  ];
  return (
    <>
      {positions.map(([dir, x, y]) => (
        <div
          key={dir}
          onPointerDown={(e) => onHandlePointerDown(e, dir)}
          className="absolute rounded-full bg-slate-900 border-2 border-white shadow"
          style={{
            left: x - 6,
            top: y - 6,
            width: 12,
            height: 12,
            cursor: `${dir}-resize`,
            touchAction: "none",
            zIndex: 30,
          }}
        />
      ))}
    </>
  );
}

function LogoImg({ slug, size = 16 }) {
  const [failed, setFailed] = useState(false);
  if (!slug || failed) {
    const letters = (slug || "?").slice(0, 2).toUpperCase();
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-slate-700 text-white font-bold"
        style={{ width: size, height: size, fontSize: size * 0.5, lineHeight: 1 }}
      >
        {letters}
      </span>
    );
  }
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}`}
      alt={slug}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

function LogoPicker({ open, onClose, onSelect }) {
  const [q, setQ] = useState("");
  if (!open) return null;
  const filtered = LOGOS.filter((s) => s.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-80 max-h-[70vh] flex flex-col p-3" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tools…"
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm mb-2"
        />
        <div className="overflow-y-auto grid grid-cols-4 gap-2">
          <button
            onClick={() => { onSelect(null); onClose(); }}
            className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-slate-100 text-[10px]"
          >
            <span className="w-6 h-6 rounded-full border border-dashed border-slate-400" />
            none
          </button>
          {filtered.map((slug) => (
            <button
              key={slug}
              onClick={() => { onSelect(slug); onClose(); }}
              className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-slate-100 text-[10px] truncate w-full"
              title={slug}
            >
              <LogoImg slug={slug} size={24} />
              <span className="truncate w-full text-center">{slug}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Inspector({ item, items, onPatch, onDelete, onOpenLogoPicker, onClose }) {
  if (!item) return null;
  const childCount = Object.values(items).filter((it) => it.parent === item.id).length;
  const isLeafType = ["human", "agent", "code"].includes(item.type);
  const canBeHuman = !(childCount > 0);
  return (
    <div className="absolute top-16 right-3 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-md p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-700">Inspector</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
      </div>
      <label className="block text-xs text-slate-500 mb-1">Label</label>
      <input
        value={item.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        className="w-full border border-slate-300 rounded-md px-2 py-1 mb-2 text-sm"
      />
      <label className="block text-xs text-slate-500 mb-1">Note</label>
      <textarea
        value={item.note}
        onChange={(e) => onPatch({ note: e.target.value })}
        rows={2}
        className="w-full border border-slate-300 rounded-md px-2 py-1 mb-2 text-sm"
      />
      {isLeafType && (
        <>
          <label className="block text-xs text-slate-500 mb-1">Type</label>
          <select
            value={item.type}
            onChange={(e) => onPatch({ type: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1 mb-2 text-sm"
          >
            <option value="human" disabled={!canBeHuman}>
              Person {!canBeHuman ? "(has children)" : ""}
            </option>
            <option value="agent">Agent</option>
            <option value="code">Code</option>
          </select>
        </>
      )}
      {item.type === "platform" && (
        <div className="mb-2">
          <label className="block text-xs text-slate-500 mb-1">Logo</label>
          <button
            onClick={onOpenLogoPicker}
            className="w-full flex items-center gap-2 border border-slate-300 rounded-md px-2 py-1.5 hover:bg-slate-50"
          >
            <LogoImg slug={item.logo} size={18} />
            <span className="text-xs text-slate-600">{item.logo || "Choose a logo…"}</span>
          </button>
        </div>
      )}
      <button
        onClick={onDelete}
        className="w-full mt-2 px-2 py-1.5 rounded-md text-xs font-semibold border border-red-300 text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main component                                                          */
/* ---------------------------------------------------------------------- */

export default function AgentFlowCanvas() {
  const [state, dispatch] = useReducer(reducer, null, seedItems);
  const [hydrated, setHydrated] = useState(false);
  const [tool, setTool] = useState("move");
  const [selection, setSelection] = useState(new Set());
  const [camera, setCamera] = useState({ x: 200, y: 150, scale: 1 });
  const [connectDraft, setConnectDraft] = useState(null); // { fromId, pointerScreen }
  const [marquee, setMarquee] = useState(null); // { startWorld, curWorld }
  const [dragPreview, setDragPreview] = useState(null); // { ids: [...], dx, dy }
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [mermaidCopied, setMermaidCopied] = useState(false);

  const surfaceRef = useRef(null);
  const dragStateRef = useRef(null); // mutable drag bookkeeping
  const panStateRef = useRef(null);
  const resizeStateRef = useRef(null);
  const pointersRef = useRef(new Map()); // pointerId -> {x,y} screen, for pinch
  const pinchStateRef = useRef(null);
  const fileInputRef = useRef(null);
  const autosaveTimer = useRef(null);

  const { items, edges } = state;

  /* ---- hydrate from storage on mount ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storage.get(STORAGE_KEY);
      if (cancelled) return;
      if (saved && saved.items && saved.edges) {
        dispatch({ type: "HYDRATE", items: saved.items, edges: saved.edges });
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- debounced autosave ---- */
  useEffect(() => {
    if (!hydrated) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      storage.set(STORAGE_KEY, { items, edges });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(autosaveTimer.current);
  }, [items, edges, hydrated]);

  /* ---- derived layout ---- */
  const previewItems = useMemo(() => {
    if (!dragPreview) return items;
    const next = { ...items };
    dragPreview.ids.forEach((id) => {
      const it = next[id];
      if (!it || isContainer(it)) return;
      next[id] = { ...it, x: it.x + dragPreview.dx, y: it.y + dragPreview.dy };
    });
    return next;
  }, [items, dragPreview]);

  const { rects, childrenMap } = useMemo(() => buildTree(previewItems), [previewItems]);

  const renderIds = useMemo(() => {
    return Object.keys(previewItems).sort((a, b) => depthOf(a, previewItems) - depthOf(b, previewItems));
  }, [previewItems]);

  const obstacleRectsForRouting = useMemo(() => {
    const out = [];
    Object.values(previewItems).forEach((it) => {
      if (isHidden(it.id, previewItems)) return;
      if (!isContainer(it)) out.push(rects.get(it.id));
      else if (it.collapsed) out.push(rects.get(it.id));
    });
    return out.filter(Boolean);
  }, [previewItems, rects]);

  const effectiveEdges = useMemo(() => retargetHiddenEdges(edges, previewItems), [edges, previewItems]);

  const routedPaths = useMemo(() => {
    const map = new Map();
    effectiveEdges.forEach((e) => {
      const fromRect = rects.get(e.effectiveFrom);
      const toRect = rects.get(e.effectiveTo);
      if (!fromRect || !toRect) return;
      const others = obstacleRectsForRouting.filter((r) => r !== fromRect && r !== toRect);
      map.set(e.id, routeEdge(fromRect, toRect, others));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveEdges, rects]);

  /* ---- helpers ---- */
  const screenToWorld = useCallback((sx, sy) => ({
    x: (sx - camera.x) / camera.scale,
    y: (sy - camera.y) / camera.scale,
  }), [camera]);

  const getPointerScreen = (e) => {
    const b = surfaceRef.current.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const hitTestAt = useCallback((worldPt) => {
    // topmost = deepest in tree, iterate render order reversed
    for (let i = renderIds.length - 1; i >= 0; i--) {
      const id = renderIds[i];
      if (isHidden(id, previewItems)) continue;
      const it = previewItems[id];
      if (isContainer(it) && !it.collapsed) continue; // frame is not directly hit-testable (pointer-events:none in DOM anyway)
      const r = rects.get(id);
      if (r && rectContainsPoint(r, worldPt.x, worldPt.y)) return id;
    }
    return null;
  }, [renderIds, previewItems, rects]);

  const selectedContainer = useMemo(() => {
    if (selection.size !== 1) return null;
    const id = [...selection][0];
    const it = items[id];
    return it && isContainer(it) ? it : null;
  }, [selection, items]);

  const inspectorItem = useMemo(() => {
    if (selection.size !== 1) return null;
    return items[[...selection][0]] || null;
  }, [selection, items]);

  /* ---- add block ---- */
  const handleAdd = (type) => {
    const center = screenToWorld(surfaceRef.current.clientWidth / 2, surfaceRef.current.clientHeight / 2);
    const item = {
      id: uid(),
      type,
      label: `New ${TYPE_META[type].label}`,
      note: "",
      logo: null,
      x: center.x - LEAF_W / 2 + (Math.random() * 40 - 20),
      y: center.y - LEAF_H / 2 + (Math.random() * 40 - 20),
      parent: null,
      pad: { ...DEFAULT_PAD },
      collapsed: false,
    };
    if (type === "platform") item.parent = null;
    dispatch({ type: "ADD_ITEM", item });
    setSelection(new Set([item.id]));
  };

  /* ---- pan / zoom ---- */
  const onWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      setCamera((cam) => {
        const b = surfaceRef.current.getBoundingClientRect();
        const px = e.clientX - b.left, py = e.clientY - b.top;
        const newScale = Math.min(3, Math.max(0.15, cam.scale * factor));
        const worldX = (px - cam.x) / cam.scale;
        const worldY = (py - cam.y) / cam.scale;
        return { scale: newScale, x: px - worldX * newScale, y: py - worldY * newScale };
      });
    } else {
      setCamera((cam) => ({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY }));
    }
  };

  /* ---- pointer handling on empty canvas: pan, marquee, pinch ---- */
  const onSurfacePointerDown = (e) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchStateRef.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startScale: camera.scale,
        startCamera: camera,
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      return;
    }
    if (e.target !== surfaceRef.current) return; // only empty-canvas
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getPointerScreen(e);
    const world = screenToWorld(p.x, p.y);
    if (tool === "select") {
      setMarquee({ startWorld: world, curWorld: world });
    } else {
      panStateRef.current = { startScreen: p, startCamera: camera };
      if (tool === "connect") setConnectDraft(null);
      if (tool !== "connect") setSelection(new Set());
    }
  };

  const onSurfacePointerMove = (e) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size === 2 && pinchStateRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const { startDist, startScale, startCamera, mid } = pinchStateRef.current;
      const newScale = Math.min(3, Math.max(0.15, startScale * (dist / (startDist || 1))));
      const b = surfaceRef.current.getBoundingClientRect();
      const px = mid.x - b.left, py = mid.y - b.top;
      const worldX = (px - startCamera.x) / startCamera.scale;
      const worldY = (py - startCamera.y) / startCamera.scale;
      setCamera({ scale: newScale, x: px - worldX * newScale, y: py - worldY * newScale });
      return;
    }
    if (marquee) {
      const p = getPointerScreen(e);
      setMarquee((m) => ({ ...m, curWorld: screenToWorld(p.x, p.y) }));
      return;
    }
    if (panStateRef.current) {
      const p = getPointerScreen(e);
      const { startScreen, startCamera } = panStateRef.current;
      setCamera({ ...startCamera, x: startCamera.x + (p.x - startScreen.x), y: startCamera.y + (p.y - startScreen.y) });
      return;
    }
    if (connectDraft) {
      const p = getPointerScreen(e);
      setConnectDraft((d) => ({ ...d, pointerScreen: p }));
    }
  };

  const onSurfacePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStateRef.current = null;
    if (marquee) {
      const r = {
        x: Math.min(marquee.startWorld.x, marquee.curWorld.x),
        y: Math.min(marquee.startWorld.y, marquee.curWorld.y),
        w: Math.abs(marquee.curWorld.x - marquee.startWorld.x),
        h: Math.abs(marquee.curWorld.y - marquee.startWorld.y),
      };
      const picked = new Set();
      Object.values(previewItems).forEach((it) => {
        if (isHidden(it.id, previewItems)) return;
        const rect = rects.get(it.id);
        if (!rect) return;
        if (isContainer(it) && !it.collapsed) {
          if (rectContainsRect(r, rect)) picked.add(it.id);
        } else {
          if (rectsIntersect(r, rect)) picked.add(it.id);
        }
      });
      setSelection(picked);
      setMarquee(null);
    }
    panStateRef.current = null;
  };

  /* ---- block pointer down: move / connect / select ---- */
  const onPointerDownBlock = (e, id) => {
    e.stopPropagation();
    const p = getPointerScreen(e);
    const world = screenToWorld(p.x, p.y);

    if (tool === "select") {
      setSelection((sel) => {
        const next = new Set(sel);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }

    if (tool === "connect") {
      if (!connectDraft) {
        setConnectDraft({ fromId: id, pointerScreen: p });
      } else if (connectDraft.fromId !== id) {
        dispatch({ type: "ADD_EDGE", from: connectDraft.fromId, to: id });
        setConnectDraft(null);
      } else {
        setConnectDraft(null);
      }
      return;
    }

    // move tool
    e.currentTarget.setPointerCapture(e.pointerId);
    const it = items[id];
    const dragIds = selection.has(id) && selection.size > 1 ? [...selection] : [id];
    setSelection(new Set(dragIds));

    const parentId = it.parent;
    const frozenContainerRect = parentId ? rects.get(parentId) : null;

    dragStateRef.current = {
      ids: dragIds,
      startWorld: world,
      startPositions: Object.fromEntries(dragIds.map((did) => [did, { x: items[did]?.x, y: items[did]?.y }])),
      parentId,
      frozenContainerRect: frozenContainerRect ? { ...frozenContainerRect } : null,
      detached: false,
      pointerId: e.pointerId,
    };
    setDragPreview({ ids: dragIds, dx: 0, dy: 0 });
  };

  const onPointerDownPort = (e, id) => {
    e.stopPropagation();
    const p = getPointerScreen(e);
    setConnectDraft({ fromId: id, pointerScreen: p, fromPort: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerDownTab = (e, id) => {
    e.stopPropagation();
    if (tool !== "move") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getPointerScreen(e);
    const world = screenToWorld(p.x, p.y);
    const it = items[id];
    const parentId = it.parent;
    const frozenContainerRect = parentId ? rects.get(parentId) : null;

    // dragging a container moves all its leaf descendants together
    const leafDescendants = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      Object.values(items).forEach((c) => {
        if (c.parent === cur) {
          if (isContainer(c)) stack.push(c.id); else leafDescendants.push(c.id);
        }
      });
    }
    setSelection(new Set([id]));
    dragStateRef.current = {
      ids: leafDescendants,
      containerId: id,
      startWorld: world,
      parentId,
      frozenContainerRect: frozenContainerRect ? { ...frozenContainerRect } : null,
      detached: false,
      pointerId: e.pointerId,
    };
    setDragPreview({ ids: leafDescendants, dx: 0, dy: 0 });
  };

  const onToggleCollapse = (id) => dispatch({ type: "TOGGLE_COLLAPSE", id });

  /* ---- global pointer move/up for active drag / resize ---- */
  useEffect(() => {
    const onMove = (e) => {
      if (dragStateRef.current) {
        const ds = dragStateRef.current;
        const b = surfaceRef.current.getBoundingClientRect();
        const world = screenToWorld(e.clientX - b.left, e.clientY - b.top);
        const dx = world.x - ds.startWorld.x;
        const dy = world.y - ds.startWorld.y;
        setDragPreview({ ids: ds.ids, dx, dy });

        if (ds.frozenContainerRect) {
          const decision = evaluateContainment(world, ds.frozenContainerRect, ds.detached);
          if (decision === "detach") ds.detached = true;
          if (decision === "reattach") ds.detached = false;
        }
        return;
      }
      if (resizeStateRef.current) {
        const rs = resizeStateRef.current;
        const b = surfaceRef.current.getBoundingClientRect();
        const world = screenToWorld(e.clientX - b.left, e.clientY - b.top);
        const dx = world.x - rs.startWorld.x;
        const dy = world.y - rs.startWorld.y;
        const pad = { ...rs.startPad };
        if (rs.dir.includes("w")) pad.l = Math.max(8, rs.startPad.l - dx);
        if (rs.dir.includes("e")) pad.r = Math.max(8, rs.startPad.r + dx);
        if (rs.dir.includes("n")) pad.t = Math.max(8, rs.startPad.t - dy);
        if (rs.dir.includes("s")) pad.b = Math.max(8, rs.startPad.b + dy);
        dispatch({ type: "SET_PAD", id: rs.id, pad });
      }
    };

    const onUp = (e) => {
      if (dragStateRef.current) {
        const ds = dragStateRef.current;
        const b = surfaceRef.current.getBoundingClientRect();
        const world = screenToWorld(e.clientX - b.left, e.clientY - b.top);
        const dx = world.x - ds.startWorld.x;
        const dy = world.y - ds.startWorld.y;

        const draggedTopId = ds.containerId || ds.ids[0];
        // determine drop target via hit test excluding self/descendants
        const excluded = new Set([draggedTopId, ...ds.ids]);
        let dropTargetId = null;
        for (let i = renderIds.length - 1; i >= 0; i--) {
          const rid = renderIds[i];
          if (excluded.has(rid)) continue;
          if (isDescendant(draggedTopId, rid, items)) continue;
          if (isHidden(rid, items)) continue;
          const r = rects.get(rid);
          if (r && rectContainsPoint(r, world.x, world.y)) { dropTargetId = rid; break; }
        }

        setDragPreview(null);
        dragStateRef.current = null;

        if (dropTargetId) {
          const target = items[dropTargetId];
          const draggedSet = ds.containerId ? [ds.containerId] : ds.ids;
          if (isContainer(target)) {
            if (target.type === "platform" && hasHuman(draggedSet, items)) {
              // blocked: fall back to plain move
              dispatch({ type: "MOVE_BLOCK", ids: ds.ids, dx, dy });
            } else {
              dispatch({ type: "MOVE_BLOCK", ids: ds.ids, dx, dy });
              dispatch({ type: "REPARENT", ids: draggedSet, newParent: dropTargetId });
            }
          } else {
            // dropped on a leaf -> wrap both in a new group (only for single leaf drag)
            if (!ds.containerId && ds.ids.length === 1) {
              // Snap the dragged block beside the target instead of exactly on top of
              // it, so both remain visible once wrapped (their rects would otherwise
              // fully overlap since they'd share identical coordinates).
              const targetRect = rects.get(dropTargetId);
              const draggedId = ds.ids[0];
              dispatch({
                type: "UPDATE_ITEM",
                id: draggedId,
                patch: { x: targetRect.x + targetRect.w + 24, y: targetRect.y },
              });
              dispatch({ type: "WRAP_IN_GROUP", aId: draggedId, bId: dropTargetId });
            } else {
              dispatch({ type: "MOVE_BLOCK", ids: ds.ids, dx, dy });
            }
          }
        } else if (ds.detached && ds.parentId) {
          dispatch({ type: "MOVE_BLOCK", ids: ds.ids, dx, dy });
          const draggedSet = ds.containerId ? [ds.containerId] : ds.ids;
          dispatch({ type: "REPARENT", ids: draggedSet, newParent: null });
        } else {
          dispatch({ type: "MOVE_BLOCK", ids: ds.ids, dx, dy });
        }
      }
      if (resizeStateRef.current) resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, rects, renderIds, screenToWorld]);

  const onHandlePointerDown = (e, dir) => {
    e.stopPropagation();
    if (!selectedContainer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getPointerScreen(e);
    resizeStateRef.current = {
      id: selectedContainer.id,
      dir,
      startWorld: screenToWorld(p.x, p.y),
      startPad: { ...(selectedContainer.pad || DEFAULT_PAD) },
    };
  };

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (selection.size > 0) dispatch({ type: "GROUP_SELECTION", ids: [...selection] });
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selection.size > 0 && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
          dispatch({ type: "DELETE_ITEMS", ids: [...selection] });
          setSelection(new Set());
        }
      }
      if (e.key === "Escape") {
        setConnectDraft(null);
        setSelection(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  /* ---- actions ---- */
  const doGroup = () => selection.size > 0 && dispatch({ type: "GROUP_SELECTION", ids: [...selection] });
  const doUngroup = () => selectedContainer && dispatch({ type: "UNGROUP", id: selectedContainer.id });
  const doDelete = () => {
    if (selection.size === 0) return;
    dispatch({ type: "DELETE_ITEMS", ids: [...selection] });
    setSelection(new Set());
  };

  const doExport = () => exportJSON(items, edges);
  const doImportClick = () => fileInputRef.current?.click();
  const onImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);
        const { items: newItems, edges: newEdges } = importJSON(raw);
        dispatch({ type: "IMPORT", items: newItems, edges: newEdges });
        setSelection(new Set());
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const doCopyMermaid = async () => {
    const text = toMermaid(items, edges);
    try {
      await navigator.clipboard.writeText(text);
      setMermaidCopied(true);
      setTimeout(() => setMermaidCopied(false), 1500);
    } catch {
      window.prompt("Copy Mermaid source:", text);
    }
  };

  /* ---- render ---- */
  const connectDraftFromRect = connectDraft ? rects.get(connectDraft.fromId) : null;

  return (
    <div className="w-full h-full relative bg-slate-50 overflow-hidden" style={{ fontFamily: "system-ui, sans-serif" }}>
      <Toolbar
        tool={tool}
        setTool={setTool}
        onAdd={handleAdd}
        onGroup={doGroup}
        onUngroup={doUngroup}
        canUngroup={!!selectedContainer}
        onDelete={doDelete}
        canDelete={selection.size > 0}
        onExport={doExport}
        onImportClick={doImportClick}
        onCopyMermaid={doCopyMermaid}
        mermaidCopied={mermaidCopied}
      />
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFile} />

      <div
        ref={surfaceRef}
        className="absolute inset-0"
        style={{ touchAction: "none", cursor: tool === "move" ? "default" : tool === "connect" ? "crosshair" : "crosshair" }}
        onWheel={onWheel}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
      >
        {/* Arrow layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#334155" />
            </marker>
          </defs>
          <g transform={`translate(${camera.x},${camera.y}) scale(${camera.scale})`}>
            {effectiveEdges.map((e) => {
              const d = routedPaths.get(e.id);
              if (!d) return null;
              return (
                <g key={e.id}>
                  <path d={d} fill="none" stroke="#334155" strokeWidth={2 / camera.scale} markerEnd="url(#arrowhead)" />
                  {e.label && (() => {
                    const r = rects.get(e.effectiveFrom);
                    const r2 = rects.get(e.effectiveTo);
                    if (!r || !r2) return null;
                    const c1 = rectCenter(r), c2 = rectCenter(r2);
                    return (
                      <text x={(c1.x + c2.x) / 2} y={(c1.y + c2.y) / 2 - 6} fontSize={12 / camera.scale} fill="#334155" textAnchor="middle">
                        {e.label}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
            {connectDraft && connectDraftFromRect && (
              <line
                x1={rectCenter(connectDraftFromRect).x}
                y1={rectCenter(connectDraftFromRect).y}
                x2={connectDraft.pointerScreen ? screenToWorld(connectDraft.pointerScreen.x, connectDraft.pointerScreen.y).x : rectCenter(connectDraftFromRect).x}
                y2={connectDraft.pointerScreen ? screenToWorld(connectDraft.pointerScreen.x, connectDraft.pointerScreen.y).y : rectCenter(connectDraftFromRect).y}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={2 / camera.scale}
              />
            )}
          </g>
        </svg>

        {/* Block layer */}
        {renderIds.map((id) => {
          if (isHidden(id, previewItems)) return null;
          const it = previewItems[id];
          const rect = rects.get(id);
          if (!rect) return null;

          if (isContainer(it) && it.collapsed) {
            const hiddenCount = (function countDesc(pid) {
              let n = 0;
              (childrenMap.get(pid) || []).forEach((cid) => {
                n += 1;
                n += countDesc(cid);
              });
              return n;
            })(id);
            return (
              <CollapsedCard
                key={id}
                item={it}
                rect={rect}
                camera={camera}
                selected={selection.has(id)}
                hiddenCount={hiddenCount}
                onPointerDownBlock={onPointerDownBlock}
                onDoubleClick={onToggleCollapse}
              />
            );
          }
          if (isContainer(it)) {
            return (
              <ContainerFrame
                key={id}
                item={it}
                rect={rect}
                camera={camera}
                selected={selection.has(id)}
                onPointerDownTab={onPointerDownTab}
                onToggleCollapse={onToggleCollapse}
              />
            );
          }
          return (
            <BlockCard
              key={id}
              item={it}
              rect={rect}
              camera={camera}
              selected={selection.has(id)}
              isConnectSource={connectDraft?.fromId === id}
              tool={tool}
              onPointerDownBlock={onPointerDownBlock}
              onPointerDownPort={onPointerDownPort}
            />
          );
        })}

        {selectedContainer && rects.get(selectedContainer.id) && (
          <ResizeHandles rect={rects.get(selectedContainer.id)} camera={camera} onHandlePointerDown={onHandlePointerDown} />
        )}

        {marquee && (() => {
          const r = {
            x: Math.min(marquee.startWorld.x, marquee.curWorld.x),
            y: Math.min(marquee.startWorld.y, marquee.curWorld.y),
            w: Math.abs(marquee.curWorld.x - marquee.startWorld.x),
            h: Math.abs(marquee.curWorld.y - marquee.startWorld.y),
          };
          const screen = { x: r.x * camera.scale + camera.x, y: r.y * camera.scale + camera.y, w: r.w * camera.scale, h: r.h * camera.scale };
          return (
            <div
              className="absolute border-2 border-dashed border-slate-500 bg-slate-500/10 pointer-events-none"
              style={{ left: screen.x, top: screen.y, width: screen.w, height: screen.h }}
            />
          );
        })()}
      </div>

      <Inspector
        item={inspectorItem}
        items={items}
        onPatch={(patch) => inspectorItem && dispatch({ type: "UPDATE_ITEM", id: inspectorItem.id, patch })}
        onDelete={() => {
          if (inspectorItem) {
            dispatch({ type: "DELETE_ITEMS", ids: [inspectorItem.id] });
            setSelection(new Set());
          }
        }}
        onOpenLogoPicker={() => setLogoPickerOpen(true)}
        onClose={() => setSelection(new Set())}
      />

      <LogoPicker
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        onSelect={(slug) => inspectorItem && dispatch({ type: "UPDATE_ITEM", id: inspectorItem.id, patch: { logo: slug } })}
      />
    </div>
  );
}
