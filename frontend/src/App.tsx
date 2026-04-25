import { Overlay } from "./components/Overlay";
import { useAgentEvents } from "./hooks/useAgentEvents";
import "./index.css";

function App() {
  useAgentEvents();
  return <Overlay />;
}

export default App;