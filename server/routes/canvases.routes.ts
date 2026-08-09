import { Router } from "express";
import { z } from "zod";
import type { ConfigStore } from "../config.js";
import {
  listCanvases,
  readCanvas,
  writeCanvas,
  deleteCanvas,
  renameCanvas,
  canvasExists,
  validateName,
} from "../storage.js";
import { emptyDoc } from "../../shared/model/types.js";
import { toMermaid } from "../../shared/mermaid/serialize.js";

export function canvasesRoutes(config: ConfigStore): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const folder = config.requireFolder();
      res.json(await listCanvases(folder));
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      const body = z.object({ name: z.string() }).safeParse(req.body);
      if (!body.success) {
        throw { status: 400, code: "BadRequest", message: "Body must be { name: string }" };
      }
      const name = body.data.name;
      validateName(name);
      if (await canvasExists(folder, name)) {
        throw { status: 409, code: "CanvasExists", message: `Canvas "${name}" already exists` };
      }
      const doc = await writeCanvas(folder, name, emptyDoc());
      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:name", async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      res.json(await readCanvas(folder, req.params.name));
    } catch (err) {
      next(err);
    }
  });

  const upsert: import("express").RequestHandler = async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      const doc = await writeCanvas(folder, req.params.name, req.body);
      res.json(doc);
    } catch (err) {
      next(err);
    }
  };
  router.put("/:name", upsert);
  // POST alias so navigator.sendBeacon (which can only POST) can flush saves on tab close.
  router.post("/:name", upsert);

  router.delete("/:name", async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      await deleteCanvas(folder, req.params.name);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post("/:name/rename", async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      const body = z.object({ newName: z.string() }).safeParse(req.body);
      if (!body.success) {
        throw { status: 400, code: "BadRequest", message: "Body must be { newName: string }" };
      }
      await renameCanvas(folder, req.params.name, body.data.newName);
      res.json({ name: body.data.newName });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:name/export/mermaid", async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      const doc = await readCanvas(folder, req.params.name);
      res.type("text/plain").send(toMermaid(doc));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
