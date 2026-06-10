// Client wrappers around the local services that power FRIDAY.
// All calls are made from the browser to localhost; no server functions needed.

import type { Endpoints, Memory } from "./store";

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

export async function ollamaChatStream(
  endpoint: string,
  model: string,
  messages: OllamaMessage[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama error: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        const tok = j.message?.content ?? "";
        if (tok) {
          full += tok;
          onToken(tok);
        }
      } catch {}
    }
  }
  return full;
}

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
// Best-effort. ChromaDB's HTTP API varies by version. We use the v1 collections endpoints
// when reachable; otherwise we fall back silently. Memories are also kept in localStorage
// so the memory browser keeps working offline.

const COLLECTION = "friday_memory";

export async function chromaAddMemory(endpoint: string, m: Memory): Promise<boolean> {
  try {
    await ensureChromaCollection(endpoint);
    const res = await fetch(`${endpoint}/api/v1/collections/${COLLECTION}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [m.id],
        documents: [m.text],
        metadatas: [{ ts: m.ts }],
      }),
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

export async function whisperTranscribe(endpoint: string, blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "input.wav");
  fd.append("temperature", "0");
  fd.append("response_format", "json");
  const res = await fetch(`${endpoint}/inference`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Whisper error: ${res.status}`);
  const j = await res.json().catch(() => ({}));
  return (j.text ?? j.transcription ?? "").trim();
}

// New endpoint used by the mic button: POST audio file under "audio" key to /transcribe.
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

// Synthesize text via Piper /synthesize, return an Audio element ready to play.
export async function piperSynthesize(endpoint: string, text: string): Promise<HTMLAudioElement> {
  const res = await fetch(`${endpoint}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Piper /synthesize error: ${res.status}`);
  const buf = await res.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  return audio;
}

export async function piperSpeak(endpoint: string, text: string, _voice = "default"): Promise<void> {
  try {
    const audio = await piperSynthesize(endpoint, text);
    await audio.play().catch(() => {});
  } catch {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    }
  }
}

/* ---------------- FRIDAY Backend (chat orchestrator) ---------------- */

// Streams from POST {backend}/chat/stream. Accepts either SSE ("data: {json}\n\n")
// or newline-delimited JSON / raw text chunks. Returns the full assistant text.
export async function backendChatStream(
  endpoint: string,
  payload: { message: string; history?: OllamaMessage[]; context?: string },
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${endpoint}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Backend error: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  let buf = "";
  const emit = (raw: string) => {
    if (!raw) return;
    let tok = raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const j = JSON.parse(trimmed);
        tok = j.token ?? j.delta ?? j.content ?? j.message?.content ?? j.response ?? "";
      } catch {
        // not JSON, keep raw
      }
    }
    if (tok) {
      full += tok;
      onToken(tok);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split(/\r?\n/);
    buf = parts.pop() ?? "";
    for (const line of parts) {
      const l = line.trim();
      if (!l) continue;
      if (l.startsWith("data:")) emit(l.slice(5).trim());
      else emit(l);
    }
  }
  if (buf.trim()) emit(buf.trim());
  return full;
}

/* ---------------- PC Control (FastAPI) ---------------- */

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

/* ---------------- Tavily ---------------- */

export async function tavilySearch(apiKey: string, query: string): Promise<string> {
  if (!apiKey) return "";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: 5, include_answer: true }),
    });
    if (!res.ok) return "";
    const j = await res.json();
    const parts: string[] = [];
    if (j.answer) parts.push(`Answer: ${j.answer}`);
    for (const r of j.results ?? []) parts.push(`- ${r.title}: ${r.content}`);
    return parts.join("\n");
  } catch {
    return "";
  }
}

/* ---------------- Status ---------------- */

export async function checkAllServices(endpoints: Endpoints) {
  const [ollama, chroma, whisper, piper, pc] = await Promise.all([
    checkService(endpoints.ollama, "/api/tags"),
    checkService(endpoints.chroma, "/api/v1/heartbeat"),
    checkService(endpoints.whisper, "/"),
    checkService(endpoints.piper, "/"),
    checkService(endpoints.pcControl, "/"),
  ]);
  return { ollama, chroma, whisper, piper, pcControl: pc };
}
