import { describe, it, expect } from "vitest";
import { deriveRects, effectivePad, LEAF_W, LEAF_H, NOTE_W, NOTE_H, PAD, MIN_PAD, EMPTY_CONTAINER_W } from "./geometry.js";
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

  it("sizes notes distinctly from other leaves", () => {
    const n = makeNode({ id: "n", type: "note", x: 10, y: 20 });
    const rects = deriveRects(makeDoc([n]));
    expect(rects.get("n")).toEqual({ x: 10, y: 20, w: NOTE_W, h: NOTE_H });
  });

  it("honors a manually stretched pad (free resize, issue #4) on each side independently", () => {
    const g = makeNode({ id: "g", type: "group", pad: { l: 80, t: 90, r: 100, b: 60 } });
    const a = makeNode({ id: "a", type: "agent", parent: "g", x: 100, y: 100 });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 400, y: 300 });
    const r = deriveRects(makeDoc([g, a, b])).get("g")!;
    expect(r.x).toBe(100 - 80);
    expect(r.y).toBe(100 - 90);
    expect(r.w).toBe(400 + LEAF_W - 100 + 80 + 100);
    expect(r.h).toBe(300 + LEAF_H - 100 + 90 + 60);
  });

  it("never shrinks a stretched pad below the auto-hugged minimum as members move apart", () => {
    // Stretch pad, then grow the bounding box past what the pad alone would give —
    // the frame must always be at least the members' bbox + pad, never less.
    const g = makeNode({ id: "g", type: "group", pad: { l: 8, t: 8, r: 8, b: 8 } });
    const a = makeNode({ id: "a", type: "agent", parent: "g", x: 0, y: 0 });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 2000, y: 0 });
    const r = deriveRects(makeDoc([g, a, b])).get("g")!;
    expect(r.w).toBeGreaterThanOrEqual(2000 + LEAF_W);
  });

  it("clamps a corrupt/negative stored pad to the minimum", () => {
    const node = makeNode({ id: "g", type: "group", pad: { l: -50, t: 0, r: 5, b: 1000 } });
    const pad = effectivePad(node);
    expect(pad.l).toBe(MIN_PAD);
    expect(pad.t).toBe(MIN_PAD);
    expect(pad.r).toBe(MIN_PAD);
    expect(pad.b).toBe(1000);
  });

  it("falls back to the default pad when nothing has been stretched", () => {
    const node = makeNode({ id: "g", type: "group" });
    expect(effectivePad(node)).toEqual(PAD);
  });
});
