import { Router } from "express";
import { z } from "zod";
import type { ConfigStore } from "../config.js";
import { writeCanvas, canvasExists, validateName } from "../storage.js";
import { parseMermaid, MermaidParseError } from "../../shared/mermaid/parse.js";
import { autoLayout } from "../../shared/layout/autoLayout.js";

export function mermaidRoutes(config: ConfigStore): Router {
  const router = Router();

  router.post("/mermaid", async (req, res, next) => {
    try {
      const folder = config.requireFolder();
      const body = z
        .object({
          name: z.string(),
          mermaid: z.string().min(1),
          overwrite: z.boolean().optional().default(false),
        })
        .safeParse(req.body);
      if (!body.success) {
        throw {
          status: 400,
          code: "BadRequest",
          message: "Body must be { name: string, mermaid: string, overwrite?: boolean }",
        };
      }
      const { name, mermaid, overwrite } = body.data;
      validateName(name);
      if (!overwrite && (await canvasExists(folder, name))) {
        throw {
          status: 409,
          code: "CanvasExists",
          message: `Canvas "${name}" already exists (pass overwrite: true to replace)`,
        };
      }

      let doc;
      try {
        doc = autoLayout(parseMermaid(mermaid));
      } catch (err) {
        if (err instanceof MermaidParseError) {
          throw { status: 422, code: "ParseError", message: err.message, details: { line: err.line } };
        }
        throw err;
      }

      // writeCanvas validates invariants (incl. person-in-platform) -> 422
      const saved = await writeCanvas(folder, name, doc);
      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
