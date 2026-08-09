import type { CanvasDoc } from "@shared/model/types";

export interface CanvasListing {
  name: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const isText = res.headers.get("content-type")?.includes("text/plain");
  if (!res.ok) {
    let body: { error?: string; message?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body.error ?? "Error", body.message ?? res.statusText, body.details);
  }
  if (res.status === 204) return undefined as T;
  return (isText ? res.text() : res.json()) as Promise<T>;
}

export const api = {
  getConfig: () => req<{ folder: string | null }>("/api/config"),
  setFolder: (folder: string) =>
    req<{ folder: string }>("/api/config", { method: "PUT", body: JSON.stringify({ folder }) }),
  listCanvases: () => req<CanvasListing[]>("/api/canvases"),
  createCanvas: (name: string) =>
    req<CanvasDoc>("/api/canvases", { method: "POST", body: JSON.stringify({ name }) }),
  getCanvas: (name: string) => req<CanvasDoc>(`/api/canvases/${encodeURIComponent(name)}`),
  putCanvas: (name: string, doc: CanvasDoc) =>
    req<CanvasDoc>(`/api/canvases/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify(doc),
    }),
  deleteCanvas: (name: string) =>
    req<void>(`/api/canvases/${encodeURIComponent(name)}`, { method: "DELETE" }),
  renameCanvas: (name: string, newName: string) =>
    req<{ name: string }>(`/api/canvases/${encodeURIComponent(name)}/rename`, {
      method: "POST",
      body: JSON.stringify({ newName }),
    }),
  exportMermaid: (name: string) =>
    req<string>(`/api/canvases/${encodeURIComponent(name)}/export/mermaid`),
  importMermaid: (name: string, mermaid: string, overwrite = false) =>
    req<CanvasDoc>("/api/import/mermaid", {
      method: "POST",
      body: JSON.stringify({ name, mermaid, overwrite }),
    }),
};
