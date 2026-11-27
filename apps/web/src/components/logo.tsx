import Link from "next/link";

/** Logomarca; o texto alternativo diz o nome e que leva ao painel. */
export function Logo({
  src,
  name,
  className = "h-12 w-auto sm:h-14",
}: {
  src: string;
  name: string;
  className?: string;
}) {
  return (
    <Link href="/admin" className="inline-flex shrink-0 items-center rounded-lg">
      <img src={src} alt={`${name} — painel`} className={className} width={900} height={302} />
    </Link>
  );
}
