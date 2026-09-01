import { useEffect, useState, useCallback, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Dropdown, Avatar } from "antd";
import { TeamOutlined, SearchOutlined, BellOutlined, BulbOutlined, LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { getUser, logout } from "../../Services/authService";
import { api } from "../../Services/networld";
import { RefreshProvider, useRefresh } from "./RefreshContext";
import UserProfile from "../UserProfile";

const NAV_ITEMS = [
  { to: "/contacts", label: "Contacts", icon: <TeamOutlined /> },
  { to: "/discover/find", label: "Find People", icon: <SearchOutlined /> },
  { to: "/discover/requests", label: "Requests", icon: <BellOutlined /> },
  { to: "/discover/suggestions", label: "Suggestions", icon: <BulbOutlined /> },
];

function ProfileMenu() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(getUser());
  const [profileOpen, setProfileOpen] = useState(false);
  const { bump } = useRefresh();

  const fullName = currentUser?.fullName || currentUser?.username || "User";
  const nameParts = fullName.split(" ").filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : fullName.slice(0, 2).toUpperCase();
  const email = currentUser?.email || "user@mail.com";
  const profileAvatar = currentUser?.profilePicture || currentUser?.avatar || currentUser?.image || null;

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleProfileUpdate = (updated) => {
    setCurrentUser(updated);
    setProfileOpen(false);
  };

  return (
    <>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        dropdownRender={() => (
          <div className="nw-profile-dropdown">
            <div className="nw-profile-head">
              <Avatar size={42} src={profileAvatar} style={{ backgroundColor: "#1f2937", color: "#7dd3fc", borderRadius: "50%" }}>
                {!profileAvatar && initials}
              </Avatar>
              <div className="nw-profile-meta">
                <div className="nw-profile-name">{fullName}</div>
                <div className="nw-profile-email">{email}</div>
              </div>
            </div>
            <div className="nw-profile-actions">
              <button className="nw-profile-action" onClick={() => { setProfileOpen(true); }}>
                <SettingOutlined /> Profile Settings
              </button>
              <button className="nw-profile-action nw-profile-logout" onClick={handleLogout}>
                <LogoutOutlined /> Sign Out
              </button>
            </div>
          </div>
        )}
      >
        <button className="nw-avatar-trigger">
          <Avatar size={38} src={profileAvatar} style={{ backgroundColor: "#1f2937", color: "#fff", fontWeight: 700, borderRadius: "50%" }}>
            {!profileAvatar && initials}
          </Avatar>
        </button>
      </Dropdown>

      <UserProfile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdate={handleProfileUpdate}
        onRelationAccepted={() => bump()}
      />
    </>
  );
}

function AppShellNav() {
  const location = useLocation();
  const activeIndex = (() => {
    const p = location.pathname;
    if (p.startsWith("/contacts")) return 0;
    const idx = NAV_ITEMS.findIndex((it) => p === it.to);
    return idx >= 0 ? idx : 0;
  })();
  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 1024px)").matches);
  const { pendingCount, suggestionsCount, setPendingCount, setSuggestionsCount, key: refreshKey } = useRefresh();
  const topNavRef = useRef(null);
  const topItemRefs = useRef([]);
  const [topIndicator, setTopIndicator] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, suggestionsRes] = await Promise.all([
        api.pending(),
        api.suggestions(),
      ]);
      setPendingCount(pendingRes.data?.length || 0);
      setSuggestionsCount(suggestionsRes.data?.length || 0);
    } catch {
      setPendingCount(0);
      setSuggestionsCount(0);
    }
  }, [setPendingCount, setSuggestionsCount]);

  useEffect(() => {
    fetchCounts();
  }, [refreshKey, fetchCounts]);

  // ── Sliding indicator (same smooth animation as My Contacts chips) ──
  useEffect(() => {
    if (isCompact) return;
    const el = topItemRefs.current[activeIndex];
    if (!el || !topNavRef.current) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const c = topNavRef.current.getBoundingClientRect();
      setTopIndicator({ left: r.left - c.left, width: r.width, ready: true });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeIndex, isCompact, pendingCount, suggestionsCount]);


  return (
    <div className="nw-shell">
      {/* Liquid glass SVG filter — used for backdrop refinement (see freefrontend / Petr Knoll glass) */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none" }}>
        <defs>
          <filter id="liquid-glass-filter" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="1" result="turb" seed="2" />
            <feDisplacementMap in="SourceGraphic" in2="turb" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
        {!isCompact ? (
          <header className="nw-topnav">
            <div className="nw-brand">
              <span className="nw-brand-dot" />
              <span className="nw-brand-text">Net World</span>
            </div>
            <nav className="nw-topnav-links" ref={topNavRef}>
              <span
                className="nw-topnav-indicator"
                style={{
                  left: topIndicator.left,
                  width: topIndicator.width,
                  opacity: topIndicator.ready ? 1 : 0,
                }}
              />
              {NAV_ITEMS.map((item, i) => {
                const isSuggestion = item.to === "/discover/suggestions";
                const hasSuggestions = isSuggestion && suggestionsCount > 0;
                return (
                <NavLink
                  key={item.to}
                  ref={(el) => (topItemRefs.current[i] = el)}
                  to={item.to}
                  replace
                  className={({ isActive }) => {
                    const base = isActive ? "nw-topnav-link active" : "nw-topnav-link";
                    return hasSuggestions ? `${base} suggestion-has-data` : base;
                  }}
                >
                  <span className={hasSuggestions ? "suggestion-icon-glow" : undefined}>{item.icon}</span>
                  {item.label}
                  {item.to === "/discover/requests" && pendingCount > 0 && (
                    <span className="nw-nav-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>
                  )}
                  {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                    <span className="nw-nav-badge">{suggestionsCount > 99 ? "99+" : suggestionsCount}</span>
                  )}
                </NavLink>
                );
              })}
            </nav>
            <ProfileMenu />
          </header>
        ) : (
          <>
            <header className="nw-topbar-mobile">
              <div className="nw-brand">
                <span className="nw-brand-dot" />
                <span className="nw-brand-text">Net World</span>
              </div>
              <ProfileMenu />
            </header>
            <nav className="nw-bottomnav toolbar">
              <ul>
                {NAV_ITEMS.map((item, i) => {
                  const isSuggestion = item.to === "/discover/suggestions";
                  const hasSuggestions = isSuggestion && suggestionsCount > 0;
                  return (
                  <li
                    key={item.to}
                    className={`${activeIndex === i ? "nw-nav-item active menu" : "nw-nav-item menu"}${hasSuggestions ? " suggestion-has-data" : ""}`}
                  >
                    <NavLink to={item.to} replace>
                      <span className={`nw-nav-icon-wrap icon${hasSuggestions ? " suggestion-icon-glow" : ""}`}>
                        {item.icon}
                        {item.to === "/discover/requests" && pendingCount > 0 && (
                          <span className="nw-nav-badge-dot">{pendingCount > 99 ? "99+" : pendingCount}</span>
                        )}
                        {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                          <span className="nw-nav-badge-dot">{suggestionsCount > 99 ? "99+" : suggestionsCount}</span>
                        )}
                      </span>
                      <span className="nw-nav-label text">{item.label.split(" ")[0]}</span>
                    </NavLink>
                  </li>
                  );
                })}
                <div className="nw-bottomnav-indicator indicator" />
              </ul>
            </nav>
          </>
        )}

        <main className={isCompact ? "nw-content nw-content-compact" : "nw-content"}>
          <Outlet />
        </main>
      </div>
  );
}

function AppShell() {
  return (
    <RefreshProvider>
      <AppShellNav />
    </RefreshProvider>
  );
}

export default AppShell;