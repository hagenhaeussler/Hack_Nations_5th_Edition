import { FlaskConical, UserRound } from "lucide-react";

import { LogoMark } from "@/components/LogoMark";
import { cn } from "@/lib/utils";

interface RailButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function RailButton({ icon, label, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-text-secondary",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:bg-bg-hover hover:text-text-primary",
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center text-text-tertiary group-hover:text-text-primary">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

interface SidebarRailProps {
  /** Optional handlers — when provided, the corresponding rail button or
   *  the wordmark navigates. */
  onOpenLabSettings?: () => void;
  onOpenPersonalSettings?: () => void;
  onOpenHome?: () => void;
}

/**
 * Implicit sidebar — no panel, no fill.
 * The brand sits in the top-left and the settings entries in the bottom-left
 * of the same warm primary canvas, per the user's design intent.
 */
export function SidebarRail({
  onOpenLabSettings,
  onOpenPersonalSettings,
  onOpenHome,
}: SidebarRailProps = {}) {
  return (
    <>
      {/* Top-left brand — pinned to the viewport so it stays put on
       *  scrollable pages (e.g. Lab Settings overflow). */}
      <header className="pointer-events-none fixed left-6 top-5 z-20 flex items-center gap-2.5 sm:left-8 sm:top-6">
        {onOpenHome ? (
          <button
            type="button"
            onClick={onOpenHome}
            aria-label="Return to LabPilot home"
            className={cn(
              "pointer-events-auto -mx-1 flex items-center gap-2.5 rounded-sm px-1 py-0.5 text-text-primary",
              "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover",
            )}
          >
            <LogoMark size={22} />
            <span className="select-none font-sans text-[16px] font-light tracking-[0.06em] text-text-primary">
              LabPilot
            </span>
          </button>
        ) : (
          <span className="pointer-events-auto flex items-center gap-2.5 text-text-primary">
            <LogoMark size={22} />
            <span className="select-none font-sans text-[16px] font-light tracking-[0.06em] text-text-primary">
              LabPilot
            </span>
          </span>
        )}
      </header>

      {/* Bottom-left settings — pinned to the viewport for the same reason
       *  as the brand wordmark. */}
      <nav
        aria-label="Workspace settings"
        className="fixed bottom-5 left-4 z-20 flex flex-col gap-0.5 sm:bottom-6 sm:left-6"
      >
        <RailButton
          icon={<FlaskConical size={16} strokeWidth={1.5} />}
          label="Lab Settings"
          onClick={onOpenLabSettings}
        />
        <RailButton
          icon={<UserRound size={16} strokeWidth={1.5} />}
          label="Personal Settings"
          onClick={onOpenPersonalSettings}
        />
      </nav>
    </>
  );
}
