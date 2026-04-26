import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  FolderKanban,
  Home,
  Network,
  PenSquare,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useMatch } from "react-router-dom";

import { LogoMark } from "@/components/LogoMark";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, the active state should match `to` exactly (no prefix matching). */
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "New Project", icon: PenSquare, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
];

const SETTINGS_NAV: NavItem[] = [
  { to: "/lab-settings", label: "Lab Settings", icon: FlaskConical },
  { to: "/personal-settings", label: "Personal Settings", icon: UserRound },
];

/**
 * Global app sidebar.
 *
 * One unified panel rendered on every page. Two stops:
 *   - Top: brand + primary navigation (New Project / Projects)
 *   - Bottom: settings (Lab / Personal)
 *
 * Collapsible — when collapsed it shrinks to a 56px icon rail and the labels
 * disappear. Collapsed state is persisted via `useSidebarState`. The rest of
 * the layout pads itself off `--sidebar-current-width`, a CSS var the parent
 * `AppShell` keeps in sync.
 */
export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const projectMatch = useMatch("/projects/:id/*");
  const projectId = projectMatch?.params.id;
  const expanded = !collapsed;

  const primaryNav: NavItem[] = projectId
    ? [
        { to: "/", label: "New Project", icon: Home, end: true },
        { to: `/projects/${projectId}/graph`, label: "Graph", icon: Network },
        {
          to: `/projects/${projectId}/statistics`,
          label: "Statistics",
          icon: BarChart3,
        },
        {
          to: `/projects/${projectId}/literature`,
          label: "Literature",
          icon: BookOpen,
        },
      ]
    : PRIMARY_NAV;

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      data-collapsed={!expanded || undefined}
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[color:var(--border-default)]",
        "bg-bg-sidebar transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-default)]",
        expanded
          ? "w-[var(--sidebar-width)]"
          : "w-[var(--sidebar-collapsed-width)]",
      )}
    >
      {/* Brand row + collapse toggle */}
      <div className="flex items-center gap-2 px-3 pb-3 pt-5">
        {!expanded ? (
          <CollapsedBrandButton onOpen={onToggle} />
        ) : (
          <>
            <NavLink
              to="/"
              aria-label="Return to LabPilot home"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-2 py-1 text-text-primary",
                "transition-colors duration-[var(--duration-fast)] hover:bg-[color:var(--bg-hover)]",
              )}
            >
              <LogoMark size={22} />
              <span className="select-none truncate font-sans text-[16px] font-light tracking-[0.06em]">
                LabPilot
              </span>
            </NavLink>

            {collapsed ? (
              <ExpandButton onToggle={onToggle} />
            ) : (
              <CollapseButton onToggle={onToggle} />
            )}
          </>
          )}
      </div>

      {/* Primary nav */}
      <nav aria-label="Sections" className="flex flex-col gap-0.5 px-2 pt-2">
        {primaryNav.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={!expanded} />
        ))}
      </nav>

      <div className="flex-1" />

      {/* Bottom: settings + (when collapsed) the expand button */}
      <nav
        aria-label="Settings"
        className="flex flex-col gap-0.5 border-t border-[color:var(--border-default)] px-2 py-3"
      >
        {SETTINGS_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={!expanded} />
        ))}
      </nav>
    </aside>
  );
}

interface CollapsedBrandButtonProps {
  onOpen: () => void;
}

function CollapsedBrandButton({ onOpen }: CollapsedBrandButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Expand sidebar"
      title="Expand sidebar"
      className={cn(
        "group relative flex h-8 w-full items-center justify-center rounded-sm text-text-primary",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[color:var(--bg-hover)]",
      )}
    >
      <span className="transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0">
        <LogoMark size={22} />
      </span>
      <ChevronRight
        size={15}
        strokeWidth={1.5}
        className="absolute text-text-tertiary opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
      />
    </button>
  );
}

interface SidebarLinkProps {
  item: NavItem;
  collapsed: boolean;
}

function SidebarLink({ item, collapsed }: SidebarLinkProps) {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group flex h-9 items-center gap-2.5 rounded-sm text-[13px]",
          "transition-colors duration-[var(--duration-fast)]",
          collapsed ? "justify-center px-0" : "px-3",
          isActive
            ? "bg-[color:var(--bg-hover)] text-text-primary"
            : "text-text-secondary hover:bg-[color:var(--bg-hover)] hover:text-text-primary",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            strokeWidth={1.5}
            className={cn(
              "shrink-0 transition-colors duration-[var(--duration-fast)]",
              isActive
                ? "text-accent"
                : "text-text-tertiary group-hover:text-text-primary",
            )}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

interface CollapseButtonProps {
  onToggle: () => void;
}

function CollapseButton({ onToggle }: CollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Collapse sidebar"
      title="Collapse sidebar"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[color:var(--bg-hover)] hover:text-text-primary",
      )}
    >
      <ChevronLeft size={15} strokeWidth={1.5} />
    </button>
  );
}

function ExpandButton({ onToggle }: CollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Expand sidebar"
      title="Expand sidebar"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[color:var(--bg-hover)] hover:text-text-primary",
      )}
    >
      <ChevronRight size={15} strokeWidth={1.5} />
    </button>
  );
}
