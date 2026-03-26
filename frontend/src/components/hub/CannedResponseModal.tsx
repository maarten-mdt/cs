import { useState, useRef, useEffect } from "react";
import { useHubStore } from "../../stores/hubStore";
import { X } from "lucide-react";

interface Props {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export function CannedResponseModal({ onSelect, onClose }: Props) {
  const cannedResponses = useHubStore((s) => s.cannedResponses);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = cannedResponses.filter(
    (r) =>
      r.shortcut.toLowerCase().includes(filter.toLowerCase()) ||
      r.title.toLowerCase().includes(filter.toLowerCase()) ||
      r.content.toLowerCase().includes(filter.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      onSelect(filtered[selectedIndex].content);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-panel border border-border-dark rounded-xl w-full max-w-lg mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-dark">
          <h3 className="text-sm font-medium text-white">Canned Responses</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            className="w-full bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
        </div>

        <div className="max-h-64 overflow-y-auto pb-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500">No canned responses found</p>
          ) : (
            filtered.map((r, i) => (
              <button
                key={r.id}
                onClick={() => onSelect(r.content)}
                className={`w-full text-left px-4 py-2.5 ${
                  i === selectedIndex ? "bg-accent/10" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-accent">/{r.shortcut}</span>
                  <span className="text-xs font-medium text-white">{r.title}</span>
                  {r.category && (
                    <span className="text-[10px] text-gray-500">{r.category}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 line-clamp-2">{r.content}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
