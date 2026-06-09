export type OrbState = "idle" | "listening" | "speaking" | "thinking";

export function Orb({ state = "idle", size = 240 }: { state?: OrbState; size?: number }) {
  const intensity =
    state === "speaking" ? 1.15 : state === "listening" ? 1.25 : state === "thinking" ? 1.05 : 1;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`FRIDAY ${state}`}
    >
      {/* outer rings */}
      <div
        className="absolute inset-0 rounded-full border border-[color:var(--color-cyan-glow)]/40 animate-orb-rotate"
        style={{ boxShadow: "0 0 60px 0 #00d4ff33 inset, 0 0 40px 0 #00d4ff33" }}
      />
      <div
        className="absolute inset-4 rounded-full border border-dashed border-[color:var(--color-cyan-glow)]/30 animate-orb-rotate"
        style={{ animationDirection: "reverse", animationDuration: "26s" }}
      />
      <div className="absolute inset-8 rounded-full border border-[color:var(--color-cyan-glow)]/20" />

      {/* core */}
      <div
        className="relative rounded-full animate-pulse-glow"
        style={{
          width: size * 0.55,
          height: size * 0.55,
          background:
            "radial-gradient(circle at 35% 30%, #b3f0ff 0%, #00d4ff 35%, #0066aa 70%, #001e33 100%)",
          boxShadow: `0 0 ${60 * intensity}px ${20 * intensity}px #00d4ff${state === "idle" ? "55" : "88"}, inset 0 0 40px #001e33`,
          animationDuration: state === "listening" ? "1s" : state === "speaking" ? "0.7s" : "2.4s",
        }}
      >
        <div
          className="absolute rounded-full opacity-80"
          style={{
            top: "12%",
            left: "20%",
            width: "30%",
            height: "20%",
            background: "radial-gradient(circle, #ffffff 0%, transparent 70%)",
            filter: "blur(4px)",
          }}
        />
      </div>

      {/* tick marks */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 opacity-50"
        style={{ animation: "orb-rotate 60s linear infinite" }}
      >
        {Array.from({ length: 36 }).map((_, i) => (
          <line
            key={i}
            x1="100"
            y1="6"
            x2="100"
            y2={i % 3 === 0 ? 14 : 10}
            stroke="#00d4ff"
            strokeWidth="1"
            transform={`rotate(${i * 10} 100 100)`}
          />
        ))}
      </svg>
    </div>
  );
}
