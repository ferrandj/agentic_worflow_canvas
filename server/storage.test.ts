import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listCanvases,
  readCanvas,
  writeCanvas,
  deleteCanvas,
  renameCanvas,
  StorageError,
} from "./storage.js";
import { emptyDoc } from "../shared/model/types.js";
import { makeNode, makeDoc } from "../shared/model/testUtils.js";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "afc-storage-"));
});

describe("storage CRUD", () => {
  it("writes, lists, reads, renames and deletes canvases", async () => {
    await writeCanvas(folder, "alpha", emptyDoc());
    await writeCanvas(folder, "beta", emptyDoc());

    const list = await listCanvases(folder);
    expect(list.map((c) => c.name)).toEqual(["alpha", "beta"]);

    const doc = await readCanvas(folder, "alpha");
    expect(doc.version).toBe(2);

    await renameCanvas(folder, "alpha", "gamma");
    expect((await listCanvases(folder)).map((c) => c.name)).toEqual(["beta", "gamma"]);

    await deleteCanvas(folder, "beta");
    expect((await listCanvases(folder)).map((c) => c.name)).toEqual(["gamma"]);
  });

  it("bumps updatedAt on write", async () => {
    const doc = emptyDoc();
    doc.meta.updatedAt = "2000-01-01T00:00:00.000Z";
    const written = await writeCanvas(folder, "x", doc);
    expect(written.meta.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it("ignores non-json and hidden files when listing", async () => {
    await writeCanvas(folder, "real", emptyDoc());
    writeFileSync(join(folder, "notes.txt"), "hi");
    writeFileSync(join(folder, ".hidden.json"), "{}");
    const list = await listCanvases(folder);
    expect(list.map((c) => c.name)).toEqual(["real"]);
  });
});

describe("storage safety", () => {
  it("rejects traversal and invalid names", async () => {
    for (const bad of ["../evil", "a/b", "/abs", "..", ".dot", "", "x".repeat(70)]) {
      await expect(writeCanvas(folder, bad, emptyDoc())).rejects.toThrowError(StorageError);
    }
  });

  it("rejects docs violating invariants with 422", async () => {
    const p = makeNode({ id: "p", type: "platform" });
    const h = makeNode({ id: "h", type: "person", parent: "p" });
    const bad = makeDoc([p, h]);
    try {
      await writeCanvas(folder, "bad", bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(StorageError);
      expect((e as StorageError).status).toBe(422);
      expect((e as StorageError).code).toBe("InvariantViolation");
    }
  });

  it("rejects schema garbage with 422", async () => {
    await expect(writeCanvas(folder, "junk", { hello: "world" })).rejects.toMatchObject({
      status: 422,
      code: "InvalidCanvas",
    });
  });

  it("404s on missing canvases", async () => {
    await expect(readCanvas(folder, "ghost")).rejects.toMatchObject({ status: 404 });
    await expect(deleteCanvas(folder, "ghost")).rejects.toMatchObject({ status: 404 });
  });

  it("409s on rename collision", async () => {
    await writeCanvas(folder, "a", emptyDoc());
    await writeCanvas(folder, "b", emptyDoc());
    await expect(renameCanvas(folder, "a", "b")).rejects.toMatchObject({ status: 409 });
  });

  it("leaves no tmp files after writes and serializes concurrent writes", async () => {
    const writes = Array.from({ length: 20 }, (_, i) => {
      const doc = emptyDoc();
      doc.nodes = [makeNode({ id: `n${i}`, type: "agent", label: `v${i}` })];
      return writeCanvas(folder, "contended", doc);
    });
    await Promise.all(writes);

    const files = readdirSync(folder);
    expect(files).toEqual(["contended.json"]);

    // File must be valid JSON matching the schema after the dust settles.
    const final = await readCanvas(folder, "contended");
    expect(final.nodes).toHaveLength(1);
  });
});
