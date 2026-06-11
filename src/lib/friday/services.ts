// Client wrappers around the local services that power FRIDAY.
// All calls are made from the browser to localhost; no server functions needed.

import type { Endpoints, Memory, Source } from "./store";

export async function checkService(url: string, path = "/"): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(url + path, { signal: ctrl.signal, mode: "cors" });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/* ---------------- Ollama ---------------- */

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

export async function ollamaListModels(endpoint: string): Promise<string[]> {
  try {
    const r = await fetch(`${endpoint}/api/tags`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models ?? []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

/* ---------------- ChromaDB ---------------- */

const COLLECTION = "friday_memory";

export async function chromaAddMemory(endpoint: string, m: Memory): Promise<boolean> {
  try {
    await ensureChromaCollection(endpoint);
    const res = await fetch(`${endpoint}/api/v1/collections/${COLLECTION}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [m.id], documents: [m.text], metadatas: [{ ts: m.ts }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function chromaQuery(endpoint: string, query: string, n = 5): Promise<string[]> {
  try {
    const res = await fetch(`${endpoint}/api/v1/collections/${COLLECTION}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query_texts: [query], n_results: n }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.documents?.[0] ?? []) as string[];
  } catch {
    return [];
  }
}

async function ensureChromaCollection(endpoint: string) {
  try {
    await fetch(`${endpoint}/api/v1/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: COLLECTION, get_or_create: true }),
    });
  } catch {}
}

export async function chromaDelete(endpoint: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/api/v1/collections/${COLLECTION}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------------- Whisper.cpp ---------------- */

// POST audio file under "audio" key to /transcribe.
export async function whisperTranscribeAudio(endpoint: string, blob: Blob): Promise<string> {
  const fd = new FormData();
  const filename = blob.type.includes("wav") ? "recording.wav" : "recording.webm";
  fd.append("audio", blob, filename);
  const res = await fetch(`${endpoint}/transcribe`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Whisper /transcribe error: ${res.status}`);
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  return String((j as { text?: string }).text ?? "").trim();
}

/* ---------------- Piper TTS ---------------- */

export async function piperSynthesize(
  endpoint: string,
  text: string,
  voice?: string,
): Promise<HTMLAudioElement> {
  const res = await fetch(`${endpoint}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voice ? { text, voice } : { text }),
  });
  if (!res.ok) throw new Error(`Piper /synthesize error: ${res.status}`);
  const buf = await res.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  return audio;
}

export async function piperPreviewVoice(endpoint: string, voice: string): Promise<HTMLAudioElement> {
  const res = await fetch(`${endpoint}/voices/test/${encodeURIComponent(voice)}`, { method: "POST" });
  if (!res.ok) throw new Error(`Piper preview error: ${res.status}`);
  const buf = await res.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  return audio;
}

/* ---------------- FRIDAY Bridge Server ---------------- */

export type BridgeChatRequest = {
  message: string;
  model?: string;
  stream?: boolean;
  use_memory?: boolean;
  save_memory?: boolean;
  topic?: string;
  assistant_name?: string;
  system?: string;
};

export type BridgeAction = { type: string; [k: string]: unknown };

export type BridgeChatResponse = {
  response: string;
  sources?: Source[];
  actions?: BridgeAction[];
  searched?: boolean;
  offline?: boolean;
};

export async function bridgeChat(
  endpoint: string,
  payload: BridgeChatRequest,
): Promise<BridgeChatResponse> {
  const res = await fetch(`${endpoint}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`);
  const j = (await res.json()) as Partial<BridgeChatResponse> & { reply?: string; message?: string };
  return {
    response: j.response ?? j.reply ?? j.message ?? "",
    sources: j.sources,
    actions: j.actions,
    searched: j.searched,
    offline: j.offline,
  };
}

export async function bridgeExecuteAction(endpoint: string, action: BridgeAction): Promise<void> {
  try {
    await fetch(`${endpoint}/execute-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
  } catch {}
}

/* ---------------- Memory service (separate backup endpoint) ---------------- */

export async function memoryExport(endpoint: string): Promise<Blob | null> {
  try {
    const r = await fetch(`${endpoint}/memory/export`);
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

/* ---------------- PC Control ---------------- */

export type PcCommand =
  | "volume_up"
  | "volume_down"
  | "open_browser"
  | "open_files"
  | "open_spotify"
  | "open_youtube"
  | "sleep"
  | "shutdown";

export async function pcControl(endpoint: string, cmd: PcCommand): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------------- Status ---------------- */

export async function checkAllServices(endpoints: Endpoints) {
  const [ollama, chroma, whisper, piper, pc, backend, memory] = await Promise.all([
    checkService(endpoints.ollama, "/api/tags"),
    checkService(endpoints.chroma, "/api/v1/heartbeat"),
    checkService(endpoints.whisper, "/"),
    checkService(endpoints.piper, "/"),
    checkService(endpoints.pcControl, "/"),
    checkService(endpoints.backend, "/"),
    checkService(endpoints.memory, "/"),
  ]);
  return { ollama, chroma, whisper, piper, pcControl: pc, backend, memory };
}
