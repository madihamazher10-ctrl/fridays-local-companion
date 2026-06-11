// Local store backed by localStorage for FRIDAY's user, settings, memories, and chat.
import { useEffect, useState, useCallback } from "react";

const PREFIX = "friday::";

export type Endpoints = {
  ollama: string;
  chroma: string;
  whisper: string;
  piper: string;
  pcControl: string;
  backend: string;
  memory: string;
};

export type GoogleProfile = {
  name: string;
  email: string;
  picture?: string;
};

export type Settings = {
  endpoints: Endpoints;
  model: string;
  autoSpeak: boolean;
  webSearch: boolean;
  tavilyKey: string;
  voiceName: string;
  assistantName: string;
  googleClientId: string;
  googleToken: string;
  googleTokenExpiry: number;
  googleProfile: GoogleProfile | null;
  lastPlanDate: string;
};

export type UserProfile = {
  name: string;
  photo?: string;
  pinHash: string;
  voiceprint: number[] | null;
  createdAt: number;
};

export type Source = { title?: string; url: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
  meta?: { searched?: boolean; offline?: boolean; memorySaved?: boolean; sources?: Source[] };
};

export type Memory = {
  id: string;
  text: string;
  ts: number;
  tags?: string[];
};

export type VoiceOption = {
  id: string;
  label: string;
  flag: string;
  description: string;
};

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "en_GB-alan-medium", label: "Alan", flag: "🇬🇧", description: "British Male — JARVIS-like" },
  { id: "en_US-ryan-medium", label: "Ryan", flag: "🇺🇸", description: "American Male" },
  { id: "en_US-amy-medium", label: "Amy", flag: "🇺🇸", description: "American Female" },
  { id: "en_US-lessac-medium", label: "Lessac", flag: "🇺🇸", description: "Clear American Female" },
  { id: "en_IN-en-x-low", label: "Priya", flag: "🇮🇳", description: "Indian English" },
];

export const DEFAULT_SETTINGS: Settings = {
  endpoints: {
    ollama: "http://localhost:11434",
    chroma: "http://localhost:8000",
    whisper: "http://localhost:8080",
    piper: "http://localhost:5000",
    pcControl: "http://localhost:7000",
    backend: "http://localhost:9000",
    memory: "http://localhost:8001",
  },
  model: "llama3",
  autoSpeak: true,
  webSearch: true,
  tavilyKey: "",
  voiceName: "en_GB-alan-medium",
  assistantName: "FRIDAY",
  googleClientId: "",
  googleToken: "",
  googleTokenExpiry: 0,
  googleProfile: null,
  lastPlanDate: "",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    // Deep-merge for objects so new default fields appear after upgrades
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && fallback && typeof fallback === "object") {
      return mergeDefaults(fallback as object, parsed as object) as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function mergeDefaults<T extends object>(defaults: T, value: object): T {
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(value)) {
    const dv = (defaults as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && dv && typeof dv === "object") {
      out[k] = mergeDefaults(dv as object, v as object);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function usePersistent<T>(key: string, fallback: T) {
  const [val, setVal] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setVal(read<T>(key, fallback));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setVal((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        write(key, v);
        return v;
      });
    },
    [key],
  );

  return [val, update, hydrated] as const;
}

export async function sha256(str: string) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const STORE_KEYS = {
  user: "user",
  settings: "settings",
  memories: "memories",
  chat: "chat",
  failedAttempts: "failedAttempts",
  lockUntil: "lockUntil",
  lastPlanDate: "lastPlanDate",
};

export function wipeAll() {
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
