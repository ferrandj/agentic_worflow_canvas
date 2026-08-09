import { describe, it, expect } from "vitest";
import { autoLayout } from "./autoLayout.js";
import { deriveRects, rectsIntersect } from "../model/geometry.js";
import { makeNode, makeDoc } from "../model/testUtils.js";

describe("autoLayout", () => {
  it("separates sibling nodes (no overlaps)", () => {
    const doc = makeDoc(
      [
        makeNode({ id: "a", type: "agent", label: "A" }),
        makeNode({ id: "b", type: "agent", label: "B" }),
        makeNode({ id: "c", type: "agent", label: "C" }),
      ],
      [
        { id: "e1", from: "a", to: "b", label: "" },
        { id: "e2", from: "a", to: "c", label: "" },
      ]
    );
    const laid = autoLayout(doc);
    const rects = [...deriveRects(laid).values()];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsIntersect(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("places sources left of targets (LR)", () => {
    const doc = makeDoc(
      [
        makeNode({ id: "a", type: "person", label: "Src" }),
        makeNode({ id: "b", type: "agent", label: "Dst" }),
      ],
      [{ id: "e", from: "a", to: "b", label: "" }]
    );
    const laid = autoLayout(doc);
    const a = laid.nodes.find((n) => n.id === "a")!;
    const b = laid.nodes.find((n) => n.id === "b")!;
    expect(a.x).toBeLessThan(b.x);
  });

  it("keeps container children inside the derived parent rect", () => {
    const doc = makeDoc(
      [
        makeNode({ id: "g", type: "group", label: "G" }),
        makeNode({ id: "a", type: "agent", label: "A", parent: "g" }),
        makeNode({ id: "b", type: "agent", label: "B", parent: "g" }),
        makeNode({ id: "c", type: "code", label: "C" }),
      ],
      [{ id: "e", from: "a", to: "c", label: "" }]
    );
    const laid = autoLayout(doc);
    const rects = deriveRects(laid);
    const g = rects.get("g")!;
    for (const id of ["a", "b"]) {
      const r = rects.get(id)!;
      expect(r.x).toBeGreaterThanOrEqual(g.x);
      expect(r.y).toBeGreaterThanOrEqual(g.y);
      expect(r.x + r.w).toBeLessThanOrEqual(g.x + g.w);
      expect(r.y + r.h).toBeLessThanOrEqual(g.y + g.h);
    }
  });

  it("handles nested containers and is deterministic", () => {
    const doc = makeDoc(
      [
        makeNode({ id: "outer", type: "platform", label: "Cloud" }),
        makeNode({ id: "inner", type: "group", label: "Team", parent: "outer" }),
        makeNode({ id: "a", type: "agent", label: "A", parent: "inner" }),
        makeNode({ id: "b", type: "agent", label: "B", parent: "inner" }),
        makeNode({ id: "c", type: "code", label: "C", parent: "outer" }),
      ],
      [{ id: "e", from: "a", to: "c", label: "" }]
    );
    const laid1 = autoLayout(doc);
    const laid2 = autoLayout(doc);
    expect(laid1).toEqual(laid2);
    const rects = deriveRects(laid1);
    const outer = rects.get("outer")!;
    const inner = rects.get("inner")!;
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w);
  });

  it("positions empty platforms too", () => {
    const doc = makeDoc([makeNode({ id: "p", type: "platform", label: "Empty" })]);
    const laid = autoLayout(doc);
    const p = laid.nodes[0];
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
