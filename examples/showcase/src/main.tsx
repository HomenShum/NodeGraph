import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { ShowcaseApp } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShowcaseApp />
  </React.StrictMode>,
);
