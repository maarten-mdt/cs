const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api/admin";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getConversations: (params?: { page?: number; limit?: number; status?: string; topic?: string; search?: string }) => {
    const sp = new URLSearchParams();
    if (params?.page != null) sp.set("page", String(params.page));
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.status) sp.set("status", params.status);
    if (params?.topic) sp.set("topic", params.topic);
    if (params?.search) sp.set("search", params.search);
    const q = sp.toString();
    return request<{ items: ConversationListItem[]; total: number; page: number; limit: number }>(
      `/conversations${q ? `?${q}` : ""}`
    );
  },
  getConversation: (id: string) =>
    request<ConversationDetail>(`/conversations/${id}`),
  getCustomers: (params?: { page?: number; limit?: number; search?: string }) => {
    const sp = new URLSearchParams();
    if (params?.page != null) sp.set("page", String(params.page));
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.search) sp.set("search", params.search);
    const q = sp.toString();
    return request<{ items: CustomerListItem[]; total: number; page: number; limit: number }>(
      `/customers${q ? `?${q}` : ""}`
    );
  },
  getCustomer: (id: string) =>
    request<CustomerDetail>(`/customers/${id}`),
  mergeCustomers: (mergeToId: string, mergeFromId: string) =>
    request<CustomerDetail>(`/customers/${mergeToId}/merge`, {
      method: "POST",
      body: JSON.stringify({ mergeFromId }),
    }),

  // Sources (Knowledge)
  getSources: () => request<SourceListItem[]>("/sources"),
  getSource: (id: string) => request<SourceDetail>(`/sources/${id}`),
  createSource: (body: { name: string; type: string; url?: string; maxPages?: number }) =>
    request<SourceListItem>("/sources", { method: "POST", body: JSON.stringify(body) }),
  updateSource: (id: string, body: { name?: string; maxPages?: number; url?: string | null }) =>
    request<SourceListItem>(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSource: (id: string) => request<void>(`/sources/${id}`, { method: "DELETE" }),
  syncSource: (id: string) => request<{ ok: boolean }>(`/sources/${id}/sync`, { method: "POST" }),

  getSystemPrompt: () => request<{ systemPrompt: string }>("/knowledge/system-prompt"),
  putSystemPrompt: (systemPrompt: string) =>
    request<{ systemPrompt: string }>("/knowledge/system-prompt", { method: "PUT", body: JSON.stringify({ systemPrompt }) }),
  getSuggestedQuestions: () => request<{ questions: string[] }>("/knowledge/suggested-questions"),
  putSuggestedQuestions: (questions: string[]) =>
    request<{ questions: string[] }>("/knowledge/suggested-questions", { method: "PUT", body: JSON.stringify({ questions }) }),

  getAnalyticsSummary: (days: number) =>
    request<AnalyticsSummary>(`/analytics/summary?days=${days}`),

  getConnections: () => request<{ integrations: Record<string, { configured: boolean; keys?: Record<string, string> }> }>("/connections"),
  putConnections: (integration: string, values: Record<string, string>) =>
    request<{ integrations: Record<string, { configured: boolean }> }>("/connections", {
      method: "PUT",
      body: JSON.stringify({ integration, values }),
    }),
  testConnection: (integration: string) =>
    request<{ ok: boolean; message: string }>("/connections/test", {
      method: "POST",
      body: JSON.stringify({ integration }),
    }),

  getUsers: () => request<UserListItem[]>("/users"),
  inviteUser: (body: { email: string; name?: string; role?: string }) =>
    request<{ user: UserListItem; message: string }>("/users/invite", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: { name?: string; role?: string }) =>
    request<UserListItem>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),
};

export interface SourceListItem {
  id: string;
  name: string;
  type: string;
  url: string | null;
  maxPages: number;
  chunkCount: number;
  lastSyncedAt: string | null;
  status: string;
  errorMessage: string | null;
}

export interface SourceDetail extends SourceListItem {
  chunks: { id: string; content: string; url: string | null; title: string | null; createdAt: string }[];
}

export interface AnalyticsSummary {
  totalConversations: number;
  resolvedCount: number;
  escalatedCount: number;
  deflectionRate: number;
  avgMessages: number;
  topTopics: { topic: string; count: number }[];
  dailyVolume: { date: string; count: number }[];
  sentimentBreakdown?: Record<string, number>;
  topicSentimentMap?: Record<string, Record<string, number>>;
  thumbsUp?: number;
  thumbsDown?: number;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ConversationListItem {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  topic: string | null;
  status: string;
  messageCount: number;
  sentiment: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ConversationDetail {
  id: string;
  sessionId: string;
  customerId: string | null;
  customer: { id: string; email: string; name: string | null } | null;
  status: string;
  topic: string | null;
  sentiment: string | null;
  messages: { id: string; role: string; content: string; createdAt: string }[];
  createdAt: string;
  resolvedAt: string | null;
  escalatedAt: string | null;
}

export interface CustomerListItem {
  id: string;
  name: string | null;
  email: string;
  totalSpend: number;
  orderCount: number;
  conversationCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  shopifyId: string | null;
  mergedIntoId: string | null;
}

export interface CustomerDetail {
  id: string;
  name: string | null;
  email: string;
  shopifyId: string | null;
  hubspotId: string | null;
  zendeskId: string | null;
  totalSpend: number;
  orderCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  mergedIntoId: string | null;
  mergedFrom: { id: string; email: string; name: string | null }[];
  conversations: { id: string; topic: string | null; status: string; createdAt: string }[];
  orders: { orderNumber: string; email: string; orderDate: string; status: string; items: unknown[] }[] | null;
  shopifyCustomerAdminUrl?: string | null;
}
