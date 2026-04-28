import { useSessionsStore } from "../store/sessions";
import "./ErrorLog.css";

export function ErrorLog() {
  const { errorLogs, clearErrorLogs } = useSessionsStore();

  if (errorLogs.length === 0) {
    return null;
  }

  return (
    <div className="error-log">
      <div className="error-log__header">
        <span className="error-log__title">Error Logs ({errorLogs.length})</span>
        <button className="error-log__clear" onClick={clearErrorLogs}>
          Clear
        </button>
      </div>
      <div className="error-log__content">
        {errorLogs.map((log, i) => (
          <div key={i} className="error-log__item">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}