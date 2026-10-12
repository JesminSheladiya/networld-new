import { useEffect, useRef } from "react";
import { message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWifi, faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import "../css/offline-overlay.css";

// Full-screen takeover whenever the device has no network (wifi off,
// airplane mode, …). Covers every page including login. Disappears
// automatically when connectivity returns.
function OfflineOverlay() {
  const { online, checking, recheck } = useOnlineStatus();
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      message.success("Back online — you're connected again.");
    }
  }, [online]);

  if (online) return null;

  return (
    <div className="nw-offline-overlay" role="alert" aria-live="assertive">
      <div className="nw-offline-card">
        <div className="nw-offline-icon">
          <FontAwesomeIcon icon={faWifi} />
          <span className="nw-offline-slash" />
        </div>
        <h1 className="nw-offline-title">You&apos;re offline</h1>
        <p className="nw-offline-text">
          No internet connection. Check your Wi-Fi or mobile data —
          NetWorld will reconnect automatically.
        </p>
        <button
          type="button"
          className="pf-primary-btn nw-offline-retry"
          disabled={checking}
          onClick={recheck}
        >
          <FontAwesomeIcon icon={faArrowsRotate} spin={checking} />
          {checking ? "Retrying…" : "Retry"}
        </button>
      </div>
    </div>
  );
}

export default OfflineOverlay;
