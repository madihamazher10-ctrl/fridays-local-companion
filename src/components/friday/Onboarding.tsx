import { useEffect, useState } from "react";
import { Orb } from "./Orb";
import { recordAudio, averageVectors } from "@/lib/friday/voiceprint";
import { sha256, type UserProfile } from "@/lib/friday/store";

const PHRASES = [
  "My name is the key.",
  "FRIDAY, you are loyal to me alone.",
  "Activate protocol Iron Heart.",
  "Initialize personal assistant systems.",
  "Authorize voice signature now.",
];

export function Onboarding({ onComplete }: { onComplete: (u: UserProfile) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [vecs, setVecs] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [recIndex, setRecIndex] = useState(0);

  async function handleRecord() {
    setError("");
    setRecording(true);
    try {
      const vec = await recordAudio(3);
      setVecs((v) => [...v, Array.from(vec)]);
      setRecIndex((i) => i + 1);
    } catch (e) {
      setError("Microphone access denied. Check browser permissions.");
    } finally {
      setRecording(false);
    }
  }

  async function finish() {
    if (pin.length < 4) return setError("PIN must be at least 4 digits.");
    if (pin !== pin2) return setError("PINs do not match.");
    if (vecs.length < 5) return setError("Record all 5 voice samples.");
    const voiceprint = averageVectors(vecs);
    const pinHash = await sha256(pin);
    onComplete({ name: name.trim() || "User", photo, pinHash, voiceprint, createdAt: Date.now() });
  }

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 scanlines">
      <div className="glass hud-corners rounded-2xl p-8 md:p-12 max-w-2xl w-full animate-fade-up">
        <div className="flex items-center gap-6 mb-8">
          <Orb size={120} state="idle" />
          <div>
            <div className="text-xs tracking-[0.4em] text-[color:var(--color-cyan-glow)] mb-1">
              SYSTEM INITIALIZATION
            </div>
            <h1 className="text-4xl font-display font-bold glow-text">FRIDAY</h1>
            <p className="text-muted-foreground text-sm mt-1">Personal AI Assistant — v1.0</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {["Identity", "Photo", "Security", "Voice"].map((s, i) => (
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
              What should I call you?
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tony"
                className="mt-2 w-full bg-black/40 border border-border rounded-lg px-4 py-3 font-display text-lg tracking-wider focus:outline-none focus:border-[color:var(--color-cyan-glow)] focus:glow-border"
              />
            </label>
            <NextBtn onClick={() => setStep(1)} disabled={!name.trim()}>
              Continue
            </NextBtn>
          </div>
        )}

        {step === 1 && (
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
              <BackBtn onClick={() => setStep(0)} />
              <NextBtn onClick={() => setStep(2)}>{photo ? "Continue" : "Skip"}</NextBtn>
            </div>
          </div>
        )}

        {step === 2 && (
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
              <BackBtn onClick={() => setStep(1)} />
              <NextBtn
                onClick={() => {
                  setError("");
                  if (pin.length < 4) return setError("PIN must be at least 4 digits.");
                  if (pin !== pin2) return setError("PINs do not match.");
                  setStep(3);
                }}
              >
                Continue
              </NextBtn>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fade-up">
            <p className="text-sm text-muted-foreground">
              Record 5 voice samples to enroll your voiceprint. Speak clearly for ~3 seconds.
            </p>
            <div className="glass rounded-lg p-4 text-center">
              <div className="text-xs tracking-widest text-[color:var(--color-cyan-glow)] mb-2">
                SAMPLE {Math.min(recIndex + 1, 5)} / 5
              </div>
              <div className="font-display text-lg">
                "{PHRASES[Math.min(recIndex, PHRASES.length - 1)]}"
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRecord}
                disabled={recording || vecs.length >= 5}
                className="flex-1 py-3 rounded-lg border border-[color:var(--color-cyan-glow)]/60 bg-[color:var(--color-cyan-glow)]/10 hover:bg-[color:var(--color-cyan-glow)]/20 disabled:opacity-40 transition font-display tracking-widest"
              >
                {recording ? "● RECORDING…" : vecs.length >= 5 ? "ENROLLED" : "● RECORD"}
              </button>
              <div className="text-xs text-muted-foreground w-16 text-right">
                {vecs.length}/5 saved
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex gap-2">
              <BackBtn onClick={() => setStep(2)} />
              <NextBtn onClick={finish} disabled={vecs.length < 5}>
                Activate FRIDAY
              </NextBtn>
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
