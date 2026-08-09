import { describe, it, expect } from "vitest";
import { sanitizeId, assignIds, escapeLabel } from "./sanitizeId.js";
import { toMermaid } from "./serialize.js";
import { parseMermaid, MermaidParseError } from "./parse.js";
import { makeNode, makeDoc } from "../model/testUtils.js";
import type { CanvasDoc } from "../model/types.js";

describe("sanitizeId", () => {
  it("turns labels into readable ids", () => {
    expect(sanitizeId("Product Owner")).toBe("Product_Owner");
    expect(sanitizeId("CI/CD Pipeline!")).toBe("CI_CD_Pipeline");
    expect(sanitizeId("Café Décor")).toBe("Cafe_Decor");
  });

  it("guards digits, reserved words and empty labels", () => {
    expect(sanitizeId("3rd Stage")).toBe("n_3rd_Stage");
    expect(sanitizeId("end")).toBe("n_end");
    expect(sanitizeId("End")).toBe("n_End");
    expect(sanitizeId("subgraph")).toBe("n_subgraph");
    expect(sanitizeId("!!!")).toBe("n_");
  });

  it("resolves collisions deterministically with _2/_3 suffixes", () => {
    const ids = assignIds([
      { id: "a", label: "Worker" },
      { id: "b", label: "Worker" },
      { id: "c", label: "Worker" },
    ]);
    expect(ids.get("a")).toBe("Worker");
    expect(ids.get("b")).toBe("Worker_2");
    expect(ids.get("c")).toBe("Worker_3");
  });

  it("escapes labels for quoting", () => {
    expect(escapeLabel('Say "hi" [now]')).toBe("Say 'hi' now");
  });
});

describe("toMermaid", () => {
  it("uses real names as ids and correct shapes per type", () => {
    const doc = makeDoc(
      [
        makeNode({ id: "1", type: "person", label: "Product Owner" }),
        makeNode({ id: "2", type: "agent", label: "Orchestrator" }),
        makeNode({ id: "3", type: "code", label: "CI Pipeline" }),
      ],
      [{ id: "e1", from: "1", to: "2", label: "ticket" }]
    );
    const mmd = toMermaid(doc);
    expect(mmd).toContain('Product_Owner(["Product Owner"])');
    expect(mmd).toContain('Orchestrator["Orchestrator"]');
    expect(mmd).toContain('CI_Pipeline[["CI Pipeline"]]');
    expect(mmd).toContain("Product_Owner -- ticket --> Orchestrator");
    expect(mmd).not.toMatch(/\bn_[a-z0-9]{8,}/); // no internal ids leak
  });

  it("emits containers as nested subgraphs and platforms with class + logo lines", () => {
    const doc = makeDoc([
      makeNode({ id: "p", type: "platform", label: "GitHub Cloud", logo: "github" }),
      makeNode({ id: "g", type: "group", label: "Team", parent: "p" }),
      makeNode({ id: "a", type: "agent", label: "Coder", parent: "g" }),
      makeNode({ id: "b", type: "agent", label: "Reviewer", parent: "g" }),
    ]);
    const mmd = toMermaid(doc);
    expect(mmd).toContain('subgraph GitHub_Cloud["GitHub Cloud"]');
    expect(mmd).toContain('subgraph Team["Team"]');
    expect(mmd).toContain("class GitHub_Cloud platform");
    expect(mmd).toContain("%% afc:logo GitHub_Cloud=github");
    // nesting order: Team inside GitHub_Cloud
    expect(mmd.indexOf("subgraph Team")).toBeGreaterThan(mmd.indexOf("subgraph GitHub_Cloud"));
  });
});

describe("parseMermaid", () => {
  it("parses nodes, shapes, edges and labels", () => {
    const doc = parseMermaid(`flowchart LR
  Product_Owner(["Product Owner"])
  Orchestrator["Orchestrator Agent"]
  CI[["CI Pipeline"]]
  Product_Owner -- ticket --> Orchestrator
  Orchestrator --> CI
`);
    expect(doc.nodes).toHaveLength(3);
    const types = Object.fromEntries(doc.nodes.map((n) => [n.label, n.type]));
    expect(types["Product Owner"]).toBe("person");
    expect(types["Orchestrator Agent"]).toBe("agent");
    expect(types["CI Pipeline"]).toBe("code");
    expect(doc.edges).toHaveLength(2);
    expect(doc.edges[0].label).toBe("ticket");
  });

  it("parses the -->|label| edge variant and bare ids", () => {
    const doc = parseMermaid(`flowchart TD
  A -->|does thing| Some_Worker
`);
    expect(doc.edges[0].label).toBe("does thing");
    const worker = doc.nodes.find((n) => n.label === "Some Worker");
    expect(worker).toBeDefined();
    expect(worker!.type).toBe("agent");
  });

  it("parses nested subgraphs with platform class and logo directives", () => {
    const doc = parseMermaid(`flowchart LR
  subgraph Cloud["GitHub Cloud"]
    subgraph Team["Dev Team"]
      Coder["Coder"]
      Reviewer["Reviewer"]
    end
    Runner[["Actions Runner"]]
  end
  classDef platform stroke:#ef4444
  class Cloud platform
  %% afc:logo Cloud=github
`);
    const cloud = doc.nodes.find((n) => n.label === "GitHub Cloud")!;
    const team = doc.nodes.find((n) => n.label === "Dev Team")!;
    const coder = doc.nodes.find((n) => n.label === "Coder")!;
    const runner = doc.nodes.find((n) => n.label === "Actions Runner")!;
    expect(cloud.type).toBe("platform");
    expect(cloud.logo).toBe("github");
    expect(team.type).toBe("group");
    expect(team.parent).toBe(cloud.id);
    expect(coder.parent).toBe(team.id);
    expect(runner.parent).toBe(cloud.id);
  });

  it("accepts graph headers, comments, semicolons, CRLF and ignored statements", () => {
    const doc = parseMermaid(
      "graph LR\r\n%% a comment\r\nA[\"Alpha\"];\r\nstyle A fill:#f9f\r\ndirection LR\r\nA --> B\r\n"
    );
    expect(doc.nodes.map((n) => n.label).sort()).toEqual(["Alpha", "B"]);
  });

  it("errors with line numbers on unsupported syntax", () => {
    expect(() => parseMermaid("flowchart LR\nA -.-> B\n")).toThrowError(MermaidParseError);
    try {
      parseMermaid("flowchart LR\nA -.-> B\n");
    } catch (e) {
      expect((e as MermaidParseError).line).toBe(2);
    }
    expect(() => parseMermaid("flowchart LR\nA --> B & C\n")).toThrowError(/Fan-out/);
    expect(() => parseMermaid("flowchart LR\nA((circle))\n")).toThrowError(/shape/);
    expect(() => parseMermaid("flowchart LR\nsubgraph X\nA --> B\n")).toThrowError(/Unclosed/);
    expect(() => parseMermaid("A --> B\n")).toThrowError(/header/);
  });
});

describe("round-trip", () => {
  const original: CanvasDoc = makeDoc(
    [
      makeNode({ id: "1", type: "person", label: "Product Owner", x: 10, y: 20 }),
      makeNode({ id: "2", type: "agent", label: "Orchestrator", x: 300, y: 20 }),
      makeNode({ id: "p", type: "platform", label: "GitHub", logo: "github", x: 0, y: 0 }),
      makeNode({ id: "3", type: "agent", label: "Coder", parent: "p", x: 600, y: 0 }),
      makeNode({ id: "4", type: "code", label: "CI Pipeline", parent: "p", x: 850, y: 0 }),
    ],
    [
      { id: "e1", from: "1", to: "2", label: "ticket" },
      { id: "e2", from: "2", to: "3", label: "" },
      { id: "e3", from: "3", to: "4", label: "push" },
    ]
  );

  it("canvas -> mermaid -> canvas preserves labels, types, hierarchy, edges, logos", () => {
    const parsed = parseMermaid(toMermaid(original));
    const byLabel = (label: string) => parsed.nodes.find((n) => n.label === label)!;

    expect(parsed.nodes).toHaveLength(original.nodes.length);
    expect(byLabel("Product Owner").type).toBe("person");
    expect(byLabel("GitHub").type).toBe("platform");
    expect(byLabel("GitHub").logo).toBe("github");
    expect(byLabel("Coder").parent).toBe(byLabel("GitHub").id);
    expect(byLabel("CI Pipeline").type).toBe("code");
    expect(parsed.edges).toHaveLength(3);
    expect(parsed.edges.map((e) => e.label).sort()).toEqual(["", "push", "ticket"]);
  });

  it("mermaid -> canvas -> mermaid is idempotent", () => {
    const first = toMermaid(original);
    const second = toMermaid(parseMermaid(first));
    expect(second).toBe(first);
  });

  it("duplicate labels survive via collision suffixes", () => {
    const doc = makeDoc(
      [
        makeNode({ id: "a", type: "agent", label: "Worker" }),
        makeNode({ id: "b", type: "agent", label: "Worker" }),
      ],
      [{ id: "e", from: "a", to: "b", label: "" }]
    );
    const parsed = parseMermaid(toMermaid(doc));
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].from).not.toBe(parsed.edges[0].to);
  });
});
