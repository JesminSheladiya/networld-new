import { useEffect, useState, useCallback, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Dropdown, Avatar } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faLightbulb, faCircleUser } from "@fortawesome/free-regular-svg-icons";
import { faUsers, faMagnifyingGlass, faArrowRightFromBracket, faLanguage, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../context/AuthContext";
import { useRelationDisplay } from "../../context/RelationDisplayContext";
import { api } from "../../Services/networld";
import { RefreshProvider, useRefresh } from "./RefreshContext";
import ConfirmPopup from "./ConfirmPopup";
import { MQ_COMPACT, SMALL_SCREEN_PX, formatCount } from "../../constants";

const NAV_ITEMS = [
  { to: "/contacts", label: "Contacts", icon: <FontAwesomeIcon icon={faUsers} /> },
  { to: "/discover/find", label: "Find", icon: <FontAwesomeIcon icon={faMagnifyingGlass} /> },
  { to: "/discover/requests", label: "Requests", icon: <FontAwesomeIcon icon={faBell} /> },
  { to: "/discover/suggestions", label: "Suggestions", icon: <FontAwesomeIcon icon={faLightbulb} /> },
];

// 1. Default Notch Configuration (Screen width >= 390px)
const NOTCH_DEFAULT = {
  halfWidth: 38, // Wave width
  height: 18,    // Wave height
  corner: 20,    // Outer container radius
};

// 2. Mobile Notch Configuration (Screen width < 390px)
const NOTCH_MOBILE = {
  halfWidth: 32, // Wave width
  height: 16,    // Wave height
  corner: 12,    // Outer container radius
};

// Organic Notch Path Generator
function buildConvexBarPath(w, h, rawCx) {
  // Screen width threshold updated to 390
  const isSmallScreen = typeof window !== "undefined" && window.innerWidth < SMALL_SCREEN_PX;
  const { halfWidth: nw, height: nh, corner: r } = isSmallScreen ? NOTCH_MOBILE : NOTCH_DEFAULT;

  const minCx = nw + r + 2;
  const maxCx = w - (nw + r + 2);
  const cx = Math.max(minCx, Math.min(maxCx, rawCx));

  const startX = cx - nw;
  const endX = cx + nw;

  const c1 = isSmallScreen ? 12 : 14;
  const c2 = isSmallScreen ? 14 : 16;

  return [
    `M 0,${r}`,
    `Q 0,0 ${r},0`,
    `H ${startX}`,
    `C ${startX + c1},0 ${cx - c2},-${nh} ${cx},-${nh}`,
    `C ${cx + c2},-${nh} ${endX - c1},0 ${endX},0`,
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
  const { user, logout: authLogout, broadcastLogout } = useAuth();
  const { openPicker } = useRelationDisplay();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const fullName = user?.fullName || user?.username || "User";
  const nameParts = fullName.split(" ").filter(Boolean);
  const initials = nameParts.length > 1
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
      : fullName.slice(0, 2).toUpperCase();
  const email = user?.email || "user@mail.com";
  const profileAvatar = user?.profilePicture || user?.avatar || user?.image || null;

  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = () => {
    setDropdownOpen(false);
    setLogoutOpen(true);
  };

  const confirmLogout = () => {
    setLogoutOpen(false);
    authLogout();
    broadcastLogout();
    navigate("/login", { replace: true });
  };

  const closeDropdown = () => setDropdownOpen(false);

  const goProfile = () => {
    closeDropdown();
    navigate("/profile");
  };

  return (
      <>
        <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            popupClassName="nw-profile-popup"
            open={dropdownOpen}
            onVisibleChange={setDropdownOpen}
            dropdownRender={() => (
                <div className="nw-profile-dropdown">
                  <div className="nw-profile-head">
                    <Avatar
                        size={38}
                        src={profileAvatar}
                        className="nw-profile-avatar"
                        style={{
                          background: "linear-gradient(135deg, rgba(59, 130, 246, 0.85), rgba(37, 99, 235, 0.85))",
                          color: "#fff",
                          fontWeight: 700,
                          flexShrink: 0,
                          cursor: "pointer",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          goProfile();
                        }}
                    >
                      {!profileAvatar && initials}
                    </Avatar>
                    <div className="nw-profile-meta">
                      <div className="nw-profile-name">{fullName}</div>
                      <div className="nw-profile-email">{email}</div>
                    </div>
                  </div>
                  <div className="nw-profile-actions">
                    <button className="nw-profile-action" onClick={goProfile}>
                      <span className="nw-profile-action-icon"><FontAwesomeIcon icon={faCircleUser} /></span>
                      <span>Account setting</span>
                    </button>
                    <button className="nw-profile-action" onClick={() => { openPicker(); closeDropdown(); }}>
                      <span className="nw-profile-action-icon"><FontAwesomeIcon icon={faLanguage} /></span>
                      <span>Relation Display</span>
                    </button>
                    <button className="nw-profile-action" onClick={() => { closeDropdown(); navigate("/profile/sessions"); }}>
                      <span className="nw-profile-action-icon"><FontAwesomeIcon icon={faShieldHalved} /></span>
                      <span>Sessions</span>
                    </button>
                  </div>
                  <div className="nw-profile-divider" />
                  <div className="nw-profile-actions nw-profile-actions-bottom">
                    <button className="nw-profile-action nw-profile-logout" onClick={handleLogout}>
                      <span className="nw-profile-action-icon"><FontAwesomeIcon icon={faArrowRightFromBracket} /></span>
                      <span>Logout</span>
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

        <ConfirmPopup
            open={logoutOpen}
            title="Logout?"
            message="Are you sure you want to logout from NetWorld?"
            okText="Logout"
            okIcon={faArrowRightFromBracket}
            onCancel={() => setLogoutOpen(false)}
            onOk={confirmLogout}
        />
      </>
  );
}

function AppShellNav() {
  const location = useLocation();
  const scrollPositionsRef = useRef(new Map());
  const previousPathRef = useRef(location.pathname);

  // Keep each top-level page's scroll position while opening a profile or
  // switching tabs. The delayed restore is needed because list pages fetch
  // their rows after the route has mounted; restoring too early gets clamped
  // back to zero while the page is still short.
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const saveBeforeNavigation = () => {
      scrollPositionsRef.current.set(location.pathname, window.scrollY);
    };
    // Capture before React Router handles the click; after navigation the
    // browser may already have reset scrollY to zero.
    window.addEventListener("click", saveBeforeNavigation, true);
    return () => {
      window.removeEventListener("click", saveBeforeNavigation, true);
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "auto";
    };
  }, [location.pathname]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    // A route transition can reset the browser to 0 before this effect runs;
    // never replace a captured non-zero position with that reset value.
    if (window.scrollY > 0 || !scrollPositionsRef.current.has(previousPath)) {
      scrollPositionsRef.current.set(previousPath, window.scrollY);
    }
    previousPathRef.current = location.pathname;
    const savedTop = scrollPositionsRef.current.get(location.pathname) || 0;
    // New/reloaded pages should be placed at the top once only. Delayed
    // retries are only for a previously saved non-zero position; otherwise a
    // user who starts scrolling during the initial fetch gets pulled back to
    // the top by a late retry.
    if (savedTop === 0) {
      window.scrollTo(0, 0);
      return;
    }
    const restore = () => window.scrollTo(0, savedTop);
    requestAnimationFrame(restore);
    const firstRetry = window.setTimeout(restore, 100);
    const secondRetry = window.setTimeout(restore, 500);
    const thirdRetry = window.setTimeout(restore, 1200);
    const fourthRetry = window.setTimeout(restore, 2200);
    return () => {
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);
      window.clearTimeout(thirdRetry);
      window.clearTimeout(fourthRetry);
    };
  }, [location.pathname]);

  // -1 when the route is not a tab (e.g. /profile): no tab highlights,
  // and the bottom notch parks at the last visited tab.
  const activeIndex = (() => {
    const p = location.pathname;
    if (p.startsWith("/contacts")) return 0;
    return NAV_ITEMS.findIndex((it) => p === it.to);
  })();
  // No bottom nav on profile pages (mobile) — they have their own
  // Back button and full-width content. Own (/profile) + other users'
  // (/contacts/:username...) profiles; the contacts list keeps it.
  const hideBottomNav =
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/contacts/");
  const lastTabRef = useRef(0);
  if (activeIndex >= 0) lastTabRef.current = activeIndex;
  const notchIndex = activeIndex >= 0 ? activeIndex : lastTabRef.current;

  const [isCompact, setIsCompact] = useState(() => window.matchMedia(MQ_COMPACT).matches);
  const [bottomNavHidden, setBottomNavHidden] = useState(false);
  const { pendingCount, suggestionsCount, setPendingCount, setSuggestionsCount, key: refreshKey } = useRefresh();
  const topNavRef = useRef(null);
  const topItemRefs = useRef([]);
  const [topIndicator, setTopIndicator] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const mq = window.matchMedia(MQ_COMPACT);
    const onChange = (e) => setIsCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // LinkedIn-style mobile/tablet navigation: hide while scrolling down and
  // reveal as soon as the user reverses direction.
  useEffect(() => {
    if (!isCompact || hideBottomNav) {
      setBottomNavHidden(false);
      return;
    }
    let lastY = window.scrollY;
    let lastUserInputAt = 0;
    const markUserInput = () => { lastUserInputAt = Date.now(); };
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      // Ignore scroll adjustments caused by rows loading/reflowing. They can
      // be 1px in either direction and must not make the nav blink.
      if (Date.now() - lastUserInputAt > 800) {
        lastY = y;
        return;
      }
      // Keep it visible for the first 200px. After that, even a 1px
      // downward movement hides it, while any upward movement reveals it.
      if (y <= 200 || delta < 0) setBottomNavHidden(false);
      else if (delta > 0) setBottomNavHidden(true);
      lastY = y;
    };
    window.addEventListener("wheel", markUserInput, { passive: true });
    window.addEventListener("touchstart", markUserInput, { passive: true });
    window.addEventListener("touchmove", markUserInput, { passive: true });
    window.addEventListener("keydown", markUserInput);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", markUserInput);
      window.removeEventListener("touchstart", markUserInput);
      window.removeEventListener("touchmove", markUserInput);
      window.removeEventListener("keydown", markUserInput);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isCompact, hideBottomNav, location.pathname]);

  const fetchCounts = useCallback(async () => {
    try {
      // Count endpoints only: full-list fetches here cost a 5MB payload
      // plus a ~1min suggestion regen on mega-hubs per badge refresh.
      const [pendingRes, suggestionsRes] = await Promise.all([
        api.pendingCount(),
        api.suggestionsCount(),
      ]);
      setPendingCount(pendingRes.data?.count || 0);
      setSuggestionsCount(suggestionsRes.data?.count || 0);
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
    if (activeIndex < 0) {
      setTopIndicator((t) => ({ ...t, ready: false }));
      return;
    }
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
  const bottomItemRefs = useRef([]);
  const bottomAnimRef = useRef({ raf: null, cx: 0 });
  const bottomPrevWidthRef = useRef(0);
  const [bottomDims, setBottomDims] = useState({ w: 0, h: 60 });

  // Bumped whenever the bottom nav (re)mounts — its refs and measured
  // dims go stale while unmounted (profile pages), which would otherwise
  // freeze the notch in a broken state on return.
  const [bottomNavRev, setBottomNavRev] = useState(0);
  useEffect(() => {
    if (!isCompact || hideBottomNav) return;
    setBottomNavRev((r) => r + 1);
  }, [isCompact, hideBottomNav]);

  // Exact DOM Element Center Calculation
  const getTargetCx = useCallback((idx) => {
    const barEl = bottomBarRef.current;
    const itemEl = bottomItemRefs.current[idx];
    if (!barEl || !itemEl) return 0;

    const barRect = barEl.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();

    // Exact horizontal center point of the Icon/Tab
    return (itemRect.left - barRect.left) + (itemRect.width / 2);
  }, []);

  useEffect(() => {
    if (!isCompact || hideBottomNav) return;
    const el = bottomBarRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBottomDims({ w: r.width, h: r.height || 60 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCompact, hideBottomNav, bottomNavRev]);

  useEffect(() => {
    if (!isCompact || !bottomDims.w || hideBottomNav) return;
    const targetCx = getTargetCx(notchIndex);
    const widthChanged = bottomPrevWidthRef.current !== bottomDims.w;
    bottomPrevWidthRef.current = bottomDims.w;

    const applyCx = (cx) => {
      if (bottomPathRef.current) {
        bottomPathRef.current.setAttribute("d", buildConvexBarPath(bottomDims.w, bottomDims.h, cx));
      }
      if (bottomIndicatorRef.current) {
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
    const animRef = bottomAnimRef.current;
    return () => {
      if (animRef.raf) cancelAnimationFrame(animRef.raf);
    };
  }, [notchIndex, isCompact, bottomDims.w, bottomDims.h, getTargetCx, hideBottomNav, bottomNavRev]);

  return (
      <div className="nw-shell">
        {!isCompact ? (
            <header className="nw-topnav">
              <div className="nw-brand">
                <span className="nw-brand-dot" />
                <span className="nw-brand-text">NetWorld</span>
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
                            <span className="nw-nav-badge" title={pendingCount}>{formatCount(pendingCount)}</span>
                        )}
                        {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                            <span className="nw-nav-badge" title={suggestionsCount}>{formatCount(suggestionsCount)}</span>
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
                  <span className="nw-brand-text">NetWorld</span>
                </div>
                <ProfileMenu />
              </header>

              {!hideBottomNav && (
               <div className={`nw-bottomnav-wrapper${bottomNavHidden ? " nw-bottomnav-wrapper-hidden" : ""}`}>
                <nav className="nw-bottomnav" ref={bottomBarRef}>
                  <svg
                      className="nw-bottomnav-svg"
                      width={bottomDims.w || "100%"}
                      height={bottomDims.h || 60}
                      viewBox={`0 -22 ${bottomDims.w || 1} ${(bottomDims.h || 60) + 22}`}
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
                            getTargetCx(notchIndex)
                        )}
                        fill="url(#nw-bottombar-fill)"
                        stroke="rgba(56, 189, 248, 0.35)"
                        strokeWidth="1.25"
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
                              ref={(el) => (bottomItemRefs.current[i] = el)}
                              className={`nw-nav-item ${isActive ? "active" : ""}${hasSuggestions ? " suggestion-has-data" : ""}`}
                          >
                            <NavLink to={item.to} replace aria-label={item.label}>
                              <span className={`nw-nav-icon ${hasSuggestions ? "suggestion-icon-glow" : ""}`}>
                                {item.icon}
                                {item.to === "/discover/requests" && pendingCount > 0 && (
                                    <span className="nw-nav-badge-dot" title={pendingCount}>{formatCount(pendingCount)}</span>
                                )}
                                {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                                    <span className="nw-nav-badge-dot" title={suggestionsCount}>{formatCount(suggestionsCount)}</span>
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
              )}
            </>
        )}

        <main className={isCompact ? `nw-content nw-content-compact${hideBottomNav ? " nw-content-no-bottomnav" : ""}` : "nw-content"}>
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
