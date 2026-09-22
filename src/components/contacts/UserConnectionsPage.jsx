import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Avatar, Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faUsers, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../Services/networld";
import { avatarColorFor } from "../../constants";
import { mapConnectionToContact, matchesContactSlug, seedMatchesSlug } from "../../utils/contactMapper";
import { toDataUrl } from "../../utils/imageUtils";
import "../css/profile-page.css";

// Standalone connections list — opened from the header stat on mobile
// (Instagram-style list page).
function UserConnectionsPage() {
  const navigate = useNavigate();
  const { username } = useParams();
  const location = useLocation();

  const slug = username ? decodeURIComponent(username) : "";
  const seedContact = location.state?.contact;
  const [connections, setConnections] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setConnections(null);
    setLoading(true);
    (async () => {
      try {
        let email = seedMatchesSlug(seedContact, slug) ? seedContact.email : "";
        if (!email) {
          const res = await api.connections();
          if (cancelled) return;
          const found = (res.data || []).find((c) => matchesContactSlug(c, slug));
          if (found) {
            email = found.suggestedUserEmail;
          } else {
            const r2 = await api.searchUsers(slug);
            if (cancelled) return;
            const list = r2.data || [];
            const exact =
              list.find((u) => (u.username || "").toLowerCase() === slug.toLowerCase()) ||
              list.find((u) => u.email === slug);
            email = exact?.email || "";
          }
        }
        if (!email) return;
        const res = await api.connectionsOf(email);
        if (cancelled) return;
        setConnections(Array.isArray(res.data) ? res.data : []);
      } catch {
        // Keep whatever is on screen — never blank a loaded view.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const openProfile = (c) => {
    navigate(`/contacts/${encodeURIComponent(c.username || c.email)}`, {
      state: { contact: c },
    });
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/contacts", { replace: true });
  };

  const ownerName = seedMatchesSlug(seedContact, slug)
    ? seedContact.name || "User"
    : "User";

  return (
    <div className="nw-page pf-page">
      <button className="nw-back-btn" onClick={goBack}>
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </button>

      <div className="pf-card">
        <div className="pf-card-head">
          <h2 className="pf-card-title">{ownerName}&rsquo;s connections</h2>
          {connections && (
            <span className="pf-count-pill">
              {connections.length} {connections.length === 1 ? "connection" : "connections"}
            </span>
          )}
        </div>
        {loading && !connections ? (
          <div className="nw-state-box">
            <Spin size="large" />
            <span className="nw-state-text">Loading connections...</span>
          </div>
        ) : !connections || connections.length === 0 ? (
          <div className="nw-state-box">
            <FontAwesomeIcon icon={faUsers} style={{ fontSize: 40, color: "#475569" }} />
            <span className="nw-state-text">No connections yet</span>
          </div>
        ) : (
          <div className="pf-conn-list">
            {connections.map((item, i) => {
              const c = mapConnectionToContact(item, i);
              return (
                <div
                  className="pf-conn-row"
                  key={c.email || c.username || i}
                  onClick={() => openProfile(c)}
                  title={`View ${c.name || "profile"}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") openProfile(c); }}
                >
                  <Avatar
                    size={44}
                    src={toDataUrl(c.profilePicture)}
                    style={{
                      backgroundColor: c.profilePicture
                        ? "transparent"
                        : avatarColorFor(c.name || "?"),
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {!c.profilePicture && (c.name || "?").charAt(0).toUpperCase()}
                  </Avatar>
                  <span className="pf-info-text">
                    <span className="pf-info-value">{c.name || "Unknown"}</span>
                    <span className="pf-info-label">
                      {c.username ? `@${c.username.toLowerCase()}` : c.email}
                    </span>
                  </span>
                  <span className="pf-conn-right">
                    <FontAwesomeIcon icon={faChevronRight} className="pf-conn-chevron" />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserConnectionsPage;
