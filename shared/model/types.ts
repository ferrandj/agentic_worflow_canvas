import { z } from "zod";

export const NODE_TYPES = ["person", "agent", "code", "group", "platform"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const CONTAINER_TYPES: readonly NodeType[] = ["group", "platform"];

export const CanvasNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  label: z.string(),
  note: z.string().default(""),
  logo: z.string().nullable().default(null),
  parent: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().default(""),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasDocSchema = z.object({
  version: z.literal(2),
  meta: z
    .object({
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .default(() => ({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
});
export type CanvasDoc = z.infer<typeof CanvasDocSchema>;

export function emptyDoc(): CanvasDoc {
  const now = new Date().toISOString();
  return {
    version: 2,
    meta: { createdAt: now, updatedAt: now },
    nodes: [],
    edges: [],
  };
}

export function isContainerType(type: NodeType): boolean {
  return type === "group" || type === "platform";
}

let uidCounter = 0;
export function uid(prefix = "n"): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${uidCounter.toString(36)}`;
}
