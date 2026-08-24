import { useEffect, useState, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
    navigate("/login");
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
  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 1024px)").matches);
  const { pendingCount, suggestionsCount, setPendingCount, setSuggestionsCount, key: refreshKey } = useRefresh();

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

  return (
    <div className="nw-shell">
        {!isCompact ? (
          <header className="nw-topnav">
            <div className="nw-brand">
              <span className="nw-brand-dot" />
              <span className="nw-brand-text">Net World</span>
            </div>
            <nav className="nw-topnav-links">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? "nw-topnav-link active" : "nw-topnav-link")}
                >
                  {item.icon}
                  {item.label}
                  {item.to === "/discover/requests" && pendingCount > 0 && (
                    <span className="nw-nav-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>
                  )}
                  {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                    <span className="nw-nav-badge">{suggestionsCount > 99 ? "99+" : suggestionsCount}</span>
                  )}
                </NavLink>
              ))}
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
            <nav className="nw-bottomnav">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? "nw-nav-item active" : "nw-nav-item")}
                >
                  <span className="nw-nav-icon-wrap">
                    {item.icon}
                    {item.to === "/discover/requests" && pendingCount > 0 && (
                      <span className="nw-nav-badge-dot">{pendingCount > 99 ? "99+" : pendingCount}</span>
                    )}
                    {item.to === "/discover/suggestions" && suggestionsCount > 0 && (
                      <span className="nw-nav-badge-dot">{suggestionsCount > 99 ? "99+" : suggestionsCount}</span>
                    )}
                  </span>
                  <span className="nw-nav-label">{item.label.split(" ")[0]}</span>
                </NavLink>
              ))}
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