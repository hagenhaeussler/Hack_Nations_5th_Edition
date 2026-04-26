import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { BenchmarkDashboardPage } from "@/pages/BenchmarkDashboardPage";
import { LabSettingsPage } from "@/pages/LabSettingsPage";
import { LandingPage } from "@/pages/LandingPage";
import { PersonalSettingsPage } from "@/pages/PersonalSettingsPage";
import { ProjectPage } from "@/pages/ProjectPage";
import { ProjectsListPage } from "@/pages/ProjectsListPage";

/**
 * Route table.
 *
 * Every visible page renders inside {@link AppShell} so the sidebar nav (New
 * Project / Projects / Lab Settings / Personal Settings) is always present.
 *
 *   /                         → LandingPage          (prompt + past projects)
 *   /projects                 → ProjectsListPage     (all saved projects)
 *   /projects/:id             → redirects to a project subpage
 *   /projects/:id/:page       → ProjectPage          (calendar / statistics /
 *                                                     literature / resources)
 *   /lab-settings             → LabSettingsPage
 *   /personal-settings        → PersonalSettingsPage
 *
 * Anything else falls back to "/" so a stale URL never strands the user.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="benchmark" element={<BenchmarkDashboardPage />} />
        <Route path="projects" element={<ProjectsListPage />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route path="projects/:id/:page" element={<ProjectPage />} />
        <Route path="lab-settings" element={<LabSettingsPage />} />
        <Route path="personal-settings" element={<PersonalSettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
