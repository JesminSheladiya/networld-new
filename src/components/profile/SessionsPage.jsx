import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Spin, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faDesktop, faMobileScreen, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { getSessions, revokeSession, revokeAllSessions } from "../../Services/authService";
import { useAuth } from "../../context/AuthContext";
import ConfirmPopup from "../shared/ConfirmPopup";
import "../css/profile-page.css";

// Devices logged in to this account. Revoking a row kills that login's
// token at its next API call; wiping all (including this device) logs out
// everywhere.
function parseDevice(ua = "") {
  const s = ua || "";
  const isMobile = /mobile|android|iphone|ipod/i.test(s);
  const browser =
    /edg\/([\d.]+)/i.test(s) ? "Edge" :
    /opr\/|opera/i.test(s) ? "Opera" :
    /chrome\/([\d.]+)/i.test(s) && !/edg/i.test(s) ? "Chrome" :
    /firefox\/([\d.]+)/i.test(s) ? "Firefox" :
    /safari\/([\d.]+)/i.test(s) && !/chrome/i.test(s) ? "Safari" : null;
  const os =
    /android/i.test(s) ? "Android" :
    /iphone|ipad|ipod/i.test(s) ? "iOS" :
    /windows/i.test(s) ? "Windows" :
    /mac os/i.test(s) ? "macOS" :
    /linux/i.test(s) ? "Linux" : null;
  const name = [browser, os].filter(Boolean).join(" · ") || "Unknown device";
  return { name, isMobile };
}

function timeAgo(iso) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function SessionsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getSessions();
      setSessions(Array.isArray(list) ? list : []);
    } catch (e) {
      message.error(e.response?.data?.error || e.response?.data?.message || "Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/profile", { replace: true });
  };

  const handleRevoke = async (id) => {
    if (revokingId) return;
    setRevokingId(id);
    try {
      await revokeSession(id);
      message.success("Session logged out.");
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      message.error(e.response?.data?.error || e.response?.data?.message || "Could not revoke session");
    } finally {
      setRevokingId(null);
    }
  };

  const handleWipeAll = async () => {
    if (wiping) return;
    setWipeOpen(false);
    setWiping(true);
    try {
      await revokeAllSessions();
      message.success("Logged out on all devices.");
    } catch {
      // Even if the call failed, the local session is unusable — drop it.
    } finally {
      logout();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="nw-page pf-page pf-narrow-page">
      <button className="nw-back-btn" onClick={goBack}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>

      <div className="pf-card">
        <div className="pf-card-head pf-sessions-head">
          <h2 className="pf-card-title">
            <FontAwesomeIcon icon={faShieldHalved} style={{ marginRight: 8 }} />
            Active sessions
          </h2>
          <button
            type="button"
            className="pf-danger-btn pf-sessions-wipe"
            disabled={loading || wiping || sessions.length === 0}
            onClick={() => setWipeOpen(true)}
          >
            {wiping ? "Logging out…" : "Log out all devices"}
          </button>
        </div>
        <p className="pf-sessions-sub">
          Every device logged in to your account. Logging one out takes effect
          on its next action.
        </p>

        {loading ? (
          <div className="pf-sessions-loading">
            <Spin />
          </div>
        ) : sessions.length === 0 ? (
          <p className="pf-sessions-empty">No active sessions found.</p>
        ) : (
          <ul className="pf-sessions-list">
            {sessions.map((s) => {
              const dev = parseDevice(s.deviceInfo);
              return (
                <li key={s.id} className="pf-session-row">
                  <span className="pf-session-icon">
                    <FontAwesomeIcon icon={dev.isMobile ? faMobileScreen : faDesktop} />
                  </span>
                  <span className="pf-session-main">
                    <span className="pf-session-name">
                      {dev.name}
                      {s.current && <span className="pf-session-current">This device</span>}
                    </span>
                    <span className="pf-session-meta">
                      {s.ipAddress || "Unknown IP"} · active {timeAgo(s.lastActiveAt)}
                    </span>
                    <span className="pf-session-meta pf-session-dim">
                      Logged in {formatDate(s.createdAt)}
                    </span>
                  </span>
                  {!s.current && (
                    <button
                      type="button"
                      className="pf-ghost-btn pf-session-revoke"
                      disabled={revokingId === s.id}
                      onClick={() => handleRevoke(s.id)}
                    >
                      {revokingId === s.id ? "Logging out…" : "Log out"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmPopup
        open={wipeOpen}
        title="Log out all devices?"
        message="This ends every login on every device — including this one. You'll need to log in again."
        okText="Yes, log out all"
        onCancel={() => setWipeOpen(false)}
        onOk={handleWipeAll}
      />
    </div>
  );
}

export default SessionsPage;
