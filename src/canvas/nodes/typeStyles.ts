import type { NodeType } from "@shared/model/types";

export interface TypeStyle {
  label: string;
  icon: string;
  card: string;
  chip: string;
  headerText: string;
  minimap: string;
}

export const TYPE_STYLES: Record<NodeType, TypeStyle> = {
  person: {
    label: "Person",
    icon: "👤",
    card: "bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-400/10 dark:border-amber-500/50 dark:text-amber-100",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    headerText: "text-amber-700 dark:text-amber-300",
    minimap: "#f59e0b",
  },
  agent: {
    label: "Agent",
    icon: "✦",
    card: "bg-indigo-50 border-indigo-300 text-indigo-950 dark:bg-indigo-400/10 dark:border-indigo-500/50 dark:text-indigo-100",
    chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200",
    headerText: "text-indigo-700 dark:text-indigo-300",
    minimap: "#6366f1",
  },
  code: {
    label: "Code",
    icon: "{ }",
    card: "bg-teal-50 border-teal-300 text-teal-950 dark:bg-teal-400/10 dark:border-teal-500/50 dark:text-teal-100",
    chip: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200",
    headerText: "text-teal-700 dark:text-teal-300",
    minimap: "#14b8a6",
  },
  group: {
    label: "Group",
    icon: "▣",
    card: "bg-slate-400/5 border-slate-400/60 text-slate-700 dark:bg-slate-400/5 dark:border-slate-500/60 dark:text-slate-200",
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    headerText: "text-slate-600 dark:text-slate-300",
    minimap: "#94a3b8",
  },
  platform: {
    label: "Platform",
    icon: "⬢",
    card: "bg-rose-500/5 border-rose-400/70 text-rose-900 dark:bg-rose-400/5 dark:border-rose-500/60 dark:text-rose-100",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
    headerText: "text-rose-700 dark:text-rose-300",
    minimap: "#f43f5e",
  },
  note: {
    label: "Note",
    icon: "📝",
    card: "bg-yellow-100 border-yellow-300 text-yellow-950 dark:bg-yellow-300/10 dark:border-yellow-400/40 dark:text-yellow-100",
    chip: "bg-yellow-200 text-yellow-900 dark:bg-yellow-400/20 dark:text-yellow-200",
    headerText: "text-yellow-800 dark:text-yellow-300",
    minimap: "#eab308",
  },
};
