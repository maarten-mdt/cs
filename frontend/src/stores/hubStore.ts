/**
 * Zustand store for the Agent Hub.
 * Flat store with Map-based lookups for O(1) access.
 */

import { create } from "zustand";
import type {
  TicketPreview,
  TicketDetail,
  Agent,
  CannedResponse,
  Tag,
  MessageItem,
} from "../lib/hubApi";

export type ViewFilter = "all" | "mine" | "unassigned" | "urgent" | "bot";

export interface FilterState {
  view: ViewFilter;
  status?: string;
  channel?: string;
  priority?: string;
  tag?: string;
  search: string;
}

interface HubStore {
  // Bootstrap state
  bootstrapped: boolean;

  // Ticket list
  tickets: Map<string, TicketPreview>;
  ticketOrder: string[];
  selectedTicketId: string | null;
  ticketCache: Map<string, TicketDetail>;
  nextCursor: string | null;
  hasMore: boolean;

  // Agents
  agents: Map<string, Agent>;
  currentAgent: { id: string; name: string | null; email: string; role: string } | null;

  // Canned responses
  cannedResponses: CannedResponse[];

  // Tags
  tags: Tag[];

  // Counts
  counts: { open: number; pending: number; mine: number; urgent: number; bot: number };

  // UI state
  composerTab: "reply" | "note";
  composerDraft: Map<string, string>;
  filters: FilterState;

  // Actions
  setBootstrapData: (data: {
    conversations: TicketPreview[];
    agents: Agent[];
    cannedResponses: CannedResponse[];
    counts: { open: number; pending: number; mine: number; urgent: number; bot: number };
    currentAgent: { id: string; name: string | null; email: string; role: string };
  }) => void;
  setConversations: (convs: TicketPreview[], nextCursor: string | null, hasMore: boolean, append?: boolean) => void;
  setSelectedTicket: (id: string | null) => void;
  cacheTicketDetail: (id: string, detail: TicketDetail) => void;
  patchTicket: (id: string, patch: Partial<TicketPreview>) => void;
  addMessage: (ticketId: string, message: MessageItem) => void;
  removeTicket: (id: string) => void;
  setComposerTab: (tab: "reply" | "note") => void;
  setComposerDraft: (ticketId: string, text: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setCannedResponses: (responses: CannedResponse[]) => void;
  setTags: (tags: Tag[]) => void;
  reset: () => void;
}

const defaultFilters: FilterState = {
  view: "all",
  search: "",
};

export const useHubStore = create<HubStore>((set, get) => ({
  bootstrapped: false,
  tickets: new Map(),
  ticketOrder: [],
  selectedTicketId: null,
  ticketCache: new Map(),
  nextCursor: null,
  hasMore: false,
  agents: new Map(),
  currentAgent: null,
  cannedResponses: [],
  tags: [],
  counts: { open: 0, pending: 0, mine: 0, urgent: 0, bot: 0 },
  composerTab: "reply",
  composerDraft: new Map(),
  filters: defaultFilters,

  setBootstrapData: (data) => {
    const ticketMap = new Map<string, TicketPreview>();
    const ticketOrder: string[] = [];
    for (const c of data.conversations) {
      ticketMap.set(c.id, c);
      ticketOrder.push(c.id);
    }
    const agentMap = new Map<string, Agent>();
    for (const a of data.agents) {
      agentMap.set(a.id, a);
    }
    set({
      bootstrapped: true,
      tickets: ticketMap,
      ticketOrder,
      agents: agentMap,
      cannedResponses: data.cannedResponses,
      counts: data.counts,
      currentAgent: data.currentAgent,
    });
  },

  setConversations: (convs, nextCursor, hasMore, append = false) => {
    const { tickets: existing, ticketOrder: existingOrder } = get();
    const ticketMap = append ? new Map(existing) : new Map();
    const ticketOrder = append ? [...existingOrder] : [];
    for (const c of convs) {
      ticketMap.set(c.id, c);
      if (!ticketOrder.includes(c.id)) ticketOrder.push(c.id);
    }
    set({ tickets: ticketMap, ticketOrder, nextCursor, hasMore });
  },

  setSelectedTicket: (id) => set({ selectedTicketId: id }),

  cacheTicketDetail: (id, detail) => {
    const cache = new Map(get().ticketCache);
    cache.set(id, detail);
    set({ ticketCache: cache });
  },

  patchTicket: (id, patch) => {
    const tickets = new Map(get().tickets);
    const existing = tickets.get(id);
    if (existing) {
      tickets.set(id, { ...existing, ...patch });
      set({ tickets });
    }
    // Also patch cache (cast to avoid strict type conflicts between preview/detail)
    const cache = new Map(get().ticketCache);
    const cached = cache.get(id);
    if (cached) {
      cache.set(id, { ...cached, ...patch } as TicketDetail);
      set({ ticketCache: cache });
    }
  },

  addMessage: (ticketId, message) => {
    const cache = new Map(get().ticketCache);
    const detail = cache.get(ticketId);
    if (detail) {
      cache.set(ticketId, {
        ...detail,
        messages: [...detail.messages, message],
      });
      set({ ticketCache: cache });
    }
    // Update lastMessage preview
    const tickets = new Map(get().tickets);
    const ticket = tickets.get(ticketId);
    if (ticket) {
      tickets.set(ticketId, {
        ...ticket,
        lastMessage: { content: message.content, role: message.role, createdAt: message.createdAt },
        lastMessageAt: message.createdAt,
      });
      set({ tickets });
    }
  },

  removeTicket: (id) => {
    const tickets = new Map(get().tickets);
    tickets.delete(id);
    const ticketOrder = get().ticketOrder.filter((tid) => tid !== id);
    set({ tickets, ticketOrder });
    if (get().selectedTicketId === id) set({ selectedTicketId: null });
  },

  setComposerTab: (tab) => set({ composerTab: tab }),

  setComposerDraft: (ticketId, text) => {
    const drafts = new Map(get().composerDraft);
    if (text) drafts.set(ticketId, text);
    else drafts.delete(ticketId);
    set({ composerDraft: drafts });
  },

  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),

  setCannedResponses: (responses) => set({ cannedResponses: responses }),
  setTags: (tags) => set({ tags }),

  reset: () =>
    set({
      bootstrapped: false,
      tickets: new Map(),
      ticketOrder: [],
      selectedTicketId: null,
      ticketCache: new Map(),
      nextCursor: null,
      hasMore: false,
      agents: new Map(),
      currentAgent: null,
      cannedResponses: [],
      tags: [],
      counts: { open: 0, pending: 0, mine: 0, urgent: 0, bot: 0 },
      composerTab: "reply",
      composerDraft: new Map(),
      filters: defaultFilters,
    }),
}));
