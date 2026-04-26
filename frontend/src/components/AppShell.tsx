import { Outlet } from "react-router-dom";

import { AppSidebar } from "@/components/AppSidebar";
import { useSidebarState } from "@/lib/useSidebarState";

/**
 * Outer layout used by every route.
 *
 * Renders the persistent {@link AppSidebar} on the left and yields the rest
 * of the viewport to the active route via `<Outlet />`. The content column
 * pads itself off `--sidebar-current-width`, a CSS variable kept in sync
 * with the sidebar's actual width so child pages don't have to know whether
 * the sidebar is collapsed.
 */
export function AppShell() {
  const [collapsed, toggle] = useSidebarState();

  const sidebarWidth = collapsed
    ? "var(--sidebar-collapsed-width)"
    : "var(--sidebar-width)";

  return (
    <div
      className="min-h-screen bg-bg-primary text-text-primary"
      style={{ ["--sidebar-current-width" as string]: sidebarWidth }}
    >
      <AppSidebar collapsed={collapsed} onToggle={toggle} />
      <div
        className="min-h-screen"
        style={{ marginLeft: "var(--sidebar-current-width)" }}
      >
        <Outlet />
      </div>
    </div>
  );
}
