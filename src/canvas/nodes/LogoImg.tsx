import { useState } from "react";

/**
 * Simple Icons CDN logo with a lettered-badge fallback. The fallback is a
 * first-class path (offline / unknown slug), not an error state.
 */
export function LogoImg({ slug, size = 16 }: { slug: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!slug || failed) {
    const letters = (slug ?? "?").slice(0, 2).toUpperCase();
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-slate-600 font-bold text-white dark:bg-slate-500"
        style={{ width: size, height: size, fontSize: size * 0.45, lineHeight: 1 }}
      >
        {letters}
      </span>
    );
  }

  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}`}
      alt={slug}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  );
}
