import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { LookupsProvider } from './context/LookupsContext';
import AppLayout from './layouts/AppLayout';
import { PageLoader } from './components/ui/Loading';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DailyEntry from './pages/DailyEntry';
import EntryHistory from './pages/EntryHistory';
import EntryDetails from './pages/EntryDetails';
import DailyActivityPrint from './pages/DailyActivityPrint';
import Reports from './pages/Reports';
import MonthlyPlan from './pages/MonthlyPlan';
import StudentsMarkEntry from './pages/StudentsMarkEntry';
import Settings from './pages/Settings';
import ManagerSetup from './pages/ManagerSetup';
import Users from './pages/Users';
import Master from './pages/Master';
import MasterHome from './pages/master/MasterHome';
import MasterList from './pages/master/MasterList';
import Scheduling from './pages/master/Scheduling';
import Biometric from './pages/master/Biometric';
import BatchImport from './pages/master/BatchImport';
import DataUpload from './pages/admin/DataUpload';
import MyWork from './pages/MyWork';
import HrPolicy from './pages/hr/HrPolicy';
import YourInfo from './pages/hr/YourInfo';
import BatchCompletion from './pages/hr/BatchCompletion';
import LeaveForm from './pages/hr/LeaveForm';
import NotFound from './pages/NotFound';

function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <PageLoader label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup-manager" element={<ManagerSetup />} />
            <Route
              element={
                <RequireAuth>
                  <LookupsProvider>
                    <AppLayout />
                  </LookupsProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="faculty/daily-activity/entry" element={<DailyEntry />} />
              <Route path="faculty/daily-activity/entry/:id" element={<DailyEntry />} />
              <Route path="faculty/daily-activity/history" element={<EntryHistory />} />
              <Route path="faculty/daily-activity/print" element={<DailyActivityPrint />} />
              <Route path="entries/:id" element={<EntryDetails />} />
              <Route path="faculty/monthly-plan" element={<MonthlyPlan />} />
              <Route path="faculty/students-mark-entry" element={<StudentsMarkEntry />} />
              <Route path="faculty/reports/:type" element={<Reports />} />
              <Route path="faculty/others" element={<Navigate to="/faculty/daily-activity/entry?type=others" replace />} />
              <Route path="master" element={<MasterHome />} />
              <Route path="master/courses" element={<Master />} />
              <Route path="master/employees" element={<Users />} />
              <Route path="master/scheduling" element={<Scheduling />} />
              <Route path="master/biometric" element={<Biometric />} />
              <Route path="master/batch-import" element={<BatchImport />} />
              <Route path="master/:key" element={<MasterList />} />
              <Route path="admin/data-upload" element={<DataUpload />} />
              <Route path="my-work" element={<MyWork />} />
              <Route path="hr-report" element={<Navigate to="/hr-report/policy" replace />} />
              <Route path="hr-report/policy" element={<HrPolicy />} />
              <Route path="hr-report/your-info" element={<YourInfo />} />
              <Route path="hr-report/batch-paper-completion" element={<BatchCompletion />} />
              <Route path="hr-report/leave-permission" element={<LeaveForm />} />
              <Route path="users" element={<Navigate to="/master/employees" replace />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
