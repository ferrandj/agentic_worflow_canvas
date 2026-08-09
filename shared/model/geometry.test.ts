import { describe, it, expect } from "vitest";
import { deriveRects, LEAF_W, LEAF_H, PAD, EMPTY_CONTAINER_W } from "./geometry.js";
import { makeNode, makeDoc } from "./testUtils.js";

describe("deriveRects", () => {
  it("gives leaves their fixed size at stored coordinates", () => {
    const a = makeNode({ id: "a", type: "agent", x: 100, y: 200 });
    const rects = deriveRects(makeDoc([a]));
    expect(rects.get("a")).toEqual({ x: 100, y: 200, w: LEAF_W, h: LEAF_H });
  });

  it("derives a container rect as children bbox + padding", () => {
    const g = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g", x: 100, y: 100 });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 400, y: 300 });
    const rects = deriveRects(makeDoc([g, a, b]));
    const r = rects.get("g")!;
    expect(r.x).toBe(100 - PAD.l);
    expect(r.y).toBe(100 - PAD.t);
    expect(r.w).toBe(400 + LEAF_W - 100 + PAD.l + PAD.r);
    expect(r.h).toBe(300 + LEAF_H - 100 + PAD.t + PAD.b);
  });

  it("uses the inner derived rect for nested containers", () => {
    const outer = makeNode({ id: "outer", type: "group" });
    const inner = makeNode({ id: "inner", type: "group", parent: "outer" });
    const a = makeNode({ id: "a", type: "agent", parent: "inner", x: 0, y: 0 });
    const b = makeNode({ id: "b", type: "agent", parent: "inner", x: 300, y: 0 });
    const c = makeNode({ id: "c", type: "agent", parent: "outer", x: 800, y: 0 });
    const rects = deriveRects(makeDoc([outer, inner, a, b, c]));
    const innerRect = rects.get("inner")!;
    const outerRect = rects.get("outer")!;
    expect(outerRect.x).toBe(innerRect.x - PAD.l);
    // outer must fully contain inner
    expect(outerRect.x).toBeLessThanOrEqual(innerRect.x);
    expect(outerRect.x + outerRect.w).toBeGreaterThanOrEqual(innerRect.x + innerRect.w);
  });

  it("gives an empty container a fixed rect at its stored position", () => {
    const p = makeNode({ id: "p", type: "platform", x: 50, y: 60 });
    const rects = deriveRects(makeDoc([p]));
    expect(rects.get("p")!.x).toBe(50);
    expect(rects.get("p")!.w).toBe(EMPTY_CONTAINER_W);
  });

  it("is deterministic under child order changes", () => {
    const g = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g", x: 0, y: 0 });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 500, y: 400 });
    const r1 = deriveRects(makeDoc([g, a, b])).get("g");
    const r2 = deriveRects(makeDoc([b, g, a])).get("g");
    expect(r1).toEqual(r2);
  });

  it("survives a containment cycle without hanging", () => {
    const g1 = makeNode({ id: "g1", type: "group", parent: "g2" });
    const g2 = makeNode({ id: "g2", type: "group", parent: "g1" });
    const rects = deriveRects(makeDoc([g1, g2]));
    expect(rects.get("g1")).toBeDefined();
    expect(rects.get("g2")).toBeDefined();
  });
});
