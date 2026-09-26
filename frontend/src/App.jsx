import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/layout/Header.jsx';
import RequireAuth from './components/layout/RequireAuth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewDiagnosis from './pages/NewDiagnosis.jsx';
import Results from './pages/Results.jsx';
import History from './pages/History.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';

function AppShell({ children }) {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-[1280px] px-6 py-8 lg:px-8">{children}</main>
      </div>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
      <Route path="/new-diagnosis" element={<AppShell><NewDiagnosis /></AppShell>} />
      <Route path="/diagnosis/:id" element={<AppShell><Results /></AppShell>} />
      <Route path="/history" element={<AppShell><History /></AppShell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
