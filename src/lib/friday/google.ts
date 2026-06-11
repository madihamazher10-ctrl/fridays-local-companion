// Google Identity Services (GIS) wrapper for browser-only OAuth implicit flow.
// Used to fetch the user's Calendar events and unread Gmail.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
let gsiLoading: Promise<void> | null = null;

export function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoading) return gsiLoading;
  gsiLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
  return gsiLoading;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function googleSignIn(
  clientId: string,
): Promise<{ token: string; expiresAt: number }> {
  if (!clientId) throw new Error("Missing Google OAuth Client ID");
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "Google sign-in failed"));
          return;
        }
        resolve({
          token: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        });
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export async function googleFetchProfile(token: string) {
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("Failed to fetch Google profile");
  return (await r.json()) as { name: string; email: string; picture?: string };
}

export type CalendarEvent = {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  location?: string;
  htmlLink?: string;
};

export async function googleCalendarToday(token: string): Promise<CalendarEvent[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
    `?timeMin=${encodeURIComponent(start.toISOString())}` +
    `&timeMax=${encodeURIComponent(end.toISOString())}` +
    "&singleEvents=true&orderBy=startTime&maxResults=25";
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("Calendar fetch failed");
  const j = await r.json();
  return ((j.items ?? []) as Array<Record<string, unknown>>).map((e) => ({
    id: String(e.id),
    summary: String(e.summary ?? "(no title)"),
    start: ((e.start as { dateTime?: string; date?: string }) ?? {}).dateTime ?? ((e.start as { date?: string }) ?? {}).date,
    end: ((e.end as { dateTime?: string; date?: string }) ?? {}).dateTime ?? ((e.end as { date?: string }) ?? {}).date,
    location: e.location ? String(e.location) : undefined,
    htmlLink: e.htmlLink ? String(e.htmlLink) : undefined,
  }));
}

export type MailMessage = { id: string; subject: string; from: string; snippet: string };

export async function gmailUnread(token: string, max = 5): Promise<MailMessage[]> {
  const list = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=${max}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!list.ok) throw new Error("Gmail list failed");
  const lj = await list.json();
  const ids = ((lj.messages ?? []) as Array<{ id: string }>).map((m) => m.id);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) return null;
      const m = await r.json();
      const headers = (m.payload?.headers ?? []) as Array<{ name: string; value: string }>;
      const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      return {
        id,
        subject: get("Subject") || "(no subject)",
        from: get("From"),
        snippet: String(m.snippet ?? ""),
      } as MailMessage;
    }),
  );
  return messages.filter(Boolean) as MailMessage[];
}
