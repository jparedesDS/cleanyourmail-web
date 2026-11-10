const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE = 4000;
const MAX_CHECKLIST = 6000;
const MAX_CONTACT = 200;
const MAX_APP_VERSION = 80;
const DEFAULT_ORIGIN = "https://jparedesds.github.io";
const KINDS = new Set(["feedback", "bug"]);
const RATE_LIMIT_SECONDS = 300;

const COLORS = {
  feedback: 0xf4a261,
  bug: 0xe76f51,
};

const TITLES = {
  feedback: "New feedback",
  bug: "New bug report",
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value, limit) {
  const cleaned = text(value);
  return cleaned.length > limit ? cleaned.slice(0, limit - 1) + "…" : cleaned;
}

function neutralizeFences(value) {
  return value.replace(/```/g, "'''");
}

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

async function rateLimitKey(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const salt = env.IP_SALT || "cleanyourmail-feedback";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${ip}`),
  );
  return (
    "rate:" +
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function isRateLimited(request, env) {
  if (!env.FEEDBACK_KV) {
    return false;
  }
  const key = await rateLimitKey(request, env);
  if (await env.FEEDBACK_KV.get(key)) {
    return true;
  }
  await env.FEEDBACK_KV.put(key, "1", {
    expirationTtl: RATE_LIMIT_SECONDS,
  });
  return false;
}

function splitText(value, size) {
  const chunks = [];
  let rest = value;
  while (rest.length > size && chunks.length < 2) {
    chunks.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  if (rest) {
    chunks.push(rest);
  }
  return chunks;
}

function buildDiscordPayload({ kind, message, checklist, contact, appVersion }) {
  const fields = [{ name: "Kind", value: kind, inline: true }];
  if (appVersion) {
    fields.push({ name: "App", value: appVersion, inline: true });
  }
  if (contact) {
    fields.push({ name: "Contact", value: contact, inline: true });
  }

  const embeds = [];
  embeds.push({
    title: TITLES[kind] ?? "New feedback",
    description: message
      ? clamp(neutralizeFences(message), 3500)
      : "No message provided.",
    color: COLORS[kind] ?? COLORS.feedback,
    fields,
    timestamp: new Date().toISOString(),
  });

  if (checklist) {
    splitText(checklist, 3400).forEach((chunk, index) => {
      embeds.push({
        title: index === 0 ? "Checklist" : "Checklist (continued)",
        description: "```\n" + neutralizeFences(chunk) + "\n```",
        color: 0x121316,
      });
    });
  }

  return {
    username: "CleanYourMail",
    allowed_mentions: { parse: [] },
    embeds: embeds.slice(0, 4),
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method not allowed" }, 405, cors);
    }
    if (
      !(request.headers.get("content-type") || "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return json({ ok: false, error: "JSON body required" }, 415, cors);
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload too large" }, 413, cors);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid JSON" }, 400, cors);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json({ ok: false, error: "invalid payload" }, 400, cors);
    }

    // Honeypot: a real person never fills this hidden field.
    if (text(data.website)) {
      return json({ ok: true }, 200, cors);
    }

    const kind = text(data.kind).toLowerCase();
    if (!KINDS.has(kind)) {
      return json({ ok: false, error: "invalid kind" }, 400, cors);
    }

    const message = clamp(data.message, MAX_MESSAGE);
    const checklist = clamp(data.checklist, MAX_CHECKLIST);
    const contact = clamp(data.contact, MAX_CONTACT);
    const appVersion = clamp(data.app_version, MAX_APP_VERSION);
    if (!message && !checklist) {
      return json(
        { ok: false, error: "message or checklist required" },
        400,
        cors,
      );
    }

    if (!env.DISCORD_WEBHOOK_URL) {
      return json(
        { ok: false, error: "feedback is not configured" },
        503,
        cors,
      );
    }

    try {
      if (await isRateLimited(request, env)) {
        return json(
          { ok: false, error: "please wait a few minutes and try again" },
          429,
          cors,
        );
      }
    } catch {
      return json({ ok: false, error: "rate limiter unavailable" }, 503, cors);
    }

    const discordPayload = buildDiscordPayload({
      kind,
      message,
      checklist,
      contact,
      appVersion,
    });

    let response;
    try {
      response = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });
    } catch {
      return json({ ok: false, error: "could not reach Discord" }, 502, cors);
    }

    if (!response.ok) {
      return json(
        { ok: false, error: "Discord rejected the message" },
        502,
        cors,
      );
    }

    return json({ ok: true }, 200, cors);
  },
};
