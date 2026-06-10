import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useState } from "react";
import { Onboarding } from "@/components/friday/Onboarding";
import { LockScreen } from "@/components/friday/LockScreen";
import { Dashboard } from "@/components/friday/Dashboard";
import { usePersistent, DEFAULT_SETTINGS, STORE_KEYS, type Settings, type UserProfile } from "@/lib/friday/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JESSICA — Personal AI Assistant" },
      { name: "description", content: "Your private, local-first AI. Loyal to one user. Built to learn." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<BootSplash />}>
      <AppShell />
    </ClientOnly>
  );
}

function BootSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-display tracking-[0.5em] text-[color:var(--color-cyan-glow)] glow-text animate-pulse">
        BOOTING JESSICA…
      </div>
    </div>
  );
}

function AppShell() {
  const [user, setUser, userHydrated] = usePersistent<UserProfile | null>(STORE_KEYS.user, null);
  const [settings, setSettings] = usePersistent<Settings>(STORE_KEYS.settings, DEFAULT_SETTINGS);
  const [failed, setFailed] = usePersistent<number>(STORE_KEYS.failedAttempts, 0);
  const [lockUntil, setLockUntil] = usePersistent<number>(STORE_KEYS.lockUntil, 0);
  const [unlocked, setUnlocked] = useState(false);

  if (!userHydrated) return <BootSplash />;
  if (!user) return <Onboarding onComplete={(u) => setUser(u)} />;
  if (!unlocked) {
    return (
      <LockScreen
        user={user}
        lockedUntil={lockUntil}
        failedAttempts={failed}
        onFail={(n) => setFailed(n)}
        onLock={(u) => setLockUntil(u)}
        onUnlock={() => {
          setFailed(0);
          setLockUntil(0);
          setUnlocked(true);
        }}
      />
    );
  }
  return <Dashboard user={user} settings={settings} setSettings={setSettings} />;
}
