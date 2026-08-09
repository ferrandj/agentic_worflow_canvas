import { describe, it, expect } from "vitest";
import {
  joinContainer,
  wrapInGroup,
  removeFromGroup,
  degroup,
  cleanup,
  hasPerson,
  isDescendant,
  validateDoc,
  GroupingError,
} from "./grouping.js";
import { deriveRects } from "./geometry.js";
import { makeNode, makeDoc } from "./testUtils.js";

describe("joinContainer", () => {
  it("reparents a leaf into a group without touching coordinates", () => {
    const group = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g", x: 10, y: 10 });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 300, y: 10 });
    const c = makeNode({ id: "c", type: "code", x: 900, y: 500 });
    const doc = makeDoc([group, a, b, c]);

    const next = joinContainer(doc, "c", "g");
    const joined = next.nodes.find((n) => n.id === "c")!;
    expect(joined.parent).toBe("g");
    expect(joined.x).toBe(900);
    expect(joined.y).toBe(500);
  });

  it("rejects a person joining a platform", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const person = makeNode({ id: "h", type: "person" });
    const doc = makeDoc([platform, person]);
    expect(() => joinContainer(doc, "h", "p")).toThrowError(GroupingError);
    try {
      joinContainer(doc, "h", "p");
    } catch (e) {
      expect((e as GroupingError).code).toBe("PersonInPlatform");
    }
  });

  it("rejects a group CONTAINING a person joining a platform (deep check)", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const group = makeNode({ id: "g", type: "group" });
    const person = makeNode({ id: "h", type: "person", parent: "g" });
    const agent = makeNode({ id: "a", type: "agent", parent: "g" });
    const doc = makeDoc([platform, group, person, agent]);
    expect(() => joinContainer(doc, "g", "p")).toThrowError(GroupingError);
  });

  it("rejects joining into a group nested inside a platform when dragging a person", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const inner = makeNode({ id: "g", type: "group", parent: "p" });
    const a = makeNode({ id: "a", type: "agent", parent: "g" });
    const b = makeNode({ id: "b", type: "code", parent: "g" });
    const person = makeNode({ id: "h", type: "person" });
    const doc = makeDoc([platform, inner, a, b, person]);
    expect(() => joinContainer(doc, "h", "g")).toThrowError(GroupingError);
  });

  it("prevents cycles: cannot move a container into its own descendant", () => {
    const outer = makeNode({ id: "outer", type: "group" });
    const inner = makeNode({ id: "inner", type: "group", parent: "outer" });
    const a = makeNode({ id: "a", type: "agent", parent: "inner" });
    const b = makeNode({ id: "b", type: "agent", parent: "inner" });
    const c = makeNode({ id: "c", type: "agent", parent: "outer" });
    const doc = makeDoc([outer, inner, a, b, c]);
    expect(() => joinContainer(doc, "outer", "inner")).toThrowError(GroupingError);
  });

  it("allows agents and code into platforms", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const agent = makeNode({ id: "a", type: "agent" });
    const doc = makeDoc([platform, agent]);
    const next = joinContainer(doc, "a", "p");
    expect(next.nodes.find((n) => n.id === "a")!.parent).toBe("p");
  });
});

describe("wrapInGroup", () => {
  it("creates a new group containing both nodes, in the target's parent scope", () => {
    const a = makeNode({ id: "a", type: "agent" });
    const b = makeNode({ id: "b", type: "code" });
    const doc = makeDoc([a, b]);
    const next = wrapInGroup(doc, "a", "b");
    const group = next.nodes.find((n) => n.type === "group")!;
    expect(group).toBeDefined();
    expect(group.parent).toBeNull();
    expect(next.nodes.find((n) => n.id === "a")!.parent).toBe(group.id);
    expect(next.nodes.find((n) => n.id === "b")!.parent).toBe(group.id);
  });

  it("nests the new group when the target is already inside a container", () => {
    const outer = makeNode({ id: "outer", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "outer" });
    const b = makeNode({ id: "b", type: "agent", parent: "outer" });
    const c = makeNode({ id: "c", type: "code" });
    const doc = makeDoc([outer, a, b, c]);
    const next = wrapInGroup(doc, "c", "a");
    const newGroup = next.nodes.find((n) => n.type === "group" && n.id !== "outer")!;
    expect(newGroup.parent).toBe("outer");
    expect(next.nodes.find((n) => n.id === "c")!.parent).toBe(newGroup.id);
  });

  it("parks the dragged node beside the target when their rects overlap", () => {
    const a = makeNode({ id: "a", type: "agent", x: 100, y: 100 });
    const b = makeNode({ id: "b", type: "code", x: 110, y: 105 }); // overlapping
    const doc = makeDoc([a, b]);
    const next = wrapInGroup(doc, "a", "b");
    const movedA = next.nodes.find((n) => n.id === "a")!;
    const stillB = next.nodes.find((n) => n.id === "b")!;
    expect(stillB.x).toBe(110);
    expect(movedA.x).toBeGreaterThanOrEqual(stillB.x + 176); // beside, not on top
    expect(movedA.y).toBe(stillB.y);
  });

  it("rejects wrapping a person with a leaf inside a platform", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const a = makeNode({ id: "a", type: "agent", parent: "p" });
    const b = makeNode({ id: "b", type: "code", parent: "p" });
    const person = makeNode({ id: "h", type: "person" });
    const doc = makeDoc([platform, a, b, person]);
    expect(() => wrapInGroup(doc, "h", "a")).toThrowError(GroupingError);
  });
});

describe("removeFromGroup", () => {
  it("reparents to the grandparent and relocates below the former group", () => {
    const group = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g", x: 0, y: 0 });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 250, y: 0 });
    const c = makeNode({ id: "c", type: "code", parent: "g", x: 500, y: 0 });
    const doc = makeDoc([group, a, b, c]);
    const rectsBefore = deriveRects(doc);
    const groupRect = rectsBefore.get("g")!;

    const next = removeFromGroup(doc, "a");
    const removed = next.nodes.find((n) => n.id === "a")!;
    expect(removed.parent).toBeNull();
    expect(removed.y).toBeGreaterThanOrEqual(groupRect.y + groupRect.h);
  });

  it("auto-dissolves the group when removal leaves one member", () => {
    const group = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g" });
    const b = makeNode({ id: "b", type: "agent", parent: "g", x: 250 });
    const doc = makeDoc([group, a, b]);
    const next = removeFromGroup(doc, "a");
    expect(next.nodes.find((n) => n.id === "g")).toBeUndefined();
    expect(next.nodes.find((n) => n.id === "b")!.parent).toBeNull();
  });

  it("moves a whole subtree when removing a nested group", () => {
    const outer = makeNode({ id: "outer", type: "group" });
    const inner = makeNode({ id: "inner", type: "group", parent: "outer" });
    const a = makeNode({ id: "a", type: "agent", parent: "inner", x: 0, y: 0 });
    const b = makeNode({ id: "b", type: "agent", parent: "inner", x: 250, y: 0 });
    const c = makeNode({ id: "c", type: "agent", parent: "outer", x: 600, y: 0 });
    const d = makeNode({ id: "d", type: "agent", parent: "outer", x: 900, y: 0 });
    const doc = makeDoc([outer, inner, a, b, c, d]);
    const next = removeFromGroup(doc, "inner");
    const innerAfter = next.nodes.find((n) => n.id === "inner")!;
    expect(innerAfter.parent).toBeNull();
    // children moved with it
    const aAfter = next.nodes.find((n) => n.id === "a")!;
    const bAfter = next.nodes.find((n) => n.id === "b")!;
    expect(bAfter.x - aAfter.x).toBe(250);
    expect(aAfter.parent).toBe("inner");
  });

  it("is a no-op for a root node", () => {
    const a = makeNode({ id: "a", type: "agent" });
    const doc = makeDoc([a]);
    expect(removeFromGroup(doc, "a")).toBe(doc);
  });

  it("keeps a platform alive when removal leaves one member (exemption)", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const a = makeNode({ id: "a", type: "agent", parent: "p" });
    const b = makeNode({ id: "b", type: "agent", parent: "p", x: 250 });
    const doc = makeDoc([platform, a, b]);
    const next = removeFromGroup(doc, "a");
    expect(next.nodes.find((n) => n.id === "p")).toBeDefined();
    expect(next.nodes.find((n) => n.id === "b")!.parent).toBe("p");
  });
});

describe("degroup", () => {
  it("dissolves a group, reparenting children to its parent", () => {
    const outer = makeNode({ id: "outer", type: "group" });
    const inner = makeNode({ id: "inner", type: "group", parent: "outer" });
    const a = makeNode({ id: "a", type: "agent", parent: "inner" });
    const b = makeNode({ id: "b", type: "agent", parent: "inner", x: 250 });
    const c = makeNode({ id: "c", type: "agent", parent: "outer", x: 600 });
    const doc = makeDoc([outer, inner, a, b, c]);
    const next = degroup(doc, "inner");
    expect(next.nodes.find((n) => n.id === "inner")).toBeUndefined();
    expect(next.nodes.find((n) => n.id === "a")!.parent).toBe("outer");
    expect(next.nodes.find((n) => n.id === "b")!.parent).toBe("outer");
  });

  it("works on platforms (explicit action)", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const a = makeNode({ id: "a", type: "agent", parent: "p" });
    const b = makeNode({ id: "b", type: "code", parent: "p", x: 250 });
    const doc = makeDoc([platform, a, b]);
    const next = degroup(doc, "p");
    expect(next.nodes.find((n) => n.id === "p")).toBeUndefined();
    expect(next.nodes.find((n) => n.id === "a")!.parent).toBeNull();
  });
});

describe("cleanup", () => {
  it("deletes empty groups", () => {
    const group = makeNode({ id: "g", type: "group" });
    const doc = makeDoc([group]);
    expect(cleanup(doc).nodes).toHaveLength(0);
  });

  it("dissolves single-member groups", () => {
    const group = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g" });
    const doc = makeDoc([group, a]);
    const next = cleanup(doc);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0].parent).toBeNull();
  });

  it("keeps empty and single-member platforms (exemption)", () => {
    const platform = makeNode({ id: "p", type: "platform" });
    const single = makeNode({ id: "p2", type: "platform" });
    const a = makeNode({ id: "a", type: "agent", parent: "p2" });
    const doc = makeDoc([platform, single, a]);
    const next = cleanup(doc);
    expect(next.nodes).toHaveLength(3);
  });

  it("cascades to a fixed point: dissolving inner can dissolve outer", () => {
    // outer contains inner + x; inner contains only a.
    // inner dissolves -> a joins outer -> outer has {a, x} = fine.
    // But if outer contained ONLY inner, and inner only a: both dissolve.
    const outer = makeNode({ id: "outer", type: "group" });
    const inner = makeNode({ id: "inner", type: "group", parent: "outer" });
    const a = makeNode({ id: "a", type: "agent", parent: "inner" });
    const doc = makeDoc([outer, inner, a]);
    const next = cleanup(doc);
    expect(next.nodes).toHaveLength(1);
    expect(next.nodes[0].id).toBe("a");
    expect(next.nodes[0].parent).toBeNull();
  });
});

describe("hasPerson / isDescendant", () => {
  it("finds a person nested several levels deep", () => {
    const g1 = makeNode({ id: "g1", type: "group" });
    const g2 = makeNode({ id: "g2", type: "group", parent: "g1" });
    const person = makeNode({ id: "h", type: "person", parent: "g2" });
    const a = makeNode({ id: "a", type: "agent", parent: "g2" });
    const b = makeNode({ id: "b", type: "agent", parent: "g1" });
    const doc = makeDoc([g1, g2, person, a, b]);
    expect(hasPerson(doc, "g1")).toBe(true);
    expect(hasPerson(doc, "a")).toBe(false);
    expect(isDescendant(doc, "g1", "h")).toBe(true);
    expect(isDescendant(doc, "g2", "b")).toBe(false);
  });
});

describe("validateDoc", () => {
  it("accepts a valid doc", () => {
    const g = makeNode({ id: "g", type: "group" });
    const a = makeNode({ id: "a", type: "agent", parent: "g" });
    const b = makeNode({ id: "b", type: "code", parent: "g" });
    const doc = makeDoc([g, a, b], [{ id: "e1", from: "a", to: "b", label: "" }]);
    expect(validateDoc(doc)).toHaveLength(0);
  });

  it("flags person-in-platform transitively", () => {
    const p = makeNode({ id: "p", type: "platform" });
    const g = makeNode({ id: "g", type: "group", parent: "p" });
    const h = makeNode({ id: "h", type: "person", parent: "g" });
    const a = makeNode({ id: "a", type: "agent", parent: "g" });
    const doc = makeDoc([p, g, h, a]);
    const issues = validateDoc(doc);
    expect(issues.some((i) => i.code === "PersonInPlatform")).toBe(true);
  });

  it("flags missing parents, non-container parents, dangling edges, duplicate ids", () => {
    const a = makeNode({ id: "a", type: "agent", parent: "nope" });
    const b = makeNode({ id: "b", type: "code", parent: "a" });
    const dup = makeNode({ id: "a", type: "agent" });
    const doc = makeDoc([a, b, dup], [{ id: "e", from: "a", to: "ghost", label: "" }]);
    const codes = validateDoc(doc).map((i) => i.code);
    expect(codes).toContain("MissingParent");
    expect(codes).toContain("ParentNotContainer");
    expect(codes).toContain("DanglingEdge");
    expect(codes).toContain("DuplicateNodeId");
  });
});
