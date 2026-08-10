import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type CanvasListing } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/logger";
import { useCanvasStore } from "./store";

const AUTOSAVE_MS = 700;
const LAST_CANVAS_KEY = "afc:lastCanvas";

export function usePersistence() {
  const [folder, setFolder] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<CanvasListing[]>([]);
  const [loadingFolder, setLoadingFolder] = useState(true);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setCanvases(await api.listCanvases());
    } catch (err) {
      if (err instanceof ApiError && err.code === "NoFolderConfigured") setCanvases([]);
      else notifyError("Could not list canvases", err);
    }
  }, []);

  /** Immediately persist the current doc if dirty (used before switching). */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const { doc, canvasName, saveState, markSaved } = useCanvasStore.getState();
    if (!doc || !canvasName || saveState === "clean") return;
    markSaved("saving");
    try {
      const saved = await api.putCanvas(canvasName, doc);
      // Keep the server's updatedAt without clobbering newer local edits.
      const latest = useCanvasStore.getState();
      if (latest.canvasName === canvasName && latest.doc === doc) {
        useCanvasStore.setState({ doc: { ...doc, meta: saved.meta }, saveState: "clean" });
      }
    } catch (err) {
      useCanvasStore.getState().markSaved("error");
      notifyError(err instanceof ApiError ? `Save failed: ${err.message}` : "Save failed", err);
      throw err;
    }
  }, []);

  const openCanvas = useCallback(
    async (name: string) => {
      try {
        await pendingSave.current;
      } catch {
        /* previous save already surfaced its error */
      }
      pendingSave.current = flushSave().catch(() => {});
      await pendingSave.current;
      try {
        const doc = await api.getCanvas(name);
        useCanvasStore.getState().setDoc(doc, name);
        localStorage.setItem(LAST_CANVAS_KEY, name);
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : `Could not open "${name}"`, err);
      }
    },
    [flushSave]
  );

  const configureFolder = useCallback(
    async (path: string) => {
      try {
        const { folder: confirmed } = await api.setFolder(path);
        setFolder(confirmed);
        await refreshList();
        notifySuccess("Canvas folder set");
        return true;
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not set folder", err);
        return false;
      }
    },
    [refreshList]
  );

  const createCanvas = useCallback(
    async (name: string) => {
      try {
        await api.createCanvas(name);
        await refreshList();
        await openCanvas(name);
        return true;
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Could not create canvas", err);
        return false;
      }
    },
    [refreshList, openCanvas]
  );

  const renameCanvas = useCallback(
    async (name: string, newName: string) => {
      try {
        await flushSave().catch(() => {});
        await api.renameCanvas(name, newName);
        const { canvasName } = useCanvasStore.getState();
        if (canvasName === name) {
          useCanvasStore.setState({ canvasName: newName });
          localStorage.setItem(LAST_CANVAS_KEY, newName);
        }
        await refreshList();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Rename failed", err);
      }
    },
    [refreshList, flushSave]
  );

  const deleteCanvas = useCallback(
    async (name: string) => {
      try {
        await api.deleteCanvas(name);
        const { canvasName } = useCanvasStore.getState();
        if (canvasName === name) useCanvasStore.getState().setDoc(null, null);
        await refreshList();
      } catch (err) {
        notifyError(err instanceof ApiError ? err.message : "Delete failed", err);
      }
    },
    [refreshList]
  );

  // Initial load: config -> canvas list -> last-open (or first) canvas.
  useEffect(() => {
    (async () => {
      try {
        const config = await api.getConfig();
        setFolder(config.folder);
        if (config.folder) {
          const list = await api.listCanvases();
          setCanvases(list);
          const last = localStorage.getItem(LAST_CANVAS_KEY);
          const target = list.find((c) => c.name === last)?.name ?? list[0]?.name;
          if (target) await openCanvas(target);
        }
      } catch (err) {
        notifyError("Could not reach the Agent Flow Canvas server", err);
      } finally {
        setLoadingFolder(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave whenever the doc becomes dirty.
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.doc !== prev.doc && state.saveState === "dirty") {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          flushSave().catch(() => {});
        }, AUTOSAVE_MS);
      }
    });
    return () => {
      unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [flushSave]);

  // Flush on tab close.
  useEffect(() => {
    const handler = () => {
      const { doc, canvasName, saveState } = useCanvasStore.getState();
      if (doc && canvasName && saveState !== "clean") {
        navigator.sendBeacon?.(
          `/api/canvases/${encodeURIComponent(canvasName)}`,
          new Blob([JSON.stringify(doc)], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return {
    folder,
    canvases,
    loadingFolder,
    configureFolder,
    refreshList,
    openCanvas,
    createCanvas,
    renameCanvas,
    deleteCanvas,
  };
}
