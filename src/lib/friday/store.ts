// Local store backed by localStorage for FRIDAY's user, voiceprint, settings, and memories cache.
import { useEffect, useState, useCallback } from "react";

const PREFIX = "friday::";

export type Endpoints = {
  ollama: string;
  chroma: string;
  whisper: string;
  piper: string;
  pcControl: string;
};

export type Settings = {
  endpoints: Endpoints;
  model: string;
  autoSpeak: boolean;
  webSearch: boolean;
  tavilyKey: string;
  voiceName: string;
};

export type UserProfile = {
  name: string;
  photo?: string; // data URL
  pinHash: string;
  voiceprint: number[] | null;
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
  meta?: { searched?: boolean; offline?: boolean; memorySaved?: boolean };
};

export type Memory = {
  id: string;
  text: string;
  ts: number;
  tags?: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  endpoints: {
    ollama: "http://localhost:11434",
    chroma: "http://localhost:8000",
    whisper: "http://localhost:8080",
    piper: "http://localhost:5000",
    pcControl: "http://localhost:7000",
  },
  model: "llama3",
  autoSpeak: true,
  webSearch: true,
  tavilyKey: "",
  voiceName: "default",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
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
};
