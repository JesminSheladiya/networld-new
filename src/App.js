import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import './App.css';
import './components/css/discover-pages.css';
import './components/css/contacts-page.css';
import './components/css/app-shell.css';
import { networldTheme } from './theme';
import Login from './components/Login';
import Register from './components/Register';
import { AuthProvider, useAuth } from './context/AuthContext';

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

function Protected() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/contacts" replace />
          ) : (
            <Login onLoginSuccess={() => {} /* handled by context */} />
          )
        }
      />
      <Route
        path="/register"
        element={
          isAuthenticated ? (
            <Navigate to="/contacts" replace />
          ) : (
            <Register onRegisterSuccess={() => { /* handled by context */ }} />
          )
        }
      />

      <Route element={<Protected />}>
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
  );
}

function App() {
  return (
    <ConfigProvider theme={networldTheme}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;