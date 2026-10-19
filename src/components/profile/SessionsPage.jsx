import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Spin, message } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faDesktop, faMobileScreen, faShieldHalved, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import { getSessions, revokeSession, revokeAllSessions } from "../../Services/authService";
import { parseDevice } from "../../utils/deviceUtils";
import { useAuth } from "../../context/AuthContext";
import ConfirmPopup from "../shared/ConfirmPopup";
import "../css/profile-page.css";

// Devices logged in to this account. Revoking a row kills that login's
// token at its next API call; wiping all (including this device) logs out
// everywhere.
function displayDevice(s) {
  const fallback = parseDevice(s?.deviceInfo);
  const name = (s?.deviceName || "").trim() || fallback.name;
  return { name, isMobile: fallback.isMobile };
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
  const { logout, user } = useAuth();
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

      {user?.createdAt && (
        <div className="pf-sessions-account-card">
          <span className="pf-sessions-account-icon"><FontAwesomeIcon icon={faCalendarDays} /></span>
          <span className="pf-sessions-account-copy">
            <strong>Account created on</strong>
            <span>{(() => {
              const created = new Date(user.createdAt);
              return `${created.getDate()} ${created.toLocaleDateString("en-US", { month: "long" })} ${created.getFullYear()} • ${created.toLocaleDateString("en-US", { weekday: "long" })}`;
            })()}</span>
          </span>
        </div>
      )}

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
              const dev = displayDevice(s);
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
