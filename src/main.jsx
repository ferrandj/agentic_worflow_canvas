import React from "react";
import { createRoot } from "react-dom/client";
import AgentFlowCanvas from "./AgentFlowCanvas.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AgentFlowCanvas />
  </React.StrictMode>
);
