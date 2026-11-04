import Link from "next/link";
import { texts } from "@/lib/texts";

// Symbole : trois nœuds reliés par des traits fins (connaissances reliées), monochrome, à trait.
function LogoMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M6.5 16.5 11 7.5M13 7.5l4.5 9M7.5 18h9" />
      <circle cx="12" cy="5.5" r="2.25" />
      <circle cx="5.5" cy="18" r="2.25" />
      <circle cx="18.5" cy="18" r="2.25" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-md text-base font-semibold text-primary">
      <LogoMark />
      <span>{texts.app.name}</span>
    </Link>
  );
}
