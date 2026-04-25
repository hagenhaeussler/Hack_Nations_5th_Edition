import {
  BookMarked,
  ChartColumn,
  FlaskConical,
  GitFork,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { LogoMark } from "@/components/LogoMark";
import { cn } from "@/lib/utils";

export type WorkspaceSection = "graph" | "statistics" | "literature";

interface WorkspaceSidebarProps {
  active: WorkspaceSection;
  onSelect?: (section: WorkspaceSection) => void;
  /** Optional handlers — when provided, the matching button navigates. */
  onOpenLabSettings?: () => void;
  onOpenPersonalSettings?: () => void;
  onOpenHome?: () => void;
}

interface NavItem {
  id: WorkspaceSection;
  label: string;
  icon: LucideIcon;
}

/**
 * Primary navigation for project-internal pages (Timeline / Statistics /
 * Literature). A real `260px` panel as per design_guide.md §5.2 — distinct
 * from the implicit `SidebarRail` used on the landing page.
 */
const NAV_ITEMS: NavItem[] = [
  { id: "graph", label: "Graph", icon: GitFork },
  { id: "statistics", label: "Statistics", icon: ChartColumn },
  { id: "literature", label: "Literature", icon: BookMarked },
];

export function WorkspaceSidebar({
  active,
  onSelect,
  onOpenLabSettings,
  onOpenPersonalSettings,
  onOpenHome,
}: WorkspaceSidebarProps) {
  return (
    <aside
      role="navigation"
      aria-label="Workspace navigation"
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex w-[var(--sidebar-width)] flex-col",
        "border-r border-[color:var(--border-default)] bg-bg-sidebar",
      )}
    >
      {/* Brand */}
      {onOpenHome ? (
        <button
          type="button"
          onClick={onOpenHome}
          aria-label="Return to LabPilot home"
          className={cn(
            "flex items-center gap-2.5 px-5 pb-4 pt-6 text-text-primary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-[color:var(--bg-hover)]",
          )}
        >
          <LogoMark size={22} />
          <span className="select-none font-sans text-[16px] font-light tracking-[0.06em]">
            LabPilot
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-6 text-text-primary">
          <LogoMark size={22} />
          <span className="select-none font-sans text-[16px] font-light tracking-[0.06em]">
            LabPilot
          </span>
        </div>
      )}

      {/* Primary nav */}
      <nav aria-label="Sections" className="flex flex-col gap-0.5 px-3 pt-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect?.(id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex h-9 items-center gap-2.5 rounded-sm px-3 text-[13px]",
                "transition-colors duration-[var(--duration-fast)]",
                isActive
                  ? "bg-[color:var(--bg-hover)] text-text-primary"
                  : "text-text-secondary hover:bg-[color:var(--bg-hover)] hover:text-text-primary",
              )}
            >
              <Icon
                size={16}
                strokeWidth={1.5}
                className={cn(
                  "transition-colors duration-[var(--duration-fast)]",
                  isActive
                    ? "text-accent"
                    : "text-text-tertiary group-hover:text-text-primary",
                )}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Bottom settings */}
      <nav
        aria-label="Workspace settings"
        className="flex flex-col gap-0.5 border-t border-[color:var(--border-default)] px-3 py-4"
      >
        <SettingsButton
          icon={<FlaskConical size={16} strokeWidth={1.5} />}
          label="Lab Settings"
          onClick={onOpenLabSettings}
        />
        <SettingsButton
          icon={<UserRound size={16} strokeWidth={1.5} />}
          label="Personal Settings"
          onClick={onOpenPersonalSettings}
        />
      </nav>
    </aside>
  );
}

interface SettingsButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function SettingsButton({ icon, label, onClick }: SettingsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-9 items-center gap-2.5 rounded-sm px-3 text-[13px] text-text-secondary",
        "transition-colors duration-[var(--duration-fast)]",
        "hover:bg-[color:var(--bg-hover)] hover:text-text-primary",
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center text-text-tertiary group-hover:text-text-primary">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
