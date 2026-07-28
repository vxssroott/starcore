export function StarLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id="sc-g" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="var(--gold-soft)" />
          <stop offset="0.5" stopColor="var(--gold)" />
          <stop offset="1" stopColor="var(--gold-deep)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2 L19 12 L29 13 L21.5 19 L24 29 L16 23.5 L8 29 L10.5 19 L3 13 L13 12 Z"
        fill="url(#sc-g)"
      />
      <circle cx="16" cy="16" r="3" fill="oklch(0.13 0.005 60)" />
    </svg>
  );
}
