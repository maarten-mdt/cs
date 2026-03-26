/**
 * API client for the Agent Hub (/api/hub/*).
 */

const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api/hub";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────

export interface Agent {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TicketPreview {
  id: string;
  sessionId: string;
  status: string;
  priority: string;
  channel: string;
  subject: string | null;
  storeRegion: string;
  assignedTo: { id: string; name: string | null; email: string } | null;
  customer: { id: string; email: string; name: string | null; phone: string | null } | null;
  tags: Tag[];
  lastMessage: { content: string; role: string; createdAt: string } | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface MessageItem {
  id: string;
  role: string;
  content: string;
  channel: string | null;
  senderAgentId: string | null;
  isInternal: boolean;
  feedback: { id: string; rating: string; comment: string | null } | null;
  createdAt: string;
}

export interface PhoneCallItem {
  id: string;
  direction: string;
  status: string;
  phoneFrom: string;
  phoneTo: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string;
  outcome: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  agent: { id: string; name: string | null; email: string };
}

export interface TicketDetail {
  id: string;
  sessionId: string;
  status: string;
  priority: string;
  channel: string;
  subject: string | null;
  storeRegion: string;
  emailThreadId: string | null;
  snoozedUntil: string | null;
  assignedTo: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
  customer: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    shopifyId: string | null;
    totalSpend: number;
    orderCount: number;
    storeRegion: string;
  } | null;
  tags: Tag[];
  messages: MessageItem[];
  phoneCalls: PhoneCallItem[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  escalatedAt: string | null;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category: string | null;
}

export interface BootstrapData {
  conversations: TicketPreview[];
  agents: Agent[];
  cannedResponses: CannedResponse[];
  counts: { open: number; pending: number; mine: number; urgent: number; bot: number };
  currentAgent: { id: string; name: string | null; email: string; role: string };
}

export interface ConversationListResponse {
  conversations: TicketPreview[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CallAnalytics {
  totalCalls: number;
  averageDuration: number;
  missedRate: number;
  followUpRate: number;
  byAgent: { agentId: string; agentName: string; callCount: number; totalDuration: number; avgDuration: number }[];
  byHour: number[];
  period: string;
  since: string;
}

// ─── API methods ────────────────────────────────────────────────

export const hubApi = {
  bootstrap: () => request<BootstrapData>("/bootstrap"),

  // Conversations
  getConversations: (params?: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    const q = sp.toString();
    return request<ConversationListResponse>(`/conversations${q ? `?${q}` : ""}`);
  },
  getConversation: (id: string) => request<TicketDetail>(`/conversations/${id}`),
  updateConversation: (id: string, data: Record<string, unknown>) =>
    request<unknown>(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  bulkUpdate: (ids: string[], action: string, value?: string) =>
    request<{ updated: number }>("/conversations/bulk", { method: "PATCH", body: JSON.stringify({ ids, action, value }) }),

  // Replies
  sendReply: (id: string, content: string, isInternal = false) =>
    request<MessageItem>(`/conversations/${id}/reply`, { method: "POST", body: JSON.stringify({ content, isInternal }) }),

  // Tags
  getTags: () => request<(Tag & { _count: { conversations: number } })[]>("/tags"),
  createTag: (name: string, color?: string) =>
    request<Tag>("/tags", { method: "POST", body: JSON.stringify({ name, color }) }),
  deleteTag: (id: string) => request<void>(`/tags/${id}`, { method: "DELETE" }),
  addTagToConversation: (convId: string, tagId: string) =>
    request<Tag>(`/conversations/${convId}/tags`, { method: "POST", body: JSON.stringify({ tagId }) }),
  removeTagFromConversation: (convId: string, tagId: string) =>
    request<void>(`/conversations/${convId}/tags/${tagId}`, { method: "DELETE" }),

  // Canned Responses
  getCannedResponses: () => request<CannedResponse[]>("/canned-responses"),
  createCannedResponse: (data: { shortcut: string; title: string; content: string; category?: string }) =>
    request<CannedResponse>("/canned-responses", { method: "POST", body: JSON.stringify(data) }),
  updateCannedResponse: (id: string, data: Partial<CannedResponse>) =>
    request<CannedResponse>(`/canned-responses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCannedResponse: (id: string) => request<void>(`/canned-responses/${id}`, { method: "DELETE" }),

  // Phone Calls
  logCall: (conversationId: string, data: Record<string, unknown>) =>
    request<PhoneCallItem>(`/conversations/${conversationId}/calls`, { method: "POST", body: JSON.stringify(data) }),
  getConversationCalls: (id: string) => request<PhoneCallItem[]>(`/conversations/${id}/calls`),
  getCustomerCalls: (customerId: string) => request<PhoneCallItem[]>(`/customers/${customerId}/calls`),
  getCallAnalytics: (period?: string) =>
    request<CallAnalytics>(`/analytics/calls${period ? `?period=${period}` : ""}`),
};
