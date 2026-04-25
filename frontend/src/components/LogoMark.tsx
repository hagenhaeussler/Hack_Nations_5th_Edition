import { cn } from "@/lib/utils";

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * LabPilot logo mark — a single-weight flask outline.
 * Monochrome by design: inherits `currentColor` from its parent so it sits
 * naturally on any background. No fills, no decorative bubbles.
 */
export function LogoMark({ size = 22, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d="M9 3h6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M10 3v5.6L5.5 17.4A2.6 2.6 0 0 0 7.9 21h8.2a2.6 2.6 0 0 0 2.4-3.6L14 8.6V3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
