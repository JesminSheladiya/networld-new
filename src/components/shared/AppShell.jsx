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
  { to: "/discover/find", label: "Find", icon: <SearchOutlined /> },
  { to: "/discover/requests", label: "Requests", icon: <BellOutlined /> },
  { to: "/discover/suggestions", label: "Suggestions", icon: <BulbOutlined /> },
];

const NOTCH = {
  halfWidth: 32, // Controlled wave width
  height: 16,    // Wave height
  corner: 14,    // Outer container radius
};

// ── Strict Dynamic Boundary Clamp SVG Generator ──
function buildConvexBarPath(w, h, rawCx) {
  const { halfWidth: nw, height: nh, corner: r } = NOTCH;

  // Outer corner 'r' se notch bump ki hard boundary lock (screen width independent)
  const minCx = nw + r + 4;
  const maxCx = w - (nw + r + 4);
  const cx = Math.max(minCx, Math.min(maxCx, rawCx));

  const startX = cx - nw;
  const endX = cx + nw;

  return [
    `M 0,${r}`,
    `Q 0,0 ${r},0`,
    `H ${startX}`,
    `C ${startX + 12},0 ${cx - 16},-${nh} ${cx},-${nh}`,
    `C ${cx + 16},-${nh} ${endX - 12},0 ${endX},0`,
    `H ${w - r}`,
    `Q ${w},0 ${w},${r}`,
    `V ${h - r}`,
    `Q ${w},${h} ${w - r},${h}`,
    `H ${r}`,
    `Q 0,${h} 0,${h - r}`,
    "Z",
  ].join(" ");
}

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
                    <button className="nw-profile-action" onClick={() => setProfileOpen(true)}>
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

  const bottomBarRef = useRef(null);
  const bottomPathRef = useRef(null);
  const bottomIndicatorRef = useRef(null);
  const bottomAnimRef = useRef({ raf: null, cx: 0 });
  const bottomPrevWidthRef = useRef(0);
  const [bottomDims, setBottomDims] = useState({ w: 0, h: 60 });

  const getTargetCx = useCallback((idx, width) => {
    if (!width) return 0;
    const tabWidth = width / NAV_ITEMS.length;
    const rawCx = (idx + 0.5) * tabWidth;

    const minCx = NOTCH.halfWidth + NOTCH.corner + 4;
    const maxCx = width - (NOTCH.halfWidth + NOTCH.corner + 4);
    return Math.max(minCx, Math.min(maxCx, rawCx));
  }, []);

  useEffect(() => {
    if (!isCompact) return;
    const el = bottomBarRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBottomDims({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCompact]);

  useEffect(() => {
    if (!isCompact || !bottomDims.w) return;
    const targetCx = getTargetCx(activeIndex, bottomDims.w);
    const widthChanged = bottomPrevWidthRef.current !== bottomDims.w;
    bottomPrevWidthRef.current = bottomDims.w;

    const applyCx = (cx) => {
      if (bottomPathRef.current) {
        bottomPathRef.current.setAttribute("d", buildConvexBarPath(bottomDims.w, bottomDims.h, cx));
      }
      if (bottomIndicatorRef.current) {
        // 44px circle width -> shift by -22px to keep center alignment
        bottomIndicatorRef.current.style.left = `${cx - 22}px`;
      }
    };

    if (bottomAnimRef.current.raf) cancelAnimationFrame(bottomAnimRef.current.raf);
    const fromCx = bottomAnimRef.current.cx || targetCx;
    const duration = fromCx === targetCx || widthChanged ? 0 : 320;
    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const cx = fromCx + (targetCx - fromCx) * easeOutCubic(t);
      applyCx(cx);
      bottomAnimRef.current.cx = cx;
      if (t < 1) bottomAnimRef.current.raf = requestAnimationFrame(step);
    };
    bottomAnimRef.current.raf = requestAnimationFrame(step);
    return () => {
      if (bottomAnimRef.current.raf) cancelAnimationFrame(bottomAnimRef.current.raf);
    };
  }, [activeIndex, isCompact, bottomDims.w, bottomDims.h, getTargetCx]);

  return (
      <div className="nw-shell">
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

              <div className="nw-bottomnav-wrapper">
                <nav className="nw-bottomnav" ref={bottomBarRef}>
                  <svg
                      className="nw-bottomnav-svg"
                      width={bottomDims.w || "100%"}
                      height={bottomDims.h || 60}
                      viewBox={`0 -18 ${bottomDims.w || 1} ${(bottomDims.h || 60) + 18}`}
                      preserveAspectRatio="none"
                      aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="nw-bottombar-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#111827" />
                        <stop offset="100%" stopColor="#0b0f19" />
                      </linearGradient>
                    </defs>
                    <path
                        ref={bottomPathRef}
                        d={buildConvexBarPath(
                            bottomDims.w || 1,
                            bottomDims.h || 60,
                            getTargetCx(activeIndex, bottomDims.w || 1)
                        )}
                        fill="url(#nw-bottombar-fill)"
                        stroke="rgba(255, 255, 255, 0.12)"
                        strokeWidth="1"
                    />
                  </svg>

                  <div className="nw-bottomnav-indicator" ref={bottomIndicatorRef} />

                  <ul>
                    {NAV_ITEMS.map((item, i) => {
                      const isSuggestion = item.to === "/discover/suggestions";
                      const hasSuggestions = isSuggestion && suggestionsCount > 0;
                      const isActive = activeIndex === i;
                      return (
                          <li
                              key={item.to}
                              className={`nw-nav-item ${isActive ? "active" : ""}${hasSuggestions ? " suggestion-has-data" : ""}`}
                          >
                            <NavLink to={item.to} replace>
                        <span className={`nw-nav-icon ${hasSuggestions ? "suggestion-icon-glow" : ""}`}>
                          {item.icon}
                          {item.to === "/discover/requests" && pendingCount > 0 && (
                              <span className="nw-nav-badge-dot">{pendingCount > 99 ? "99+" : pendingCount}</span>
                          )}
                          {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                              <span className="nw-nav-badge-dot">{suggestionsCount > 99 ? "99+" : suggestionsCount}</span>
                          )}
                        </span>
                              {isActive && <span className="nw-nav-label">{item.label}</span>}
                            </NavLink>
                          </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
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