import { useMemo } from "react";

import { ProjectCard } from "@/components/ProjectCard";
import { listRecentProjects, type Project } from "@/lib/projects";

interface ProjectsSectionProps {
  onSelect?: (project: Project) => void;
}

/**
 * "Past projects" surface for the landing page.
 * Renders a 1 / 2 / 3-column responsive grid of `ProjectCard`s, with no
 * row limit — the user can keep scrolling. The grid sits inside a content
 * column constrained to the design's `--chat-max-width` so the rhythm
 * matches the input above. Bottom padding leaves room for the page-edge
 * fade overlay that lives on the parent layout.
 *
 * Data is loaded synchronously from `listRecentProjects()`; replacing
 * that function with a real fetch is enough to make this dynamic.
 */
export function ProjectsSection({ onSelect }: ProjectsSectionProps) {
  const projects = useMemo(() => listRecentProjects(), []);

  if (projects.length === 0) return null;

  return (
    <section
      aria-label="Past projects"
      className="mx-auto w-full max-w-[var(--chat-max-width)] px-6 pb-40 pt-2 sm:px-8"
    >
      <header className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Past projects
        </h2>
        <span className="text-[11.5px] text-text-tertiary">
          {projects.length} total
        </span>
      </header>

      <ul
        role="list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {projects.map((project) => (
          <li key={project.id} className="h-full">
            <ProjectCard project={project} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}
