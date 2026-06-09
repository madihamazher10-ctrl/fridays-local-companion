import { useEffect, useState } from "react";
import { Orb } from "./Orb";
import { sha256, type UserProfile } from "@/lib/friday/store";

export function LockScreen({
  user,
  onUnlock,
  lockedUntil,
  failedAttempts,
  onFail,
  onLock,
}: {
  user: UserProfile;
  onUnlock: () => void;
  lockedUntil: number;
  failedAttempts: number;
  onFail: (next: number) => void;
  onLock: (until: number) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const locked = lockedUntil > now;
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    const h = await sha256(pin);
    if (h === user.pinHash) {
      onUnlock();
    } else {
      const next = failedAttempts + 1;
      onFail(next);
      setError("Incorrect PIN.");
      setPin("");
      if (next >= 3) {
        onLock(Date.now() + 5 * 60 * 1000);
        setError("Too many attempts. Locked for 5 minutes.");
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 scanlines">
      <div className="glass hud-corners rounded-2xl p-10 max-w-md w-full text-center animate-fade-up">
        <Orb size={140} state={locked ? "thinking" : "idle"} />
        <div className="mt-6 text-xs tracking-[0.4em] text-[color:var(--color-cyan-glow)]">
          SECURE ACCESS
        </div>
        <h2 className="font-display text-2xl mt-2 glow-text">
          Welcome back, {user.name}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {locked ? `Locked. ${remaining}s remaining` : "Enter PIN to continue"}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            value={pin}
            disabled={locked}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-full bg-black/40 border border-border rounded-lg px-4 py-4 font-display text-3xl tracking-[0.6em] text-center focus:outline-none focus:border-[color:var(--color-cyan-glow)] disabled:opacity-40"
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <button
            type="submit"
            disabled={locked || pin.length < 4}
            className="w-full py-3 rounded-lg font-display tracking-widest bg-[color:var(--color-cyan-glow)] text-black hover:brightness-110 disabled:opacity-30 transition glow-border"
          >
            UNLOCK
          </button>
        </form>
      </div>
    </div>
  );
}
