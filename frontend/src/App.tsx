import { useEffect, useState } from "react";
import { Overlay } from "./components/Overlay";
import { ControlCenter } from "./components/ControlCenter";
import { GeometrySandbox } from "./components/GeometrySandbox";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { initConfig } from "./store/config";
import { logger } from "./client/logger";
import "./index.css";

// Detect if this window is the Control Center
const isControlCenter = new URLSearchParams(window.location.search).get("window") === "control-center";

// Initialize config on app load
initConfig().catch((e) => logger.capture(e, "STORE_OPERATION_ERROR"));

function MainOverlayApp() {
  useAgentEvents();
  useSessionPersistence();
  return <Overlay />;
}

function ControlCenterApp() {
  return <ControlCenter />;
}

function App() {
  const initialGeometrySandbox =
    import.meta.env.DEV &&
    (new URLSearchParams(window.location.search).get("sandbox") === "geometry" ||
      import.meta.env.VITE_GEOMETRY_SANDBOX === "true");
  const [showGeometrySandbox, setShowGeometrySandbox] = useState(initialGeometrySandbox);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setShowGeometrySandbox((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isControlCenter) {
    return <ControlCenterApp />;
  }

  if (showGeometrySandbox) {
    return <GeometrySandbox />;
  }

  return <MainOverlayApp />;
}

export default App;
