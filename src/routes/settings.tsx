import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel } from "@/components/friday/Dashboard";
import {
  usePersistent,
  DEFAULT_SETTINGS,
  STORE_KEYS,
  sha256,
  type Settings,
  type UserProfile,
} from "@/lib/friday/store";
import { checkAllServices, ollamaListModels } from "@/lib/friday/services";
import { recordAudio, averageVectors } from "@/lib/friday/voiceprint";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "FRIDAY · Settings" }] }),
  component: () => (
    <ClientOnly fallback={<div className="p-8">Loading…</div>}>
      <SettingsPage />
    </ClientOnly>
  ),
});

function SettingsPage() {
  const [settings, setSettings] = usePersistent<Settings>(STORE_KEYS.settings, DEFAULT_SETTINGS);
  const [user, setUser] = usePersistent<UserProfile | null>(STORE_KEYS.user, null);
  const [status, setStatus] = useState({
    ollama: false,
    chroma: false,
    whisper: false,
    piper: false,
    pcControl: false,
    backend: false,
  });
  const [models, setModels] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [enrollVecs, setEnrollVecs] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    checkAllServices(settings.endpoints).then(setStatus);
    ollamaListModels(settings.endpoints.ollama).then(setModels);
  }, [settings.endpoints]);

  function update<K extends keyof Settings>(k: K, v: Settings[K]) {
    setSettings((s) => ({ ...s, [k]: v }));
  }
  function updateEndpoint(k: keyof Settings["endpoints"], v: string) {
    setSettings((s) => ({ ...s, endpoints: { ...s.endpoints, [k]: v } }));
  }

  async function startService(name: keyof typeof status) {
    setInfo(
      `Start ${name} locally — Lovable can't launch processes on your machine. See the README in your local repo for one-line start commands.`,
    );
  }

  async function changePin() {
    if (pin.length < 4 || !user) return;
    const pinHash = await sha256(pin);
    setUser({ ...user, pinHash });
    setPin("");
    setInfo("PIN updated.");
  }

  async function resetVoice() {
    if (enrollVecs.length < 5 || !user) return;
    const voiceprint = averageVectors(enrollVecs);
    setUser({ ...user, voiceprint });
    setEnrollVecs([]);
    setInfo("Voiceprint updated.");
  }

  async function recordSample() {
    setRecording(true);
    try {
      const v = await recordAudio(3);
      setEnrollVecs((vs) => [...vs, Array.from(v)]);
    } finally {
      setRecording(false);
    }
  }

  function exportMemories() {
    const dump: Record<string, unknown> = {};
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("friday::")) dump[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `friday-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function factoryReset() {
    if (!confirm("Wipe all local FRIDAY data? This cannot be undone.")) return;
    if (typeof window !== "undefined") {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("friday::"))
        .forEach((k) => localStorage.removeItem(k));
      location.href = "/";
    }
  }

  return (
    <div className="min-h-screen p-6 scanlines">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xs tracking-widest text-muted-foreground hover:text-foreground">
            ← BACK
          </Link>
          <h1 className="font-display text-2xl glow-text tracking-widest">SETTINGS</h1>
          <div className="w-16" />
        </div>

        {info && (
          <div className="glass border border-[color:var(--color-cyan-glow)]/40 rounded-lg px-4 py-2 text-xs">
            {info}
          </div>
        )}

        <Panel title="AI BRAIN">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Ollama endpoint">
              <input
                value={settings.endpoints.ollama}
                onChange={(e) => updateEndpoint("ollama", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Model">
              {models.length ? (
                <select value={settings.model} onChange={(e) => update("model", e.target.value)} className={inputCls}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={settings.model} onChange={(e) => update("model", e.target.value)} className={inputCls} />
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="LOCAL SERVICES">
          <ul className="space-y-2">
            {(["ollama", "chroma", "whisper", "piper", "pcControl", "backend"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${
                    status[k] ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-500/70"
                  }`}
                />
                <span className="text-sm w-28 capitalize">{k}</span>
                <input
                  value={settings.endpoints[k]}
                  onChange={(e) => updateEndpoint(k, e.target.value)}
                  className={inputCls + " flex-1"}
                />
                {!status[k] && (
                  <button
                    onClick={() => startService(k)}
                    className="text-xs px-3 py-1.5 rounded-md border border-[color:var(--color-cyan-glow)]/40 hover:bg-[color:var(--color-cyan-glow)]/10"
                  >
                    Start
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="INTEGRATIONS">
          <Field label="Tavily API key (web search)">
            <input
              type="password"
              value={settings.tavilyKey}
              onChange={(e) => update("tavilyKey", e.target.value)}
              className={inputCls}
              placeholder="tvly-…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Toggle label="Auto-speak responses" on={settings.autoSpeak} onChange={(v) => update("autoSpeak", v)} />
            <Toggle label="Web search" on={settings.webSearch} onChange={(v) => update("webSearch", v)} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Google Calendar & Gmail OAuth: set up in a follow-up; placeholders shown on the dashboard for now.
          </p>
        </Panel>

        <Panel title="VOICE">
          <Field label="Voice name (Piper)">
            <input value={settings.voiceName} onChange={(e) => update("voiceName", e.target.value)} className={inputCls} />
          </Field>
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-2">Re-enroll voiceprint (5 samples).</div>
            <div className="flex items-center gap-3">
              <button
                onClick={recordSample}
                disabled={recording || enrollVecs.length >= 5}
                className="px-4 py-2 rounded-md border border-[color:var(--color-cyan-glow)]/50 hover:bg-[color:var(--color-cyan-glow)]/10 disabled:opacity-40 text-sm"
              >
                {recording ? "● recording…" : "● record sample"}
              </button>
              <span className="text-xs text-muted-foreground">{enrollVecs.length} / 5</span>
              <button
                onClick={resetVoice}
                disabled={enrollVecs.length < 5}
                className="ml-auto px-4 py-2 rounded-md bg-[color:var(--color-cyan-glow)] text-black text-xs font-display tracking-widest disabled:opacity-30"
              >
                SAVE VOICEPRINT
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="SECURITY">
          <Field label="Change PIN">
            <div className="flex gap-2">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="New 4+ digit PIN"
                className={inputCls + " flex-1"}
              />
              <button
                onClick={changePin}
                disabled={pin.length < 4}
                className="px-4 py-2 rounded-md bg-[color:var(--color-cyan-glow)] text-black text-xs font-display tracking-widest disabled:opacity-30"
              >
                UPDATE
              </button>
            </div>
          </Field>
        </Panel>

        <Panel title="DATA">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportMemories}
              className="px-4 py-2 rounded-md border border-border hover:border-[color:var(--color-cyan-glow)]/60 text-sm"
            >
              Export backup (.json)
            </button>
            <button
              onClick={factoryReset}
              className="px-4 py-2 rounded-md border border-destructive/60 text-destructive hover:bg-destructive/10 text-sm"
            >
              Factory reset
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Storage usage: {typeof window !== "undefined" ? estimateLocalSize() : "—"}
          </p>
        </Panel>
      </div>
    </div>
  );
}

const inputCls =
  "bg-black/40 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-cyan-glow)] w-full";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-widest uppercase text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center justify-between gap-3 glass border border-border rounded-md px-3 py-2 hover:border-[color:var(--color-cyan-glow)]/60 transition"
    >
      <span className="text-sm">{label}</span>
      <span
        className={`w-9 h-5 rounded-full relative transition ${on ? "bg-[color:var(--color-cyan-glow)]" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function estimateLocalSize() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("friday::")) total += (localStorage.getItem(k)?.length ?? 0) + k.length;
  }
  return `${(total / 1024).toFixed(1)} KB local`;
}
