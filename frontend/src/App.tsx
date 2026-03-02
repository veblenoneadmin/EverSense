import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { EverSenseLogo } from './components/EverSenseLogo';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { EmailVerified } from './pages/EmailVerified';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { BrainDump } from './pages/BrainDump';
import { Tasks } from './pages/Tasks';
import { Timer } from './pages/Timer';
import { Projects } from './pages/Projects';
import { TimeLogs } from './pages/TimeLogs';
import { Skills } from './pages/Skills';
import { Calendar } from './pages/Calendar';
import { Clients } from './pages/Clients';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Admin } from './pages/Admin';
import { KPIReport } from './pages/KPIReport';
import MainLayout from './components/Layout/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { SessionProvider, useSessionContext } from './contexts/SessionContext';
import { initializeWidgets } from './lib/widgets/widgetRegistry';

// Initialize widgets on app load
initializeWidgets();

function AppContent() {
  const { session, isLoading: isPending } = useSessionContext();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Check if user needs onboarding when session is available
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (session?.user?.id) {
        try {
          const response = await fetch('/api/onboarding/status');
          if (response.ok) {
            const data = await response.json();
            setNeedsOnboarding(data.needsOnboarding);
          } else {
            setNeedsOnboarding(true); // Default to requiring onboarding
          }
        } catch (error) {
          console.error('Error checking onboarding status:', error);
          setNeedsOnboarding(true); // Default to requiring onboarding
        }
      }
      setCheckingOnboarding(false);
    };

    if (session) {
      checkOnboardingStatus();
    } else {
      setCheckingOnboarding(false);
    }
  }, [session]);

  if (isPending || (session && checkingOnboarding)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-surface to-surface-elevated">
        <div className="flex flex-col items-center space-y-6 animate-fade-in">
          <div className="relative">
            <EverSenseLogo height={80} width={468} />
          </div>
          <div className="flex flex-col items-center space-y-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div className="text-lg font-medium text-muted-foreground">Loading EverSense Ai...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <OrganizationProvider>
        <Router>
          <div className="app">
          <Routes>
          <Route 
            path="/login" 
            element={session ? <Navigate to="/dashboard" replace /> : <Login />} 
          />
          <Route 
            path="/register" 
            element={session ? <Navigate to="/dashboard" replace /> : <Register />} 
          />
          <Route 
            path="/forgot-password" 
            element={session ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} 
          />
          <Route 
            path="/reset-password" 
            element={session ? <Navigate to="/dashboard" replace /> : <ResetPassword />} 
          />
          <Route
            path="/email-verified"
            element={<EmailVerified />}
          />
          <Route 
            path="/onboarding" 
            element={session ? <Onboarding /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/*" 
            element={
              session ? 
                (needsOnboarding ? <Navigate to="/onboarding" replace /> : <MainLayout />) :
                <Navigate to="/login" replace />
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="brain-dump" element={<BrainDump />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="timer" element={<Timer />} />
            <Route path="projects" element={<Projects />} />
            <Route path="timesheets" element={<TimeLogs />} />
            <Route path="clients" element={<Clients />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="admin" element={<Admin />} />
            <Route path="skills" element={<Skills />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="kpi-report" element={<KPIReport />} />
          </Route>
          <Route 
            path="/" 
            element={
              session ? 
                (needsOnboarding ? <Navigate to="/onboarding" replace /> : <Navigate to="/dashboard" replace />) :
                <Navigate to="/login" replace />
            } 
          />
          </Routes>
        </div>
        </Router>
      </OrganizationProvider>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}

export default App
