import { Overlay } from "./components/Overlay";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { initConfig } from "./store/config";
import "./index.css";

// Initialize config on app load
initConfig().catch(console.error);

function App() {
  useAgentEvents();
  useSessionPersistence();
  return <Overlay />;
}

export default App;