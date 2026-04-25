import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
import { PersonalSettingsProvider } from "@/lib/personalSettingsContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PersonalSettingsProvider>
      <App />
    </PersonalSettingsProvider>
  </React.StrictMode>,
);
