import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel } from "@/components/friday/Dashboard";
import {
  usePersistent,
  DEFAULT_SETTINGS,
  STORE_KEYS,
  sha256,
  wipeAll,
  VOICE_OPTIONS,
  type Settings,
  type UserProfile,
} from "@/lib/friday/store";
import {
  checkAllServices,
  ollamaListModels,
  piperPreviewVoice,
  memoryExport,
} from "@/lib/friday/services";
import { googleSignIn, googleFetchProfile } from "@/lib/friday/google";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "FRIDAY · Settings" }] }),
  component: () => (
    <ClientOnly fallback={<div className="p-8">Loading…</div>}>
      <SettingsPage />
    </ClientOnly>
  ),
});

const DEFAULT_MODELS = ["llama3", "mistral", "gemma", "phi3"];

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
    memory: false,
  });
  const [models, setModels] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [info, setInfo] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

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

  async function changePin() {
    if (pin.length < 4 || !user) return;
    const pinHash = await sha256(pin);
    setUser({ ...user, pinHash });
    setPin("");
    setInfo("PIN updated.");
  }

  async function connectGoogle() {
    if (!settings.googleClientId) {
      setInfo("Add a Google OAuth Client ID below first.");
      return;
    }
    setConnecting(true);
    try {
      const { token, expiresAt } = await googleSignIn(settings.googleClientId);
      const profile = await googleFetchProfile(token);
      setSettings((s) => ({
        ...s,
        googleToken: token,
        googleTokenExpiry: expiresAt,
        googleProfile: { name: profile.name, email: profile.email, picture: profile.picture },
      }));
      setInfo(`Connected as ${profile.email}.`);
    } catch (e) {
      setInfo(`Google sign-in failed: ${(e as Error).message}`);
    } finally {
      setConnecting(false);
    }
  }

  function disconnectGoogle() {
    setSettings((s) => ({ ...s, googleToken: "", googleTokenExpiry: 0, googleProfile: null }));
    setInfo("Google disconnected.");
  }

  async function previewVoice(id: string) {
    setPreviewing(id);
    try {
      const audio = await piperPreviewVoice(settings.endpoints.piper, id);
      audio.addEventListener("ended", () => setPreviewing(null), { once: true });
      audio.addEventListener("error", () => setPreviewing(null), { once: true });
      await audio.play().catch(() => setPreviewing(null));
    } catch {
      setPreviewing(null);
    }
  }

  async function backupMemories() {
    setInfo("Requesting memory export…");
    const blob = await memoryExport(settings.endpoints.memory);
    if (!blob) {
      setInfo(`Couldn't reach memory service at ${settings.endpoints.memory}/memory/export.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `friday-memories-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setInfo("Backup downloaded.");
  }

  function factoryReset() {
    if (!confirm("Wipe all local FRIDAY data and restart onboarding?")) return;
    wipeAll();
    location.href = "/";
  }

  const modelList = Array.from(new Set([...DEFAULT_MODELS, ...models]));

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

        <Panel title="ASSISTANT">
          <Field label="Assistant name (used everywhere)">
            <input
              value={settings.assistantName}
              onChange={(e) => update("assistantName", e.target.value)}
              className={inputCls}
              placeholder="FRIDAY"
            />
          </Field>
        </Panel>

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
              <select value={settings.model} onChange={(e) => update("model", e.target.value)} className={inputCls}>
                {modelList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="LOCAL SERVICES">
          <ul className="space-y-2">
            {(["backend", "ollama", "memory", "whisper", "piper", "pcControl"] as const).map((k) => (
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
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="WEB SEARCH (TAVILY)">
          <Field label="Tavily API key">
            <input
              type="password"
              value={settings.tavilyKey}
              onChange={(e) => update("tavilyKey", e.target.value)}
              className={inputCls}
              placeholder="tvly-…"
            />
          </Field>
          <p className="text-[10px] text-muted-foreground mt-1">
            Used server-side by the bridge for automatic web augmentation when online.
          </p>
        </Panel>

        <Panel title="GOOGLE INTEGRATION">
          <Field label="Google OAuth Client ID">
            <input
              value={settings.googleClientId}
              onChange={(e) => update("googleClientId", e.target.value)}
              className={inputCls}
              placeholder="xxxxxxxx-xxxx.apps.googleusercontent.com"
            />
          </Field>
          <div className="mt-3 flex items-center gap-3">
            {settings.googleToken && settings.googleProfile ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  {settings.googleProfile.picture && (
                    <img
                      src={settings.googleProfile.picture}
                      alt=""
                      className="w-8 h-8 rounded-full border border-[color:var(--color-cyan-glow)]/40"
                    />
                  )}
                  <span>
                    ✅ Connected as <strong>{settings.googleProfile.name}</strong>
                    <span className="block text-[10px] text-muted-foreground">{settings.googleProfile.email}</span>
                  </span>
                </div>
                <button
                  onClick={disconnectGoogle}
                  className="ml-auto px-3 py-1.5 text-xs rounded-md border border-destructive/60 text-destructive hover:bg-destructive/10"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connectGoogle}
                disabled={connecting}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-white text-black text-sm font-medium hover:brightness-95 disabled:opacity-40"
              >
                <GoogleLogo />
                {connecting ? "Connecting…" : "Connect Google"}
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Requests Calendar & Gmail read-only scopes. Token stays in your browser only.
          </p>
        </Panel>

        <Panel title="VOICE">
          <div className="grid gap-2">
            {VOICE_OPTIONS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => update("voiceName", v.id)}
                className={`flex items-center gap-3 text-left p-3 rounded-lg border transition ${
                  settings.voiceName === v.id
                    ? "border-[color:var(--color-cyan-glow)] bg-[color:var(--color-cyan-glow)]/10"
                    : "border-border hover:border-[color:var(--color-cyan-glow)]/60"
                }`}
              >
                <span className="text-2xl">{v.flag}</span>
                <span className="flex-1">
                  <span className="font-display tracking-wide block">{v.label}</span>
                  <span className="text-[11px] text-muted-foreground">{v.description}</span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void previewVoice(v.id);
                  }}
                  className={`px-3 py-1 rounded-md border text-xs ${
                    previewing === v.id
                      ? "border-[color:var(--color-cyan-glow)] text-[color:var(--color-cyan-glow)] animate-pulse"
                      : "border-border hover:border-[color:var(--color-cyan-glow)]/60"
                  }`}
                >
                  {previewing === v.id ? "▶ playing" : "▶ Preview"}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Toggle label="Auto-speak responses" on={settings.autoSpeak} onChange={(v) => update("autoSpeak", v)} />
            <Toggle label="Web search" on={settings.webSearch} onChange={(v) => update("webSearch", v)} />
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
              onClick={backupMemories}
              className="px-4 py-2 rounded-md border border-border hover:border-[color:var(--color-cyan-glow)]/60 text-sm"
            >
              Backup Memories
            </button>
            <button
              onClick={factoryReset}
              className="px-4 py-2 rounded-md border border-destructive/60 text-destructive hover:bg-destructive/10 text-sm"
            >
              Reset FRIDAY
            </button>
          </div>
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
      <span className={`w-9 h-5 rounded-full relative transition ${on ? "bg-[color:var(--color-cyan-glow)]" : "bg-muted"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-8l-6.5 5C9.5 39.4 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.5l6.2 5.3C40.5 35.9 44 30.4 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
