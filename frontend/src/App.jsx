import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/layout/Header.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewDiagnosis from './pages/NewDiagnosis.jsx';
import Results from './pages/Results.jsx';
import History from './pages/History.jsx';

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-[1280px] px-6 py-8 lg:px-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new-diagnosis" element={<NewDiagnosis />} />
          <Route path="/diagnosis/:id" element={<Results />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
