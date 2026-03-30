import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CaseManagement from './components/CaseManagement';
import Collaboration from './components/Collaboration';
import UserManagement from './components/UserManagement';
import Calendar from './components/Calendar';
import TaskManagement from './components/TaskManagement';
import ClientManagement from './components/ClientManagement';
import BillingManagement from './components/BillingManagement';
import Auth from './components/Auth';
import ErrorBoundary from './components/ErrorBoundary';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  
  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/cases" element={<CaseManagement />} />
                      <Route path="/collaboration" element={<Collaboration />} />
                      <Route path="/tasks" element={<TaskManagement />} />
                      <Route path="/billing" element={<BillingManagement />} />
                      <Route path="/calendar" element={<Calendar />} />
                      <Route path="/clients" element={<ClientManagement />} />
                      <Route path="/users" element={<UserManagement />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
