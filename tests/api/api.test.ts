import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../../server/app.js";
import { emptyDoc, uid } from "../../shared/model/types.js";
import type { CanvasDoc } from "../../shared/model/types.js";

let app: ReturnType<typeof buildApp>;
let canvasFolder: string;

beforeEach(async () => {
  const configDir = mkdtempSync(join(tmpdir(), "afc-api-config-"));
  canvasFolder = mkdtempSync(join(tmpdir(), "afc-api-canvases-"));
  app = buildApp({ configDir });
  await request(app).put("/api/config").send({ folder: canvasFolder }).expect(200);
});

describe("config", () => {
  it("round-trips the folder and rejects bad folders", async () => {
    const res = await request(app).get("/api/config").expect(200);
    expect(res.body.folder).toBe(canvasFolder);

    await request(app)
      .put("/api/config")
      .send({ folder: "/definitely/not/here-" + Date.now() })
      .expect(404);
    await request(app).put("/api/config").send({}).expect(400);
  });

  it("409s on canvas routes when no folder is configured", async () => {
    const freshApp = buildApp({ configDir: mkdtempSync(join(tmpdir(), "afc-api-nofolder-")) });
    const res = await request(freshApp).get("/api/canvases").expect(409);
    expect(res.body.error).toBe("NoFolderConfigured");
  });
});

describe("canvases CRUD", () => {
  it("full lifecycle: create, list, read, update, rename, delete", async () => {
    await request(app).post("/api/canvases").send({ name: "pipeline" }).expect(201);

    const list = await request(app).get("/api/canvases").expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["pipeline"]);

    const doc: CanvasDoc = (await request(app).get("/api/canvases/pipeline").expect(200)).body;
    doc.nodes.push({
      id: uid(),
      type: "agent",
      label: "Orchestrator",
      note: "",
      logo: null,
      parent: null,
      x: 100,
      y: 100,
    });
    const updated = await request(app).put("/api/canvases/pipeline").send(doc).expect(200);
    expect(updated.body.nodes).toHaveLength(1);

    await request(app)
      .post("/api/canvases/pipeline/rename")
      .send({ newName: "pipeline v2" })
      .expect(200);
    await request(app).get("/api/canvases/pipeline").expect(404);
    await request(app).get("/api/canvases/pipeline v2").expect(200);

    await request(app).delete("/api/canvases/pipeline v2").expect(204);
    await request(app).get("/api/canvases/pipeline v2").expect(404);
  });

  it("409s on duplicate create, 400s on bad names", async () => {
    await request(app).post("/api/canvases").send({ name: "dup" }).expect(201);
    await request(app).post("/api/canvases").send({ name: "dup" }).expect(409);
    await request(app).post("/api/canvases").send({ name: "../evil" }).expect(400);
  });

  it("422s on invariant-violating docs (person inside platform)", async () => {
    await request(app).post("/api/canvases").send({ name: "bad" }).expect(201);
    const doc = emptyDoc();
    doc.nodes = [
      { id: "p", type: "platform", label: "AWS", note: "", logo: null, parent: null, x: 0, y: 0 },
      { id: "h", type: "person", label: "Bob", note: "", logo: null, parent: "p", x: 0, y: 0 },
      { id: "a", type: "agent", label: "A", note: "", logo: null, parent: "p", x: 200, y: 0 },
    ];
    const res = await request(app).put("/api/canvases/bad").send(doc).expect(422);
    expect(res.body.error).toBe("InvariantViolation");
    expect(JSON.stringify(res.body.details)).toContain("PersonInPlatform");
  });

  it("422s on schema garbage", async () => {
    await request(app).put("/api/canvases/junk").send({ nope: 1 }).expect(422);
  });
});

describe("mermaid endpoints", () => {
  const mermaid = `flowchart LR
  Product_Owner(["Product Owner"])
  subgraph GitHub["GitHub"]
    Coder["Coder Agent"]
    CI[["CI Pipeline"]]
  end
  Product_Owner -- ticket --> Coder
  Coder --> CI
  classDef platform stroke:#ef4444
  class GitHub platform
  %% afc:logo GitHub=github
`;

  it("imports mermaid into a laid-out canvas", async () => {
    const res = await request(app)
      .post("/api/import/mermaid")
      .send({ name: "imported", mermaid })
      .expect(201);
    const doc: CanvasDoc = res.body;
    expect(doc.nodes).toHaveLength(4);
    const github = doc.nodes.find((n) => n.label === "GitHub")!;
    expect(github.type).toBe("platform");
    expect(github.logo).toBe("github");
    // Auto-layout assigned real positions
    const xs = new Set(doc.nodes.map((n) => `${n.x},${n.y}`));
    expect(xs.size).toBe(doc.nodes.length);
  });

  it("exports mermaid with real-name ids", async () => {
    await request(app).post("/api/import/mermaid").send({ name: "roundtrip", mermaid }).expect(201);
    const res = await request(app).get("/api/canvases/roundtrip/export/mermaid").expect(200);
    expect(res.text).toContain('Product_Owner(["Product Owner"])');
    expect(res.text).toContain("class GitHub platform");
    expect(res.text).toContain("%% afc:logo GitHub=github");
  });

  it("respects the overwrite flag", async () => {
    await request(app).post("/api/import/mermaid").send({ name: "twice", mermaid }).expect(201);
    await request(app).post("/api/import/mermaid").send({ name: "twice", mermaid }).expect(409);
    await request(app)
      .post("/api/import/mermaid")
      .send({ name: "twice", mermaid, overwrite: true })
      .expect(201);
  });

  it("422s with a line number on parse errors", async () => {
    const res = await request(app)
      .post("/api/import/mermaid")
      .send({ name: "broken", mermaid: "flowchart LR\nA -.-> B\n" })
      .expect(422);
    expect(res.body.error).toBe("ParseError");
    expect(res.body.details.line).toBe(2);
  });

  it("422s when imported mermaid puts a person inside a platform", async () => {
    const bad = `flowchart LR
  subgraph AWS["AWS"]
    Bob(["Bob"])
    A["Agent"]
  end
  classDef platform stroke:#ef4444
  class AWS platform
`;
    const res = await request(app)
      .post("/api/import/mermaid")
      .send({ name: "badimport", mermaid: bad })
      .expect(422);
    expect(JSON.stringify(res.body)).toContain("PersonInPlatform");
  });
});
