import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import './App.css';
import './components/css/discover-pages.css';
import './components/css/contacts-page.css';
import './components/css/app-shell.css';
import { getToken } from './Services/authService';
import { networldTheme } from './theme';
import Login from './components/Login';
import Register from './components/Register';

const AppShell = lazy(() => import('./components/shared/AppShell'));
const ContactsPage = lazy(() => import('./components/contacts/ContactsPage'));
const ContactDetailPage = lazy(() => import('./components/contacts/ContactDetailPage'));
const FindPeoplePage = lazy(() => import('./components/discover/FindPeoplePage'));
const RequestsPage = lazy(() => import('./components/discover/RequestsPage'));
const SuggestionsPage = lazy(() => import('./components/discover/SuggestionsPage'));

function PageLoader() {
  return (
    <div className="app-loading">
      <Spin size="large" />
    </div>
  );
}

function Protected({ isAuthenticated }) {
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getToken());

  return (
    <ConfigProvider theme={networldTheme}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/login"
              element={
                isAuthenticated ? (
                  <Navigate to="/contacts" replace />
                ) : (
                  <Login onLoginSuccess={() => setIsAuthenticated(true)} />
                )
              }
            />
            <Route
              path="/register"
              element={
                isAuthenticated ? (
                  <Navigate to="/contacts" replace />
                ) : (
                  <Register onRegisterSuccess={() => setIsAuthenticated(true)} />
                )
              }
            />

            <Route element={<Protected isAuthenticated={isAuthenticated} />}>
              <Route element={<AppShell />}>
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/contacts/:email" element={<ContactDetailPage />} />
                <Route path="/discover/find" element={<FindPeoplePage />} />
                <Route path="/discover/requests" element={<RequestsPage />} />
                <Route path="/discover/suggestions" element={<SuggestionsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/contacts" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;