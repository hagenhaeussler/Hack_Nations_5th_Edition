import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  onSelect?: (project: Project) => void;
}

/**
 * Past-project tile — minimal by design.
 *
 * The card itself is locked to the golden ratio (φ : 1) so the grid keeps a
 * consistent, classical proportion at every viewport width. Only two pieces
 * of content are rendered: the project title and the hypothesis. The
 * hypothesis fills the remaining card height and is cleanly cut off where
 * the card ends — no ellipsis, just a hard edge — which matches the
 * "less cluttered" intent.
 *
 * Other project metadata (status, progress, collaborators, timestamps) is
 * preserved on `Project` so a future detail page can surface it without
 * touching this component.
 */
export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(project)}
      aria-label={`Open project: ${project.title}`}
      className={cn(
        "group relative flex aspect-[1.618/1] w-full flex-col gap-1.5 overflow-hidden rounded-md border bg-bg-surface p-4 text-left",
        "border-[color:var(--border-default)] shadow-sm",
        "transition-[transform,box-shadow,border-color] duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:shadow-md",
      )}
    >
      <h3 className="text-[15px] font-medium leading-[1.3] tracking-[-0.005em] text-text-primary">
        {project.title}
      </h3>
      <p className="flex-1 overflow-hidden text-[13px] leading-[1.55] text-text-secondary">
        {project.hypothesis}
      </p>
    </button>
  );
}
