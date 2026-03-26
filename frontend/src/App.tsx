import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import { RequireAdmin } from "./components/RequireAdmin";
import { AppLayout } from "./components/AppLayout";
import { useAuthStore } from "./stores/useAuthStore";
import { LoginPage } from "./pages/LoginPage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReviewPage } from "./pages/ReviewPage";

// Lazy-loaded hub pages (route-level code splitting)
const HubPage = lazy(() => import("./pages/hub/HubPage"));
const CannedResponsesPage = lazy(() => import("./pages/hub/CannedResponsesPage"));

function LazyFallback() {
  return <div className="flex items-center justify-center h-full text-gray-400 animate-pulse">Loading...</div>;
}

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/hub" replace />} />
        <Route
          path="hub"
          element={
            <Suspense fallback={<LazyFallback />}>
              <HubPage />
            </Suspense>
          }
        />
        <Route
          path="hub/canned-responses"
          element={
            <Suspense fallback={<LazyFallback />}>
              <CannedResponsesPage />
            </Suspense>
          }
        />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
