import { useState, useCallback } from "react";
import { useHubStore } from "../../stores/hubStore";
import { hubApi } from "../../lib/hubApi";
import {
  User,
  Mail,
  Phone,
  ShoppingBag,
  DollarSign,
  Tag as TagIcon,
  UserPlus,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  X,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";

interface Props {
  ticketId: string;
}

export function RightPanel({ ticketId }: Props) {
  const ticketCache = useHubStore((s) => s.ticketCache);
  const tickets = useHubStore((s) => s.tickets);
  const agents = useHubStore((s) => s.agents);
  const tags = useHubStore((s) => s.tags);
  const patchTicket = useHubStore((s) => s.patchTicket);
  const cacheTicketDetail = useHubStore((s) => s.cacheTicketDetail);

  const detail = ticketCache.get(ticketId);
  const ticket = tickets.get(ticketId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);

  useHotkeys("a", () => setShowAssignDropdown((v) => !v), { preventDefault: true });
  useHotkeys("t", () => setShowTagPicker((v) => !v), { preventDefault: true });
  useHotkeys("p", () => cyclePriority(), { preventDefault: true });

  const toggle = (section: string) =>
    setCollapsed((c) => ({ ...c, [section]: !c[section] }));

  const handleAssign = useCallback(async (agentId: string | null) => {
    setShowAssignDropdown(false);
    patchTicket(ticketId, {
      assignedTo: agentId
        ? { id: agentId, name: agents.get(agentId)?.name || null, email: agents.get(agentId)?.email || "" }
        : null,
    });
    try {
      await hubApi.updateConversation(ticketId, { assignedToId: agentId || null });
    } catch (e) {
      console.error("Assign failed:", e);
    }
  }, [ticketId, agents, patchTicket]);

  const handleStatusChange = useCallback(async (status: string) => {
    patchTicket(ticketId, { status });
    try {
      await hubApi.updateConversation(ticketId, { status });
    } catch (e) {
      console.error("Status change failed:", e);
    }
  }, [ticketId, patchTicket]);

  const cyclePriority = useCallback(async () => {
    const order = ["NORMAL", "HIGH", "URGENT", "LOW"];
    const current = ticket?.priority || "NORMAL";
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    patchTicket(ticketId, { priority: next });
    try {
      await hubApi.updateConversation(ticketId, { priority: next });
    } catch (e) {
      console.error("Priority change failed:", e);
    }
  }, [ticketId, ticket?.priority, patchTicket]);

  const handleAddTag = useCallback(async (tagId: string) => {
    setShowTagPicker(false);
    try {
      const tag = await hubApi.addTagToConversation(ticketId, tagId);
      if (detail) {
        cacheTicketDetail(ticketId, { ...detail, tags: [...detail.tags, tag] });
      }
    } catch (e) {
      console.error("Add tag failed:", e);
    }
  }, [ticketId, detail, cacheTicketDetail]);

  const handleRemoveTag = useCallback(async (tagId: string) => {
    try {
      await hubApi.removeTagFromConversation(ticketId, tagId);
      if (detail) {
        cacheTicketDetail(ticketId, { ...detail, tags: detail.tags.filter((t) => t.id !== tagId) });
      }
    } catch (e) {
      console.error("Remove tag failed:", e);
    }
  }, [ticketId, detail, cacheTicketDetail]);

  if (!detail && !ticket) return null;

  const customer = detail?.customer;
  const ticketTags = detail?.tags || [];
  const phoneCalls = detail?.phoneCalls || [];

  return (
    <div className="p-4 space-y-4 text-sm">
      {/* Status Actions */}
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {["OPEN", "PENDING", "RESOLVED"].map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`text-[10px] px-2 py-1 rounded ${
                (detail?.status || ticket?.status) === s
                  ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                  : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Assignment */}
      <Section
        title="Assigned To"
        icon={UserPlus}
        collapsed={collapsed["assign"]}
        onToggle={() => toggle("assign")}
      >
        <div className="relative">
          <button
            onClick={() => setShowAssignDropdown((v) => !v)}
            className="w-full text-left px-2 py-1.5 bg-surface border border-border-dark rounded text-xs text-gray-300 hover:text-white"
          >
            {detail?.assignedTo?.name || detail?.assignedTo?.email || "Unassigned"}
          </button>
          {showAssignDropdown && (
            <div className="absolute z-10 mt-1 w-full bg-panel border border-border-dark rounded-md shadow-lg max-h-48 overflow-y-auto">
              <button
                onClick={() => handleAssign(null)}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-white/5"
              >
                Unassigned
              </button>
              {Array.from(agents.values()).map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleAssign(a.id)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5"
                >
                  {a.name || a.email}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Priority */}
      <Section
        title="Priority"
        icon={AlertTriangle}
        collapsed={collapsed["priority"]}
        onToggle={() => toggle("priority")}
      >
        <div className="flex gap-1.5">
          {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => {
            const colors: Record<string, string> = {
              LOW: "text-gray-400",
              NORMAL: "text-blue-400",
              HIGH: "text-orange-400",
              URGENT: "text-red-400",
            };
            return (
              <button
                key={p}
                onClick={() => {
                  patchTicket(ticketId, { priority: p });
                  hubApi.updateConversation(ticketId, { priority: p });
                }}
                className={`text-[10px] px-2 py-1 rounded ${
                  (detail?.priority || ticket?.priority) === p
                    ? `bg-white/10 ${colors[p]} ring-1 ring-current`
                    : `text-gray-500 hover:${colors[p]}`
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Tags */}
      <Section
        title="Tags"
        icon={TagIcon}
        collapsed={collapsed["tags"]}
        onToggle={() => toggle("tags")}
      >
        <div className="flex flex-wrap gap-1 mb-2">
          {ticketTags.map((tag) => (
            <span
              key={tag.id}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: tag.color + "30", color: tag.color }}
            >
              {tag.name}
              <button onClick={() => handleRemoveTag(tag.id)} className="hover:opacity-70">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
        <button
          onClick={() => setShowTagPicker((v) => !v)}
          className="text-[10px] text-accent hover:underline"
        >
          + Add tag
        </button>
        {showTagPicker && (
          <div className="mt-1 bg-panel border border-border-dark rounded-md shadow-lg max-h-32 overflow-y-auto">
            {tags.filter((t) => !ticketTags.some((tt) => tt.id === t.id)).map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddTag(tag.id)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
            {tags.filter((t) => !ticketTags.some((tt) => tt.id === t.id)).length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-500">No more tags</p>
            )}
          </div>
        )}
      </Section>

      {/* Customer Info */}
      {customer && (
        <Section
          title="Customer"
          icon={User}
          collapsed={collapsed["customer"]}
          onToggle={() => toggle("customer")}
        >
          <div className="space-y-1.5">
            {customer.name && (
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <User className="h-3 w-3 text-gray-500" />
                {customer.name}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <Mail className="h-3 w-3 text-gray-500" />
              {customer.email}
            </div>
            {customer.phone && (
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <Phone className="h-3 w-3 text-gray-500" />
                {customer.phone}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <ShoppingBag className="h-3 w-3 text-gray-500" />
              {customer.orderCount} orders
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <DollarSign className="h-3 w-3 text-gray-500" />
              ${customer.totalSpend.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              Region: {customer.storeRegion}
              {customer.shopifyId && ` · Shopify: ${customer.shopifyId}`}
            </div>
          </div>
        </Section>
      )}

      {/* Phone Calls */}
      {phoneCalls.length > 0 && (
        <Section
          title={`Phone Calls (${phoneCalls.length})`}
          icon={Phone}
          collapsed={collapsed["calls"]}
          onToggle={() => toggle("calls")}
        >
          <div className="space-y-2">
            {phoneCalls.slice(0, 5).map((call) => (
              <div key={call.id} className="bg-surface rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  {call.direction === "INBOUND" ? (
                    <ArrowDown className="h-3 w-3 text-blue-400" />
                  ) : (
                    <ArrowUp className="h-3 w-3 text-green-400" />
                  )}
                  <span className="text-[10px] text-gray-400">
                    {call.direction} · {call.durationSeconds ? `${call.durationSeconds}s` : call.status}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {new Date(call.startedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-gray-300 line-clamp-2">{call.summary}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  by {call.agent.name || call.agent.email}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  icon: typeof User;
  collapsed?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-xs font-medium text-gray-400 hover:text-white mb-2"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <Icon className="h-3.5 w-3.5" />
        {title}
      </button>
      {!collapsed && children}
    </div>
  );
}
