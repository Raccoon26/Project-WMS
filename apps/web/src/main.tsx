import { AuthGate } from "./auth";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, AppBoundary } from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </AppBoundary>
  </StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .catch(() => {
        /* installation failure never changes business state */
      });
  });
}
