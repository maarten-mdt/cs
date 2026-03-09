import { useEffect } from "react";
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
        <Route index element={<Navigate to="/conversations" replace />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
