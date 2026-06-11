import { useState } from "react";
import { Orb } from "./Orb";
import { recordAudio, averageVectors } from "@/lib/friday/voiceprint";
import { piperPreviewVoice } from "@/lib/friday/services";
import { sha256, VOICE_OPTIONS, DEFAULT_SETTINGS, type UserProfile } from "@/lib/friday/store";

const PHRASES = [
  "My name is the key.",
  "You are loyal to me alone.",
  "Activate protocol Iron Heart.",
  "Initialize personal assistant systems.",
  "Authorize voice signature now.",
];

export function Onboarding({
  onComplete,
}: {
  onComplete: (data: { user: UserProfile; assistantName: string; voiceName: string }) => void;
}) {
  const [step, setStep] = useState(0);
  const [assistantName, setAssistantName] = useState("FRIDAY");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [voice, setVoice] = useState(DEFAULT_SETTINGS.voiceName);
  const [error, setError] = useState("");
  const [vecs, setVecs] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [recIndex, setRecIndex] = useState(0);
  const [previewing, setPreviewing] = useState<string | null>(null);

  async function handleRecord() {
    setError("");
    setRecording(true);
    try {
      const vec = await recordAudio(3);
      setVecs((v) => [...v, Array.from(vec)]);
      setRecIndex((i) => i + 1);
    } catch {
      setError("Microphone access denied. Check browser permissions.");
    } finally {
      setRecording(false);
    }
  }

  async function finish() {
    if (pin.length < 4) return setError("PIN must be at least 4 digits.");
    if (pin !== pin2) return setError("PINs do not match.");
    const voiceprint = vecs.length >= 5 ? averageVectors(vecs) : null;
    const pinHash = await sha256(pin);
    onComplete({
      user: {
        name: name.trim() || "User",
        photo,
        pinHash,
        voiceprint,
        createdAt: Date.now(),
      },
      assistantName: assistantName.trim() || "FRIDAY",
      voiceName: voice,
    });
  }

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function previewVoice(id: string) {
    setPreviewing(id);
    try {
      const audio = await piperPreviewVoice(DEFAULT_SETTINGS.endpoints.piper, id);
      audio.addEventListener("ended", () => setPreviewing(null), { once: true });
      audio.addEventListener("error", () => setPreviewing(null), { once: true });
      await audio.play().catch(() => setPreviewing(null));
    } catch {
      setPreviewing(null);
    }
  }

  const STEP_LABELS = ["Assistant", "Identity", "Photo", "Security", "Voice"];

  return (
    <div className="min-h-screen flex items-center justify-center p-6 scanlines">
      <div className="glass hud-corners rounded-2xl p-8 md:p-12 max-w-2xl w-full animate-fade-up">
        <div className="flex items-center gap-6 mb-8">
          <Orb size={120} state="idle" />
          <div>
            <div className="text-xs tracking-[0.4em] text-[color:var(--color-cyan-glow)] mb-1">
              SYSTEM INITIALIZATION
            </div>
            <h1 className="text-4xl font-display font-bold glow-text">{(assistantName || "FRIDAY").toUpperCase()}</h1>
            <p className="text-muted-foreground text-sm mt-1">Personal AI Assistant — v1.0</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {STEP_LABELS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 text-[10px] tracking-widest uppercase pb-2 border-b-2 transition ${
                i === step
                  ? "border-[color:var(--color-cyan-glow)] text-[color:var(--color-cyan-glow)]"
                  : i < step
                    ? "border-[color:var(--color-cyan-glow)]/40 text-[color:var(--color-cyan-glow)]/60"
                    : "border-border text-muted-foreground"
              }`}
            >
              {String(i + 1).padStart(2, "0")} · {s}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4 animate-fade-up">
            <label className="block text-sm text-muted-foreground">
              What should I name your assistant?
              <input
                autoFocus
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="FRIDAY"
                className="mt-2 w-full bg-black/40 border border-border rounded-lg px-4 py-3 font-display text-lg tracking-wider focus:outline-none focus:border-[color:var(--color-cyan-glow)] focus:glow-border"
              />
            </label>
            <NextBtn onClick={() => setStep(1)} disabled={!assistantName.trim()}>
              Continue
            </NextBtn>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-fade-up">
            <label className="block text-sm text-muted-foreground">
              What should I call you?
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tony"
                className="mt-2 w-full bg-black/40 border border-border rounded-lg px-4 py-3 font-display text-lg tracking-wider focus:outline-none focus:border-[color:var(--color-cyan-glow)] focus:glow-border"
              />
            </label>
            <div className="flex gap-2">
              <BackBtn onClick={() => setStep(0)} />
              <NextBtn onClick={() => setStep(2)} disabled={!name.trim()}>
                Continue
              </NextBtn>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-fade-up">
            <p className="text-sm text-muted-foreground">Profile photo (optional).</p>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full glass border border-[color:var(--color-cyan-glow)]/40 overflow-hidden flex items-center justify-center">
                {photo ? (
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[color:var(--color-cyan-glow)]/40 text-xs">no image</span>
                )}
              </div>
              <label className="cursor-pointer text-sm px-4 py-2 border border-[color:var(--color-cyan-glow)]/50 rounded-lg hover:bg-[color:var(--color-cyan-glow)]/10 transition">
                Choose image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <BackBtn onClick={() => setStep(1)} />
              <NextBtn onClick={() => setStep(3)}>{photo ? "Continue" : "Skip"}</NextBtn>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fade-up">
            <p className="text-sm text-muted-foreground">Set a 4+ digit PIN for access.</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="w-full bg-black/40 border border-border rounded-lg px-4 py-3 font-display text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-[color:var(--color-cyan-glow)]"
            />
            <input
              type="password"
              inputMode="numeric"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              placeholder="Confirm PIN"
              className="w-full bg-black/40 border border-border rounded-lg px-4 py-3 font-display text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-[color:var(--color-cyan-glow)]"
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-2">
              <BackBtn onClick={() => setStep(2)} />
              <NextBtn
                onClick={() => {
                  setError("");
                  if (pin.length < 4) return setError("PIN must be at least 4 digits.");
                  if (pin !== pin2) return setError("PINs do not match.");
                  setStep(4);
                }}
              >
                Continue
              </NextBtn>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-fade-up">
            <p className="text-sm text-muted-foreground">Choose your assistant's voice. Click ▶ to preview.</p>
            <div className="grid gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoice(v.id)}
                  className={`flex items-center gap-3 text-left p-3 rounded-lg border transition ${
                    voice === v.id
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

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Optional: enroll voiceprint for biometric login ({vecs.length}/5)</summary>
              <div className="mt-3 space-y-3">
                <div className="glass rounded-lg p-3 text-center text-sm font-display">
                  "{PHRASES[Math.min(recIndex, PHRASES.length - 1)]}"
                </div>
                <button
                  type="button"
                  onClick={handleRecord}
                  disabled={recording || vecs.length >= 5}
                  className="w-full py-2 rounded-lg border border-[color:var(--color-cyan-glow)]/60 bg-[color:var(--color-cyan-glow)]/10 hover:bg-[color:var(--color-cyan-glow)]/20 disabled:opacity-40 font-display tracking-widest text-xs"
                >
                  {recording ? "● RECORDING…" : vecs.length >= 5 ? "ENROLLED" : "● RECORD SAMPLE"}
                </button>
              </div>
            </details>

            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-2">
              <BackBtn onClick={() => setStep(3)} />
              <NextBtn onClick={finish}>Activate {assistantName || "FRIDAY"}</NextBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NextBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-3 rounded-lg font-display tracking-widest bg-[color:var(--color-cyan-glow)] text-black hover:brightness-110 disabled:opacity-30 transition glow-border"
    >
      {children}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-3 rounded-lg border border-border text-muted-foreground hover:text-foreground transition"
    >
      ← Back
    </button>
  );
}
