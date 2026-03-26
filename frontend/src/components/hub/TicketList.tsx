import { useRef, useCallback, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useHubStore, type ViewFilter } from "../../stores/hubStore";
import { hubApi } from "../../lib/hubApi";
import {
  Search,
  Inbox,
  User,
  AlertTriangle,
  Bot,
  Users,
} from "lucide-react";

const TICKET_HEIGHT = 88;

const viewOptions: { key: ViewFilter; label: string; icon: typeof Inbox }[] = [
  { key: "all", label: "All", icon: Inbox },
  { key: "mine", label: "Mine", icon: User },
  { key: "unassigned", label: "Unassigned", icon: Users },
  { key: "urgent", label: "Urgent", icon: AlertTriangle },
  { key: "bot", label: "Bot", icon: Bot },
];

const statusColors: Record<string, string> = {
  BOT: "bg-blue-500/20 text-blue-400",
  OPEN: "bg-green-500/20 text-green-400",
  PENDING: "bg-yellow-500/20 text-yellow-400",
  ESCALATED: "bg-red-500/20 text-red-400",
  SNOOZED: "bg-purple-500/20 text-purple-400",
  RESOLVED: "bg-gray-500/20 text-gray-400",
};

const priorityIndicator: Record<string, string> = {
  URGENT: "border-l-red-500",
  HIGH: "border-l-orange-500",
  NORMAL: "border-l-transparent",
  LOW: "border-l-transparent",
};

export function TicketList() {
  const {
    ticketOrder,
    tickets,
    selectedTicketId,
    filters,
    counts,
    hasMore,
    nextCursor,
  } = useHubStore();
  const setSelectedTicket = useHubStore((s) => s.setSelectedTicket);
  const setFilters = useHubStore((s) => s.setFilters);
  const setConversations = useHubStore((s) => s.setConversations);
  const cacheTicketDetail = useHubStore((s) => s.cacheTicketDetail);

  const [searchInput, setSearchInput] = useState(filters.search);
  const [loading, setLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: ticketOrder.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TICKET_HEIGHT,
    overscan: 5,
  });

  // Filter change triggers new fetch
  const changeView = useCallback(async (view: ViewFilter) => {
    setFilters({ view });
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (view === "mine") params.view = "mine";
      else if (view === "unassigned") params.view = "unassigned";
      else if (view === "urgent") params.view = "urgent";
      else if (view === "bot") params.status = "BOT";
      else params.status = "BOT,OPEN,PENDING,ESCALATED";

      const data = await hubApi.getConversations(params);
      setConversations(data.conversations, data.nextCursor, data.hasMore);
    } catch (e) {
      console.error("[hub] fetch conversations failed:", e);
    } finally {
      setLoading(false);
    }
  }, [setFilters, setConversations]);

  const doSearch = useCallback(async () => {
    setFilters({ search: searchInput });
    setLoading(true);
    try {
      const params: Record<string, string> = { status: "BOT,OPEN,PENDING,ESCALATED" };
      if (searchInput.trim()) params.search = searchInput.trim();
      const data = await hubApi.getConversations(params);
      setConversations(data.conversations, data.nextCursor, data.hasMore);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [searchInput, setFilters, setConversations]);

  // Load more (infinite scroll)
  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loading) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {
        cursor: nextCursor,
        status: "BOT,OPEN,PENDING,ESCALATED",
      };
      const data = await hubApi.getConversations(params);
      setConversations(data.conversations, data.nextCursor, data.hasMore, true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [hasMore, nextCursor, loading, setConversations]);

  // Pre-fetch on hover
  const handleHover = useCallback((ticketId: string) => {
    const cache = useHubStore.getState().ticketCache;
    if (cache.has(ticketId)) return;
    const timer = setTimeout(() => {
      hubApi.getConversation(ticketId).then((detail) => {
        cacheTicketDetail(ticketId, detail);
      }).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheTicketDetail]);

  const items = virtualizer.getVirtualItems();
  const lastItem = items[items.length - 1];
  if (lastItem && lastItem.index >= ticketOrder.length - 5 && hasMore && !loading) {
    loadMore();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border-dark">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border-dark rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* View filters */}
      <div className="flex gap-1 px-3 py-2 border-b border-border-dark overflow-x-auto">
        {viewOptions.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => changeView(key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
              filters.view === key
                ? "bg-accent/20 text-accent"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {key === "urgent" && counts.urgent > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px]">
                {counts.urgent}
              </span>
            )}
            {key === "all" && (
              <span className="ml-0.5 text-gray-500">{counts.open + counts.pending + counts.bot}</span>
            )}
          </button>
        ))}
      </div>

      {/* Ticket list with virtual scroll */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {items.map((virtualItem) => {
            const ticketId = ticketOrder[virtualItem.index];
            const ticket = tickets.get(ticketId);
            if (!ticket) return null;

            const isSelected = selectedTicketId === ticketId;
            const preview = ticket.lastMessage?.content?.slice(0, 80) || "No messages";
            const time = ticket.lastMessageAt
              ? new Date(ticket.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "";

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`border-l-2 ${priorityIndicator[ticket.priority] || "border-l-transparent"} px-3 py-2.5 cursor-pointer transition-colors border-b border-border-dark ${
                  isSelected ? "bg-accent/10" : "hover:bg-white/5"
                }`}
                onClick={() => setSelectedTicket(ticketId)}
                onMouseEnter={() => handleHover(ticketId)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate max-w-[60%]">
                    {ticket.customer?.name || ticket.customer?.email || ticket.sessionId.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-gray-500">{time}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[ticket.status] || "bg-gray-500/20 text-gray-400"}`}>
                    {ticket.status}
                  </span>
                  <span className="text-[10px] text-gray-500 uppercase">{ticket.channel}</span>
                  {ticket.assignedTo && (
                    <span className="text-[10px] text-gray-500 truncate">
                      → {ticket.assignedTo.name || ticket.assignedTo.email}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">{preview}</p>
              </div>
            );
          })}
        </div>
        {loading && (
          <div className="p-3 text-center text-xs text-gray-500 animate-pulse">Loading...</div>
        )}
      </div>
    </div>
  );
}
