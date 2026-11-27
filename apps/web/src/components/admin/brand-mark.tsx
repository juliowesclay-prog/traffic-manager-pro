/** Marca do Traffic Manager Pro para fundo escuro (menu lateral). */
export function BrandMark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <rect width="64" height="64" rx="15" fill="#2F5BFF" />
        <path
          d="M14 44 L26 30 L35 37 L49 20"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="49" cy="20" r="4" fill="#fff" />
      </svg>
      <span className="leading-tight">
        <span className="block font-display text-[0.9375rem] font-semibold text-white">Traffic Manager</span>
        <span className="block text-[0.6875rem] font-medium tracking-[0.06em] text-side-faint uppercase">
          Pro
        </span>
        <span className="sr-only">{name} — painel</span>
      </span>
    </span>
  );
}
