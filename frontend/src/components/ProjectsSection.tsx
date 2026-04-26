import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ProjectCard } from "@/components/ProjectCard";
import { listProjects } from "@/lib/api";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

interface ProjectsSectionProps {
  /** Cap on how many cards to render. Defaults to 6 (two rows on desktop). */
  limit?: number;
}

/**
 * "Past projects" surface for the landing page.
 *
 * Fetches the most-recently-updated projects from the backend on mount,
 * renders the top `limit` as a 1 / 2 / 3-column grid of {@link ProjectCard},
 * and links to the dedicated `/projects` page when the user wants to see
 * everything.
 *
 * Selecting a card navigates to the project workspace at `/projects/:id`.
 */
export function ProjectsSection({ limit = 6 }: ProjectsSectionProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; projects: Project[] }
    | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((projects) => {
        if (!cancelled) setState({ kind: "ready", projects });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quietly disappear on first paint and on error — the section is purely
  // ambient and shouldn't fight for attention with the prompt above.
  if (state.kind !== "ready" || state.projects.length === 0) return null;

  const visible = state.projects.slice(0, limit);
  const remainder = state.projects.length - visible.length;

  return (
    <section
      aria-label="Past projects"
      className="mx-auto w-full max-w-[var(--chat-max-width)] px-6 pb-40 pt-2 sm:px-8"
    >
      <header className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Past projects
        </h2>
        <Link
          to="/projects"
          className={cn(
            "text-[11.5px] text-text-tertiary",
            "transition-colors duration-[var(--duration-fast)] hover:text-text-primary",
          )}
        >
          {remainder > 0
            ? `View all ${state.projects.length}`
            : `${state.projects.length} total`}
        </Link>
      </header>

      <ul
        role="list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visible.map((project) => (
          <li key={project.id} className="h-full">
            <ProjectCard
              project={project}
              onSelect={() => navigate(`/projects/${project.id}`)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
