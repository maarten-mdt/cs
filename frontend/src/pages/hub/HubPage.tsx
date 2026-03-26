import { useEffect, useCallback } from "react";
import { useHubStore } from "../../stores/hubStore";
import { hubApi } from "../../lib/hubApi";
import { TicketList } from "../../components/hub/TicketList";
import { ConversationThread } from "../../components/hub/ConversationThread";
import { RightPanel } from "../../components/hub/RightPanel";
import { useHotkeys } from "react-hotkeys-hook";

export function HubPage() {
  const { bootstrapped, selectedTicketId, ticketOrder } = useHubStore();
  const setBootstrapData = useHubStore((s) => s.setBootstrapData);
  const setSelectedTicket = useHubStore((s) => s.setSelectedTicket);
  const setTags = useHubStore((s) => s.setTags);

  // Bootstrap on mount
  useEffect(() => {
    if (!bootstrapped) {
      hubApi.bootstrap().then((data) => {
        setBootstrapData(data);
      }).catch((e) => console.error("[hub] bootstrap failed:", e));

      hubApi.getTags().then((tags) => setTags(tags)).catch(() => {});
    }
  }, [bootstrapped, setBootstrapData, setTags]);

  // Keyboard: J/K to navigate tickets
  const selectNext = useCallback(() => {
    const idx = selectedTicketId ? ticketOrder.indexOf(selectedTicketId) : -1;
    const nextIdx = Math.min(idx + 1, ticketOrder.length - 1);
    if (ticketOrder[nextIdx]) setSelectedTicket(ticketOrder[nextIdx]);
  }, [selectedTicketId, ticketOrder, setSelectedTicket]);

  const selectPrev = useCallback(() => {
    const idx = selectedTicketId ? ticketOrder.indexOf(selectedTicketId) : ticketOrder.length;
    const prevIdx = Math.max(idx - 1, 0);
    if (ticketOrder[prevIdx]) setSelectedTicket(ticketOrder[prevIdx]);
  }, [selectedTicketId, ticketOrder, setSelectedTicket]);

  useHotkeys("j", selectNext, { enabled: bootstrapped });
  useHotkeys("k", selectPrev, { enabled: bootstrapped });

  if (!bootstrapped) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 animate-pulse">Loading agent hub...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6 overflow-hidden">
      {/* Left: Ticket List */}
      <div className="w-80 min-w-[280px] border-r border-border-dark flex flex-col">
        <TicketList />
      </div>

      {/* Center: Conversation Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedTicketId ? (
          <ConversationThread ticketId={selectedTicketId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a ticket to view
          </div>
        )}
      </div>

      {/* Right: Customer/Ticket Details */}
      {selectedTicketId && (
        <div className="w-80 min-w-[280px] border-l border-border-dark overflow-y-auto">
          <RightPanel ticketId={selectedTicketId} />
        </div>
      )}
    </div>
  );
}

export default HubPage;
