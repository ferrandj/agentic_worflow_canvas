import { useState } from "react";
import { LOGOS } from "@shared/model/logos";
import { LogoImg } from "../canvas/nodes/LogoImg";
import { Modal } from "../toolbar/Modal";

export function LogoPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (slug: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = LOGOS.filter((slug) => slug.includes(query.toLowerCase().trim()));

  return (
    <Modal open={open} onClose={onClose} title="Choose a tool logo">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tools…"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <div className="grid max-h-80 grid-cols-5 gap-1.5 overflow-y-auto">
        <button
          onClick={() => {
            onSelect(null);
            onClose();
          }}
          className="flex flex-col items-center gap-1 rounded-xl p-2 text-[10px] text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-400" />
          none
        </button>
        {filtered.map((slug) => (
          <button
            key={slug}
            title={slug}
            onClick={() => {
              onSelect(slug);
              onClose();
            }}
            className="flex flex-col items-center gap-1 overflow-hidden rounded-xl p-2 text-[10px] text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogoImg slug={slug} size={24} />
            <span className="w-full truncate text-center">{slug}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
