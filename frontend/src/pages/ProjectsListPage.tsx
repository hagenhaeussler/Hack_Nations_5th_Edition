import { FolderKanban } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ProjectCard } from "@/components/ProjectCard";
import { listProjects } from "@/lib/api";
import {
  type Project,
  STATUS_LABEL,
  formatRelativeTime,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * `/projects` — full list of every project in the workspace, sorted by most
 * recent activity.
 *
 * The landing page surfaces a compact 6-tile preview of the same data; this
 * page is the unbounded view linked from the sidebar's "Projects" entry.
 */
export function ProjectsListPage() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; projects: Project[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((projects) => {
        if (!cancelled) setState({ kind: "ready", projects });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex min-h-24 items-center border-b border-[color:var(--border-default)] bg-bg-primary/95 px-8 py-0 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Workspace
            </p>
            <h1 className="mt-1 font-sans text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-text-primary">
              Projects
            </h1>
          </div>
          <Link
            to="/"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white",
              "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
            )}
          >
            New project
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1080px] flex-1 px-8 py-8">
        {state.kind === "loading" ? (
          <SkeletonGrid />
        ) : state.kind === "error" ? (
          <ErrorState message={state.message} />
        ) : state.projects.length === 0 ? (
          <EmptyState />
        ) : (
          <ul
            role="list"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {state.projects.map((project) => (
              <li key={project.id} className="h-full">
                <ProjectCard
                  project={project}
                  onSelect={() => navigate(`/projects/${project.id}`)}
                />
                <p className="mt-1.5 px-1 text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                  {STATUS_LABEL[project.status]} · {formatRelativeTime(project.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SkeletonGrid() {
  return (
    <ul
      role="list"
      aria-label="Loading projects"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }).map((_, idx) => (
        <li
          key={idx}
          className={cn(
            "aspect-[1.618/1] animate-pulse-slow rounded-md border border-[color:var(--border-default)]",
            "bg-bg-surface shadow-sm",
          )}
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-[40ch] flex-col items-center gap-3 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-hover text-text-secondary">
        <FolderKanban size={20} strokeWidth={1.5} />
      </span>
      <h2 className="font-sans text-[20px] font-medium tracking-[-0.01em] text-text-primary">
        No projects yet
      </h2>
      <p className="text-[13px] leading-[1.55] text-text-secondary">
        Start by describing a hypothesis on the home page. Every search becomes
        a project you can come back to later.
      </p>
      <Link
        to="/"
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 rounded-sm bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white",
          "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
        )}
      >
        New project
      </Link>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-[44ch] flex-col items-center gap-3 py-24 text-center">
      <h2 className="font-sans text-[20px] font-medium tracking-[-0.01em] text-text-primary">
        Couldn't load projects
      </h2>
      <p className="text-[13px] leading-[1.55] text-text-secondary">{message}</p>
    </div>
  );
}
