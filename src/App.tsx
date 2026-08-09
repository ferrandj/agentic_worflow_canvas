import { ReactFlowProvider } from "@xyflow/react";
import { Toaster } from "sonner";
import { useTheme } from "./lib/theme";
import { usePersistence } from "./state/usePersistence";
import { useCanvasStore } from "./state/store";
import { FlowCanvas } from "./canvas/FlowCanvas";
import { Sidebar } from "./sidebar/Sidebar";
import { Toolbar } from "./toolbar/Toolbar";
import { Inspector } from "./inspector/Inspector";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const persistence = usePersistence();
  const doc = useCanvasStore((s) => s.doc);

  return (
    <ReactFlowProvider>
      <div className="flex h-full w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Sidebar
          folder={persistence.folder}
          canvases={persistence.canvases}
          loadingFolder={persistence.loadingFolder}
          onSetFolder={persistence.configureFolder}
          onOpen={persistence.openCanvas}
          onCreate={persistence.createCanvas}
          onRename={persistence.renameCanvas}
          onDelete={persistence.deleteCanvas}
        />

        <div className="relative min-w-0 flex-1">
          <Toolbar
            theme={theme}
            toggleTheme={toggleTheme}
            onImported={async (name) => {
              await persistence.refreshList();
              await persistence.openCanvas(name);
            }}
          />

          {doc ? (
            <FlowCanvas theme={theme} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="mb-2 text-4xl">🗺️</div>
                <h1 className="mb-1 text-lg font-bold">Agent Flow Canvas</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {persistence.folder
                    ? "Create or select a canvas in the sidebar to start sketching your agent workflow."
                    : "Set a canvas folder in the sidebar — your diagrams will be saved there as JSON files."}
                </p>
              </div>
            </div>
          )}

          <Inspector />
        </div>

        <Toaster richColors position="bottom-center" theme={theme} />
      </div>
    </ReactFlowProvider>
  );
}
