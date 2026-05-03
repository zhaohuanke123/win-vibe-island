import { Overlay } from "./components/Overlay";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { initConfig } from "./store/config";
import "./index.css";

// Initialize config on app load
initConfig().catch(console.error);

function App() {
  useAgentEvents();
  return <Overlay />;
}

export default App;