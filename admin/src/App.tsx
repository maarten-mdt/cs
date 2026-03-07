import { Routes, Route, Link } from "react-router-dom";
import { Conversations } from "./pages/Conversations";
import { ConversationDetail } from "./pages/ConversationDetail";
import { Settings } from "./pages/Settings";
import { DataSources } from "./pages/DataSources";
import { SourceDetail } from "./pages/SourceDetail";
import { Connections } from "./pages/Connections";
import { Customers } from "./pages/Customers";
import { Instructions } from "./pages/Instructions";

interface AppProps {
  apiUrl: string;
}

export default function App({ apiUrl }: AppProps) {
  const baseUrl = apiUrl || (window.location.origin.replace(/\/admin.*/, ""));

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-4 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-semibold">
              MDT Chat Admin
            </Link>
            <div className="flex gap-4">
              <Link to="/connections" className="text-sm text-gray-400 hover:text-white">
                Connections
              </Link>
              <Link to="/customers" className="text-sm text-gray-400 hover:text-white">
                Customers
              </Link>
              <Link to="/sources" className="text-sm text-gray-400 hover:text-white">
                Data sources
              </Link>
              <Link to="/instructions" className="text-sm text-gray-400 hover:text-white">
                Instructions
              </Link>
              <Link to="/settings" className="text-sm text-gray-400 hover:text-white">
                Settings
              </Link>
            </div>
          </div>
          <span className="text-sm text-gray-400">Conversations & Live Monitor</span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Conversations apiUrl={baseUrl} />} />
          <Route path="/conversations/:id" element={<ConversationDetail apiUrl={baseUrl} />} />
          <Route path="/connections" element={<Connections apiUrl={baseUrl} />} />
          <Route path="/customers" element={<Customers apiUrl={baseUrl} />} />
          <Route path="/sources" element={<DataSources apiUrl={baseUrl} />} />
          <Route path="/sources/:id" element={<SourceDetail apiUrl={baseUrl} />} />
          <Route path="/instructions" element={<Instructions apiUrl={baseUrl} />} />
          <Route path="/settings" element={<Settings apiUrl={baseUrl} />} />
        </Routes>
      </main>
    </div>
  );
}
