import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installPressFeedback } from "./fx";
import "./fonts";
import "./styles.css";

installPressFeedback();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
