/** Outlined tile + slash — matches add-mcp.com logo.svg (currentColor). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden className={className}>
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="13"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="M25 46 39 18"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
