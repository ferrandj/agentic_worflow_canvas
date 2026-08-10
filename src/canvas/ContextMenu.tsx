import { useEffect, useRef } from "react";
import type { NodeType } from "@shared/model/types";

export interface MenuItem {
  label: string;
  testId?: string;
  danger?: boolean;
  onClick: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", esc);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white/95 py-1 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          data-testid={item.testId}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
            item.danger ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export const ADD_TYPES: { type: NodeType; label: string }[] = [
  { type: "person", label: "Add Person" },
  { type: "agent", label: "Add Agent" },
  { type: "code", label: "Add Code" },
  { type: "platform", label: "Add Platform" },
  { type: "note", label: "Add Note" },
];
