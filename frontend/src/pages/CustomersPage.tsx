import { useState, useEffect } from "react";
import { api, type CustomerListItem, type CustomerDetail } from "../lib/api";
import { X, ExternalLink, Merge } from "lucide-react";

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

function OutcomeBadge({ status }: { status: string }) {
  if (status === "RESOLVED") return <span className="inline-flex px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Resolved</span>;
  if (status === "ESCALATED") return <span className="inline-flex px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Escalated</span>;
  return <span className="inline-flex px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">Bot</span>;
}


export function CustomersPage() {
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mergeModal, setMergeModal] = useState<{ to: CustomerDetail; mergeSearch: string; candidates: CustomerListItem[] } | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomers({ page, limit, search: search || undefined });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, limit, search]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setSelected(null);
    try {
      const c = await api.getCustomer(id);
      setSelected(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openMergeModal = () => {
    if (!selected) return;
    setMergeModal({
      to: selected,
      mergeSearch: "",
      candidates: [],
    });
    setMergeSearch("");
  };

  const searchMergeCandidates = async () => {
    if (!mergeModal) return;
    try {
      const res = await api.getCustomers({ search: mergeSearch, limit: 20 });
      setMergeModal((m) => m ? { ...m, mergeSearch, candidates: res.items.filter((c) => c.id !== m.to.id && !c.mergedIntoId) } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const doMerge = async (mergeFromId: string) => {
    if (!mergeModal) return;
    const toId = mergeModal.to.id;
    setMerging(true);
    try {
      await api.mergeCustomers(toId, mergeFromId);
      setMergeModal(null);
      const updated = await api.getCustomer(toId);
      setSelected(updated);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Customers</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by name or email..."
          className="rounded-lg border border-border-dark bg-panel px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
        />
        <button
          type="button"
          onClick={() => setSearch(searchInput)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Search
        </button>
      </div>

      <div className="rounded-lg border border-border-dark bg-panel overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No customers found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-dark text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Spend</th>
                <th className="p-3 font-medium">Orders</th>
                <th className="p-3 font-medium">Chats</th>
                <th className="p-3 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="border-b border-border-dark hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="p-3">
                    <span className="text-white font-medium">{c.name || "—"}</span>
                    {c.mergedIntoId && <span className="ml-1 text-xs text-gray-500">(merged)</span>}
                  </td>
                  <td className="p-3 text-gray-300">{c.email}</td>
                  <td className="p-3 text-gray-300">${Number(c.totalSpend).toFixed(2)}</td>
                  <td className="p-3 text-gray-300">{c.orderCount}</td>
                  <td className="p-3 text-gray-300">{c.conversationCount}</td>
                  <td className="p-3 text-sm text-gray-400">{formatDate(c.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > limit && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-accent hover:underline disabled:opacity-50">Previous</button>
          <button type="button" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage((p) => p + 1)} className="text-accent hover:underline disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Detail drawer */}
      {selected !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} aria-hidden />
          <div className="relative w-full max-w-lg bg-panel border-l border-border-dark flex flex-col shadow-xl max-h-screen">
            <div className="flex items-center justify-between p-4 border-b border-border-dark">
              <h2 className="text-lg font-semibold text-white">Customer</h2>
              <button type="button" onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-white font-medium">{selected.name || "—"}</p>
                <p className="text-sm text-gray-400">{selected.email}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded bg-white/5 p-2"><span className="text-gray-400">Spend</span><br /><span className="text-white">${Number(selected.totalSpend).toFixed(2)}</span></div>
                <div className="rounded bg-white/5 p-2"><span className="text-gray-400">Orders</span><br /><span className="text-white">{selected.orderCount}</span></div>
                <div className="rounded bg-white/5 p-2"><span className="text-gray-400">Chats</span><br /><span className="text-white">{selected.conversations?.length ?? 0}</span></div>
              </div>
              {selected.mergedFrom?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Merged from</p>
                  <ul className="text-sm text-gray-300">
                    {selected.mergedFrom.map((m) => (
                      <li key={m.id}>{m.email} {m.name && `(${m.name})`}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-white mb-2">Orders</p>
                {selected.orders === null ? (
                  <p className="text-sm text-gray-400">No Shopify account linked.</p>
                ) : selected.orders?.length === 0 ? (
                  <p className="text-sm text-gray-400">No orders.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {selected.orders.slice(0, 5).map((o) => (
                      <li key={o.orderNumber} className="text-gray-300">
                        #{o.orderNumber} — {o.orderDate} — {o.status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white mb-2">Conversations</p>
                <ul className="space-y-1">
                  {selected.conversations?.map((c) => (
                    <li key={c.id} className="text-sm text-gray-300">
                      {c.topic || "No topic"} — <OutcomeBadge status={c.status} /> — {formatDate(c.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.shopifyCustomerAdminUrl && (
                  <a href={selected.shopifyCustomerAdminUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                    <ExternalLink className="h-4 w-4" /> Shopify
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={openMergeModal}
                className="inline-flex items-center gap-2 rounded-lg bg-accent/20 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/30"
              >
                <Merge className="h-4 w-4" /> Merge into this customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !merging && setMergeModal(null)} aria-hidden />
          <div className="relative bg-panel border border-border-dark rounded-lg shadow-xl w-full max-w-md p-4">
            <h3 className="text-lg font-semibold text-white mb-2">Merge into {mergeModal.to.name || mergeModal.to.email}</h3>
            <p className="text-sm text-gray-400 mb-3">Select the customer to merge (their conversations will move to this profile).</p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Search by email or name..."
                className="flex-1 rounded border border-border-dark bg-surface px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchMergeCandidates()}
              />
              <button type="button" onClick={searchMergeCandidates} className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent-dark">Search</button>
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {mergeModal.candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={merging}
                    onClick={() => doMerge(c.id)}
                    className="w-full text-left px-3 py-2 rounded text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    {c.name || "—"} — {c.email}
                  </button>
                </li>
              ))}
              {mergeModal.mergeSearch && mergeModal.candidates.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">No other customers found. Try a different search.</li>
              )}
            </ul>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => !merging && setMergeModal(null)} className="rounded px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loadingDetail && selected === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="text-white">Loading...</div>
        </div>
      )}
    </div>
  );
}
