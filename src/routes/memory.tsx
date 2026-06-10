import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel } from "@/components/friday/Dashboard";
import { usePersistent, DEFAULT_SETTINGS, STORE_KEYS, type Settings } from "@/lib/friday/store";
import { chromaDelete, chromaQuery } from "@/lib/friday/services";

export const Route = createFileRoute("/memory")({
  head: () => ({ meta: [{ title: "JESSICA · Memory Browser" }] }),
  component: () => (
    <ClientOnly fallback={<div className="p-8">Loading…</div>}>
      <MemoryPage />
    </ClientOnly>
  ),
});

type LocalMem = { id: string; text: string; ts: number };

function MemoryPage() {
  const [settings] = usePersistent<Settings>(STORE_KEYS.settings, DEFAULT_SETTINGS);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocalMem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function search() {
    setLoading(true);
    setStatus("");
    try {
      const docs = await chromaQuery(settings.endpoints.chroma, query || "summary", 20);
      setResults(docs.map((text, i) => ({ id: `r${i}`, text, ts: Date.now() })));
    } catch (e) {
      setStatus("Couldn't reach ChromaDB.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(id: string) {
    await chromaDelete(settings.endpoints.chroma, id);
    setResults((r) => r.filter((m) => m.id !== id));
  }

  return (
    <div className="min-h-screen p-6 scanlines">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xs tracking-widest text-muted-foreground hover:text-foreground">
            ← BACK
          </Link>
          <h1 className="font-display text-2xl glow-text tracking-widest">MEMORY BROWSER</h1>
          <div className="w-16" />
        </div>

        <Panel title="SEARCH">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search memories…"
              className="flex-1 bg-black/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-cyan-glow)]"
            />
            <button
              onClick={search}
              className="px-4 py-2 rounded-lg font-display tracking-widest text-xs bg-[color:var(--color-cyan-glow)] text-black hover:brightness-110 transition"
            >
              SEARCH
            </button>
          </div>
          {status && <p className="text-xs text-destructive mt-2">{status}</p>}
        </Panel>

        <Panel title={`MEMORIES (${results.length})`}>
          {loading ? (
            <div className="text-xs text-muted-foreground py-6 text-center">Loading…</div>
          ) : results.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              No memories found. Have a conversation with Jessica to start building memory.
            </div>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {results.map((m) => (
                <li
                  key={m.id}
                  className="glass border border-border rounded-lg p-3 text-sm flex gap-3 group"
                >
                  <div className="flex-1 whitespace-pre-wrap">{m.text}</div>
                  <button
                    onClick={() => remove(m.id)}
                    className="self-start opacity-50 group-hover:opacity-100 text-xs text-destructive hover:underline"
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
