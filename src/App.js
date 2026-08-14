import { useState, useEffect } from 'react';
import './App.css';
import ContactsTable from './components/ContactTable';
import Login from './components/Login';
import Register from './components/Register';
import UserProfile from "./components/UserProfile";
import { FiLogOut, FiUser, FiSettings } from 'react-icons/fi';
import { getToken, getUser, logout } from './Services/authService';
import { Dropdown, ConfigProvider, theme, Button, Avatar } from 'antd';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentForm, setCurrentForm] = useState('login');
  const [profileOpen, setProfileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentUser, setCurrentUser] = useState(getUser());
  const fullName = currentUser?.fullName || currentUser?.username || 'User';
  const nameParts = fullName.split(' ').filter(Boolean);
  const firstName = nameParts[0] || 'User';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : fullName.slice(0, 2).toUpperCase();
  const email = currentUser?.email || 'user@mail.com';
  const profileAvatar = currentUser?.profilePicture || currentUser?.avatar || currentUser?.image || null;

  useEffect(() => {
    const token = getToken();
    if (token) {
      setIsAuthenticated(true);
      setCurrentUser(getUser());
    }
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentUser(getUser());
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setCurrentUser({});
    setDropdownOpen(false);
  };

  const handleProfileUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
    setProfileOpen(false);
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div className="App">
        {isAuthenticated ? (
          <>
            <div className="app-header-avatar" style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000 }}>
              <Dropdown
                open={dropdownOpen}
                onOpenChange={setDropdownOpen}
                dropdownRender={() => (
                  <div className="app-dropdown-menu" style={{
                    width: 260,
                    borderRadius: 24,
                    background: '#111827',
                    color: '#f8fafc',
                    overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                  }}
                  >
                    <div className="app-dropdown-header" style={{ padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="app-dropdown-user" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar
                          size={42}
                          src={profileAvatar}
                          style={{ backgroundColor: '#1f2937', color: '#7dd3fc', borderRadius: '50%' }}
                        >
                          {!profileAvatar && initials}
                        </Avatar>
                        <div className="app-dropdown-user-info" style={{ overflow: 'hidden', minWidth: 0 }}>
                          <div className="app-dropdown-user-name" style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
                          <div className="app-dropdown-user-email" style={{ fontSize: 13, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
                        </div>
                      </div>
                    </div>
                    <div className="app-dropdown-actions" style={{ padding: '10px 0' }}>
                      <button
                        className="app-btn-profile"
                        type="button"
                        onClick={() => {
                          setProfileOpen(true);
                          setDropdownOpen(false);
                        }}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          color: '#f8fafc',
                          fontSize: 14,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 18px',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248, 250, 252, 0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <FiSettings style={{ fontSize: 18, color: '#7dd3fc' }} />
                        <span>Profile Settings</span>
                      </button>
                    </div>
                    <div className="app-dropdown-footer" style={{ padding: '10px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        className="app-btn-logout"
                        type="button"
                        onClick={handleLogout}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          color: '#f8fafc',
                          fontSize: 15,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                          padding: '12px 14px',
                          borderRadius: 14,
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248, 250, 252, 0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <FiLogOut style={{ fontSize: 18, color: '#f8fafc' }} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
                placement="bottomRight"
                trigger={['click']}
              >
                <div className="app-avatar-trigger" style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: '#111827',
                  display: 'grid',
                  placeItems: 'center',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                }}>
                  <Avatar
                    size={40}
                    src={profileAvatar}
                    style={{ backgroundColor: '#1f2937', color: '#ffffff', fontWeight: 700, borderRadius: '50%' }}
                  >
                    {!profileAvatar && initials}
                  </Avatar>
                </div>
              </Dropdown>
            </div>

            <ContactsTable refreshTrigger={refreshTrigger} />

            <UserProfile
              open={profileOpen}
              onClose={() => setProfileOpen(false)}
              onProfileUpdate={handleProfileUpdate}
              onRelationAccepted={() => {
                  setRefreshTrigger(prev => prev + 1);
                  setProfileOpen(false);
              }}
            />
          </>
        ) : currentForm === 'login' ? (
          <Login
            onLoginSuccess={handleLoginSuccess}
            onSwitchForm={() => setCurrentForm('register')}
          />
        ) : (
          <Register
            onRegisterSuccess={handleLoginSuccess}
            onSwitchForm={() => setCurrentForm('login')}
          />
        )}
      </div>
    </ConfigProvider>
  );
}

export default App;