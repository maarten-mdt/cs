import { Outlet, NavLink } from "react-router-dom";
import {
  Headphones,
  MessageSquare,
  Users,
  BookOpen,
  BarChart3,
  Plug,
  Settings,
  ClipboardCheck,
  Code,
  Zap,
} from "lucide-react";
import { useAuthStore } from "../stores/useAuthStore";

const navItems = [
  { to: "/hub", icon: Headphones, label: "Agent Hub" },
  { to: "/hub/canned-responses", icon: Zap, label: "Canned Responses" },
  { to: "/conversations", icon: MessageSquare, label: "Conversations" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/knowledge", icon: BookOpen, label: "Knowledge" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/review", icon: ClipboardCheck, label: "Review" },
  { to: "/chat-widget", icon: Code, label: "Chat Widget" },
  { to: "/connections", icon: Plug, label: "Connections" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function AppLayout() {
  const { user } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="w-56 flex flex-col bg-panel border-r border-border-dark">
        <div className="flex-1 p-4">
          <nav className="space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-accent/20 text-accent font-medium"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="border-t border-border-dark p-4 space-y-2">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-accent/30 flex items-center justify-center text-accent text-sm font-medium">
                {user?.name?.[0] || user?.email?.[0] || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                {user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={() => useAuthStore.getState().logout()}
            className="w-full text-left text-xs text-gray-400 hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border-dark flex items-center px-6">
          <span className="text-sm text-gray-400">MDT Support Admin</span>
        </header>
        <div className="flex-1 p-6 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
