import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  FolderKanban,
  CalendarRange,
  MoreHorizontal,
  PackageSearch,
  PenSquare,
  Share2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useMatch } from "react-router-dom";

import { LogoMark } from "@/components/LogoMark";
import { getProject } from "@/lib/api";
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
  const [projectTitle, setProjectTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProjectTitle(null);
      return;
    }

    let cancelled = false;
    setProjectTitle(null);
    getProject(projectId)
      .then((project) => {
        if (!cancelled) setProjectTitle(project.title);
      })
      .catch(() => {
        if (!cancelled) setProjectTitle("Project");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const primaryNav: NavItem[] = projectId
    ? [
        { to: `/projects/${projectId}/calendar`, label: "Calendar", icon: CalendarRange },
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
        {
          to: `/projects/${projectId}/resources`,
          label: "Resources",
          icon: PackageSearch,
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
        {projectId ? (
          <CurrentProjectMenu
            collapsed={!expanded}
            projectTitle={projectTitle}
          />
        ) : null}
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

function abbreviateProjectTitle(title: string | null): string {
  const cleaned = title?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Project";
  if (cleaned.length <= 24) return cleaned;
  return `${cleaned.slice(0, 21).trimEnd()}...`;
}

interface CurrentProjectMenuProps {
  collapsed: boolean;
  projectTitle: string | null;
}

function CurrentProjectMenu({ collapsed, projectTitle }: CurrentProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = abbreviateProjectTitle(projectTitle);
  const fullTitle = projectTitle ?? "Current project";

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const shareProject = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (err) {
      console.warn("[labpilot] Could not copy project link.", err);
    }
  };

  if (collapsed) return null;

  return (
    <div ref={rootRef} className="group relative">
      <div
        className={cn(
          "flex h-9 items-center gap-2.5 rounded-sm px-3 text-[13px] text-text-primary",
          "transition-colors duration-[var(--duration-fast)] group-hover:bg-[color:var(--bg-hover)]",
        )}
        title={fullTitle}
      >
        <span className="min-w-0 flex-1 truncate font-bold">{label}</span>
        <button
          type="button"
          aria-label="Project options"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
            "opacity-0 transition-[opacity,background-color,color] duration-[var(--duration-fast)]",
            "hover:bg-bg-surface hover:text-text-primary focus:opacity-100 focus:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/35",
            (open || copied) && "opacity-100",
            "group-hover:opacity-100",
          )}
        >
          <MoreHorizontal size={16} strokeWidth={1.6} />
        </button>
      </div>

      {open ? (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-md border border-[color:var(--border-default)] bg-bg-surface p-1 text-[13px] shadow-lg">
          <button
            type="button"
            onClick={() => {
              void shareProject();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Share2 size={14} strokeWidth={1.6} />
            {copied ? "Link copied" : "Share project"}
          </button>
          <Link
            to="/projects"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <FolderKanban size={14} strokeWidth={1.6} />
            Project list
          </Link>
        </div>
      ) : null}
    </div>
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
