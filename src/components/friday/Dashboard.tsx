import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Orb, type OrbState } from "./Orb";
import {
  chromaAddMemory,
  whisperTranscribeAudio,
  piperSynthesize,
  pcControl,
  checkAllServices,
  bridgeChat,
  bridgeExecuteAction,
  type PcCommand,
  type BridgeAction,
} from "@/lib/friday/services";
import {
  googleCalendarToday,
  gmailUnread,
  type CalendarEvent,
  type MailMessage,
} from "@/lib/friday/google";
import {
  STORE_KEYS,
  usePersistent,
  type ChatMessage,
  type Memory,
  type Settings,
  type UserProfile,
} from "@/lib/friday/store";

const QUICK_ACTIONS: { label: string; cmd: PcCommand; icon: string }[] = [
  { label: "Volume Up", cmd: "volume_up", icon: "🔊" },
  { label: "Volume Down", cmd: "volume_down", icon: "🔉" },
  { label: "Open Browser", cmd: "open_browser", icon: "🌐" },
  { label: "File Explorer", cmd: "open_files", icon: "📁" },
  { label: "Spotify", cmd: "open_spotify", icon: "🎵" },
  { label: "YouTube", cmd: "open_youtube", icon: "🎬" },
  { label: "Sleep PC", cmd: "sleep", icon: "💤" },
  { label: "Shutdown", cmd: "shutdown", icon: "⏻" },
];

export function Dashboard({
  user,
  settings,
  setSettings,
}: {
  user: UserProfile;
  settings: Settings;
  setSettings: (u: (s: Settings) => Settings) => void;
}) {
  const assistant = settings.assistantName || "FRIDAY";
  const [messages, setMessages, messagesHydrated] = usePersistent<ChatMessage[]>(STORE_KEYS.chat, []);
  const [lastPlanDate, setLastPlanDate] = usePersistent<string>(STORE_KEYS.lastPlanDate, "");
  const [input, setInput] = useState("");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [muted, setMuted] = useState(!settings.autoSpeak);
  const [status, setStatus] = useState({
    ollama: false,
    chroma: false,
    whisper: false,
    piper: false,
    pcControl: false,
    backend: false,
    memory: false,
  });
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [now, setNow] = useState(new Date());
  const [thinking, setThinking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [unread, setUnread] = useState<MailMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);
  const planAutoRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = () => checkAllServices(settings.endpoints).then((s) => mounted && setStatus(s));
    run();
    const t = setInterval(run, 15000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [settings.endpoints]);

  // Refresh Google data when token present.
  useEffect(() => {
    if (!settings.googleToken) {
      setEvents([]);
      setUnread([]);
      return;
    }
    googleCalendarToday(settings.googleToken).then(setEvents).catch(() => setEvents([]));
    gmailUnread(settings.googleToken, 5).then(setUnread).catch(() => setUnread([]));
  }, [settings.googleToken]);

  useEffect(() => {
    if (!messagesHydrated || greetedRef.current || messages.length > 0) return;
    greetedRef.current = true;
    const hour = new Date().getHours();
    const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const greeting = `Good ${part}, ${user.name}. All systems online. How can I assist you today?`;
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: greeting, ts: Date.now() }]);
    if (!muted) void speak(greeting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesHydrated, messages.length]);

  // Auto "Plan My Day" once per day, when Google is connected.
  useEffect(() => {
    if (!messagesHydrated || planAutoRef.current) return;
    const today = new Date().toDateString();
    if (settings.googleToken && lastPlanDate !== today && (events.length > 0 || unread.length > 0)) {
      planAutoRef.current = true;
      void planMyDay(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesHydrated, settings.googleToken, events, unread, lastPlanDate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function speak(text: string) {
    if (!text) return;
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
      } catch {}
      currentAudioRef.current = null;
    }
    try {
      const audio = await piperSynthesize(settings.endpoints.piper, text, settings.voiceName);
      currentAudioRef.current = audio;
      setOrbState("speaking");
      const done = new Promise<void>((resolve) => {
        audio.addEventListener("ended", () => resolve(), { once: true });
        audio.addEventListener("error", () => resolve(), { once: true });
      });
      await audio.play().catch(() => {});
      await done;
    } catch {
      // No fallback to browser TTS — spec requires Piper only.
    } finally {
      currentAudioRef.current = null;
      setOrbState((s) => (s === "speaking" ? "idle" : s));
    }
  }

  function isResearch(text: string) {
    return /\b(research|find information|latest on|what is the latest|investigate|deep dive)\b/i.test(text);
  }
  function needsCurrent(text: string) {
    return /\b(today|latest|current|news|weather|price|score|now|recent)\b/i.test(text);
  }

  async function send(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    setInput("");
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setOrbState("thinking");
    setThinking(true);
    if (online && needsCurrent(text)) setSearching(true);

    try {
      // Inject Google data if the user asks about schedule / email.
      let augmented = text;
      if (/\b(schedule|calendar|agenda|meetings? today)\b/i.test(text) && events.length) {
        augmented += `\n\n[Today's events]\n${formatEvents(events)}`;
      }
      if (/\b(email|inbox|mail)\b/i.test(text) && unread.length) {
        augmented += `\n\n[Unread emails]\n${formatEmails(unread)}`;
      }

      const research = isResearch(text);
      const res = await bridgeChat(settings.endpoints.backend, {
        message: augmented,
        model: settings.model,
        stream: false,
        use_memory: true,
        save_memory: true,
        topic: research ? "research" : "general",
        assistant_name: assistant,
        system: `You are ${assistant}, a highly intelligent, loyal, and witty personal AI assistant. You serve only ${user.name}. Be sharp, proactive, and use remembered context.`,
      });

      const reply = res.response || "(no response)";
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          ts: Date.now(),
          meta: { searched: res.searched ?? searching, offline: !online, sources: res.sources },
        },
      ]);

      if (res.actions?.length) {
        for (const a of res.actions as BridgeAction[]) {
          void bridgeExecuteAction(settings.endpoints.backend, a);
        }
      }

      // Mirror to local Chroma as a backup memory record.
      const memory: Memory = {
        id: crypto.randomUUID(),
        text: `User: ${text}\n${assistant}: ${reply}`,
        ts: Date.now(),
      };
      void chromaAddMemory(settings.endpoints.chroma, memory);

      if (!muted && reply) void speak(reply);
      else setOrbState("idle");
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ Bridge server offline. Run friday_bridge.py (expected at ${settings.endpoints.backend}/chat).`,
          ts: Date.now(),
        },
      ]);
      setOrbState("idle");
    } finally {
      setThinking(false);
      setSearching(false);
    }
  }

  async function planMyDay(auto = false) {
    setOrbState("thinking");
    setThinking(true);
    try {
      let evs = events;
      let mails = unread;
      if (settings.googleToken) {
        try {
          evs = await googleCalendarToday(settings.googleToken);
          setEvents(evs);
        } catch {}
        try {
          mails = await gmailUnread(settings.googleToken, 5);
          setUnread(mails);
        } catch {}
      }
      const evText = evs.length ? formatEvents(evs) : "(no events)";
      const mailText = mails.length ? formatEmails(mails) : "(no unread mail)";
      const message = `Plan my day. Here are my calendar events: ${evText}. Here are my unread emails: ${mailText}. Suggest a prioritized, time-blocked schedule with buffer time for breaks, plus a short motivational opening line addressed to ${user.name} by name.`;
      const res = await bridgeChat(settings.endpoints.backend, {
        message,
        model: settings.model,
        stream: false,
        use_memory: true,
        save_memory: true,
        topic: "daily-plan",
        assistant_name: assistant,
        system: `You are ${assistant}, ${user.name}'s personal AI assistant. Produce a clear, motivating daily plan.`,
      });
      const reply = res.response || "I couldn't build a plan right now.";
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `📅 Daily Plan\n\n${reply}`,
          ts: Date.now(),
          meta: { sources: res.sources },
        },
      ]);
      setLastPlanDate(new Date().toDateString());
      if (!muted) void speak(reply);
    } catch {
      if (!auto) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ Couldn't reach bridge at ${settings.endpoints.backend}.`,
            ts: Date.now(),
          },
        ]);
      }
    } finally {
      setThinking(false);
      setOrbState("idle");
    }
  }

  async function handleMic() {
    if (recording) {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") mr.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        setRecording(false);
        setOrbState("idle");
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(recordedChunksRef.current, { type: mr.mimeType || "audio/webm" });
        recordedChunksRef.current = [];
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const text = await whisperTranscribeAudio(settings.endpoints.whisper, blob);
          if (!text) {
            setInput("");
            return;
          }
          setInput(text);
          const cmd = matchVoiceCommand(text);
          if (cmd) {
            await pcControl(settings.endpoints.pcControl, cmd);
            const ack = `Done. ${prettyCmd(cmd)}.`;
            setMessages((m) => [
              ...m,
              { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() },
              { id: crypto.randomUUID(), role: "assistant", content: ack, ts: Date.now() },
            ]);
            setInput("");
            if (!muted) void speak(ack);
            return;
          }
          await send(text);
        } catch {
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠ Could not reach Whisper at ${settings.endpoints.whisper}/transcribe.`,
              ts: Date.now(),
            },
          ]);
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      setRecording(true);
      setOrbState("listening");
    } catch {
      setRecording(false);
      setOrbState("idle");
    }
  }

  return (
    <div className="min-h-screen flex flex-col scanlines">
      <TopBar user={user} now={now} assistant={assistant} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-4 p-4">
        {/* Left sidebar */}
        <aside className="space-y-3">
          <Panel title="QUICK ACTIONS">
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.cmd}
                  onClick={() => pcControl(settings.endpoints.pcControl, a.cmd)}
                  className="text-xs py-3 px-2 rounded-md border border-border hover:border-[color:var(--color-cyan-glow)]/60 hover:bg-[color:var(--color-cyan-glow)]/10 transition flex flex-col items-center gap-1"
                >
                  <span className="text-xl">{a.icon}</span>
                  <span className="tracking-wide">{a.label}</span>
                </button>
              ))}
            </div>
          </Panel>
          <button
            onClick={() => planMyDay(false)}
            className="w-full text-xs tracking-widest py-2 rounded-md bg-[color:var(--color-cyan-glow)] text-black hover:brightness-110 font-display"
          >
            📅 PLAN MY DAY
          </button>
          <Panel title="STATUS">
            <ul className="text-xs space-y-1.5">
              <StatusDot ok={online} label={online ? "Online" : "Offline"} />
              <StatusDot ok={status.backend} label={`${assistant} bridge`} />
              <StatusDot ok={status.ollama} label="Ollama brain" />
              <StatusDot ok={status.memory} label="Memory service" />
              <StatusDot ok={status.whisper} label="Whisper voice" />
              <StatusDot ok={status.piper} label="Piper TTS" />
              <StatusDot ok={status.pcControl} label="PC control" />
            </ul>
          </Panel>
          <Link
            to="/settings"
            className="block text-center text-xs tracking-widest py-2 border border-border rounded-md hover:border-[color:var(--color-cyan-glow)]/60 hover:text-[color:var(--color-cyan-glow)] transition"
          >
            ⚙ SETTINGS
          </Link>
          <Link
            to="/memory"
            className="block text-center text-xs tracking-widest py-2 border border-border rounded-md hover:border-[color:var(--color-cyan-glow)]/60 hover:text-[color:var(--color-cyan-glow)] transition"
          >
            🧠 MEMORY BROWSER
          </Link>
        </aside>

        {/* Center */}
        <main className="flex flex-col min-h-0">
          <div className="flex flex-col items-center py-4">
            <Orb state={orbState} size={200} />
            <div className="mt-3 text-xs tracking-[0.4em] text-[color:var(--color-cyan-glow)]/80 uppercase">
              {recording
                ? "● Recording…"
                : transcribing
                  ? "Transcribing…"
                  : searching
                    ? "🌐 Searching the web…"
                    : !online
                      ? "📡 Offline — using local knowledge"
                      : orbState === "thinking"
                        ? "Processing…"
                        : orbState === "speaking"
                          ? "Speaking…"
                          : "Ready"}
            </div>
          </div>

          <Panel className="flex-1 flex flex-col min-h-0" title="CONVERSATION">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} userName={user.name} userPhoto={user.photo} assistant={assistant} />
              ))}
              {thinking && <TypingBubble assistant={assistant} />}
            </div>
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={() => send(input)}
              muted={muted}
              onToggleMute={() => {
                setMuted((v) => !v);
                setSettings((s) => ({ ...s, autoSpeak: muted }));
              }}
              onMic={handleMic}
              recording={recording}
              transcribing={transcribing}
            />
          </Panel>
        </main>

        {/* Right sidebar */}
        <aside className="space-y-3">
          <CalendarWidget connected={!!settings.googleToken} events={events} />
          <EmailWidget connected={!!settings.googleToken} messages={unread} />
        </aside>
      </div>
    </div>
  );
}

function TopBar({ user, now, assistant }: { user: UserProfile; now: Date; assistant: string }) {
  return (
    <header className="glass border-b border-[color:var(--color-cyan-glow)]/20 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="font-display text-2xl font-bold glow-text tracking-[0.3em]">{assistant.toUpperCase()}</div>
        <div className="hidden md:block text-xs tracking-widest text-muted-foreground">
          IRON • HEART • PROTOCOL
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="font-display text-lg leading-none">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </div>
        {user.photo ? (
          <img
            src={user.photo}
            alt={user.name}
            className="w-10 h-10 rounded-full border border-[color:var(--color-cyan-glow)]/60 object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full glass border border-[color:var(--color-cyan-glow)]/60 flex items-center justify-center font-display text-sm">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    </header>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass hud-corners rounded-xl p-4 ${className}`}>
      {title && (
        <div className="text-[10px] tracking-[0.3em] text-[color:var(--color-cyan-glow)]/80 mb-3 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[color:var(--color-cyan-glow)]" />
          {title}
        </div>
      )}
      {children}
    </section>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-500/70"}`} />
      <span className={ok ? "text-foreground/80" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

function MessageBubble({
  m,
  userName,
  userPhoto,
  assistant,
}: {
  m: ChatMessage;
  userName: string;
  userPhoto?: string;
  assistant: string;
}) {
  const isUser = m.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} animate-fade-up`}>
      <div className="shrink-0">
        {isUser ? (
          userPhoto ? (
            <img src={userPhoto} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full glass border border-border flex items-center justify-center text-xs font-display">
              {userName.slice(0, 1).toUpperCase()}
            </div>
          )
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#b3f0ff] to-[#0066aa] shadow-[0_0_10px_#00d4ff] flex items-center justify-center text-[10px] font-display font-bold text-black">
            {assistant.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[color:var(--color-cyan-glow)]/15 border border-[color:var(--color-cyan-glow)]/30"
            : "bg-black/30 border border-border"
        }`}
      >
        <div className="whitespace-pre-wrap">{m.content || <span className="cursor-blink" />}</div>
        {m.meta?.sources && m.meta.sources.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {m.meta.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block text-[11px] text-[color:var(--color-cyan-glow)]/90 hover:underline truncate"
              >
                🔗 {s.title || s.url}
              </a>
            ))}
          </div>
        )}
        {m.meta?.searched && !m.meta?.sources?.length && (
          <div className="text-[10px] text-[color:var(--color-cyan-glow)]/70 mt-1">🌐 web-augmented</div>
        )}
        {m.meta?.offline && (
          <div className="text-[10px] text-amber-400/80 mt-1">offline · answering from memory</div>
        )}
      </div>
    </div>
  );
}

function TypingBubble({ assistant }: { assistant: string }) {
  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#b3f0ff] to-[#0066aa] shadow-[0_0_10px_#00d4ff] flex items-center justify-center text-[10px] font-display font-bold text-black shrink-0">
        {assistant.slice(0, 1).toUpperCase()}
      </div>
      <div className="bg-black/30 border border-border rounded-2xl px-4 py-3 text-sm flex items-center gap-1">
        <Dot d={0} />
        <Dot d={150} />
        <Dot d={300} />
      </div>
    </div>
  );
}

function Dot({ d }: { d: number }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-cyan-glow)] inline-block animate-bounce"
      style={{ animationDelay: `${d}ms` }}
    />
  );
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  muted,
  onToggleMute,
  onMic,
  recording,
  transcribing,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onMic: () => void;
  recording: boolean;
  transcribing: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-3 flex items-center gap-2 glass rounded-xl px-3 py-2 border border-border focus-within:border-[color:var(--color-cyan-glow)]/60"
    >
      <button
        type="button"
        onClick={onMic}
        disabled={transcribing}
        className={`w-10 h-10 rounded-lg flex items-center justify-center border transition ${
          recording
            ? "border-red-500 bg-red-500/20 text-red-100 animate-pulse shadow-[0_0_18px_#ef4444]"
            : transcribing
              ? "border-[color:var(--color-cyan-glow)]/60 bg-[color:var(--color-cyan-glow)]/10 animate-pulse"
              : "border-border hover:border-[color:var(--color-cyan-glow)]/60"
        }`}
        title={recording ? "Stop recording" : transcribing ? "Transcribing…" : "Start recording"}
      >
        {recording ? "■" : transcribing ? "…" : "🎙"}
      </button>
      {transcribing && (
        <span className="text-[10px] tracking-widest uppercase text-[color:var(--color-cyan-glow)]/80 animate-pulse">
          Transcribing…
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Speak or type…"
        className="flex-1 bg-transparent outline-none text-sm py-2"
      />
      <button
        type="button"
        onClick={onToggleMute}
        className="w-10 h-10 rounded-lg flex items-center justify-center border border-border hover:border-[color:var(--color-cyan-glow)]/60 transition"
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button
        type="submit"
        className="px-4 h-10 rounded-lg font-display tracking-widest text-xs bg-[color:var(--color-cyan-glow)] text-black hover:brightness-110 transition"
      >
        SEND
      </button>
    </form>
  );
}

function CalendarWidget({ connected, events }: { connected: boolean; events: CalendarEvent[] }) {
  return (
    <Panel title="TODAY'S SCHEDULE">
      {!connected ? (
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Connect Google in Settings to see today's events.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">— no events today —</div>
      ) : (
        <ul className="text-xs space-y-2">
          {events.slice(0, 6).map((e) => (
            <li key={e.id} className="border-b border-border/40 pb-1.5 last:border-0">
              <div className="text-[color:var(--color-cyan-glow)]/90 font-display tracking-wide">
                {formatTime(e.start)}
              </div>
              <div className="text-foreground truncate">{e.summary}</div>
              {e.location && <div className="text-[10px] text-muted-foreground truncate">📍 {e.location}</div>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EmailWidget({ connected, messages }: { connected: boolean; messages: MailMessage[] }) {
  return (
    <Panel title="INBOX">
      {!connected ? (
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Connect Google in Settings to see unread mail.</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-display text-3xl text-[color:var(--color-cyan-glow)]">{messages.length}</span>
            <span className="text-[10px] tracking-widest uppercase">unread</span>
          </div>
          <ul className="text-xs space-y-1.5">
            {messages.slice(0, 5).map((m) => (
              <li key={m.id} className="border-b border-border/40 pb-1 last:border-0">
                <div className="font-display tracking-wide truncate">{m.subject}</div>
                <div className="text-[10px] text-muted-foreground truncate">{m.from}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function formatTime(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatEvents(events: CalendarEvent[]) {
  return events.map((e) => `${formatTime(e.start)} — ${e.summary}${e.location ? ` @ ${e.location}` : ""}`).join("; ");
}

function formatEmails(messages: MailMessage[]) {
  return messages.map((m) => `From ${m.from}: ${m.subject}`).join("; ");
}

function matchVoiceCommand(text: string): PcCommand | null {
  const t = text.toLowerCase();
  if (/(volume|sound).*(up|increase|louder)/.test(t)) return "volume_up";
  if (/(volume|sound).*(down|decrease|lower|quieter)/.test(t)) return "volume_down";
  if (/open (chrome|browser|firefox|edge)/.test(t)) return "open_browser";
  if (/open (file|files|explorer|finder)/.test(t)) return "open_files";
  if (/open spotify|play spotify/.test(t)) return "open_spotify";
  if (/open youtube/.test(t)) return "open_youtube";
  if (/sleep (the )?(pc|computer|system)/.test(t)) return "sleep";
  if (/shut ?down/.test(t)) return "shutdown";
  return null;
}

function prettyCmd(c: PcCommand) {
  return c.replace(/_/g, " ");
}
