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
};

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
