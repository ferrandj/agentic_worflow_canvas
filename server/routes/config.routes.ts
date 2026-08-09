import { Router } from "express";
import { z } from "zod";
import type { ConfigStore } from "../config.js";

export function configRoutes(config: ConfigStore): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(config.read());
  });

  router.put("/", (req, res, next) => {
    try {
      const body = z.object({ folder: z.string().min(1) }).safeParse(req.body);
      if (!body.success) {
        throw { status: 400, code: "BadRequest", message: "Body must be { folder: string }" };
      }
      res.json(config.setFolder(body.data.folder));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
