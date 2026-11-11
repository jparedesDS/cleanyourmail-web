const MAX_BODY_BYTES = 16 * 1024;
// Raw input caps. The clients send at most 2800/2500 (message/checklist), so
// these wider caps never silently truncate a client payload. The delivered
// message is smaller still so the whole Discord message stays under the
// aggregate embed limit.
const MAX_MESSAGE = 4000;
const MAX_CHECKLIST = 6000;
const MAX_CONTACT = 200;
const MAX_APP_VERSION = 80;
const MAX_DELIVERED_MESSAGE = 2800;

// Discord rejects an embed set whose text totals more than 6000 characters.
// Keep a safety margin for titles, field names, the checklist wrapper and
// future Discord counting changes.
const EMBED_TEXT_BUDGET = 5800;
const CHECKLIST_CHUNK = 3400;
// Three checklist chunks max: title (9/21) + "```\n" + text + "\n```" each.
const CHECKLIST_OVERHEAD = 100;

const DEFAULT_ORIGIN = "https://cleanyourmail.org";
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

function isJsonContentType(request) {
  const [mediaType] = (request.headers.get("content-type") || "").split(";");
  return mediaType.trim().toLowerCase() === "application/json";
}

async function rateLimitKey(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${env.IP_SALT}:${ip}`),
  );
  return (
    "rate:" +
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function isRateLimited(request, env) {
  const key = await rateLimitKey(request, env);
  return Boolean(await env.FEEDBACK_KV.get(key));
}

// Called only after Discord accepted the report, so a failed delivery never
// consumes the five-minute window.
async function markRateLimited(request, env) {
  const key = await rateLimitKey(request, env);
  await env.FEEDBACK_KV.put(key, "1", {
    expirationTtl: RATE_LIMIT_SECONDS,
  });
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

// Read at most MAX_BODY_BYTES + 1. A body that overflows is cancelled instead
// of being buffered whole; the caller turns `tooLarge` into a 413.
async function readCappedBody(request) {
  if (!request.body) {
    return { tooLarge: false, text: "" };
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let value = "";

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The stream is already closed; the 413 response is unchanged.
        }
        return { tooLarge: true, text: "" };
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
    return { tooLarge: false, text: value };
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Nothing left to cancel.
    }
    return { tooLarge: true, text: "" };
  }
}

function embedTextLength(title, description, fields) {
  return (
    title.length +
    description.length +
    fields.reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}

function buildDiscordPayload({ kind, message, checklist, contact, appVersion }) {
  const fields = [{ name: "Kind", value: kind, inline: true }];
  if (appVersion) {
    fields.push({ name: "App", value: appVersion, inline: true });
  }
  if (contact) {
    fields.push({ name: "Contact", value: contact, inline: true });
  }

  const title = TITLES[kind] ?? TITLES.feedback;
  const messageDescription = message
    ? neutralizeFences(clamp(message, MAX_DELIVERED_MESSAGE))
    : "No message provided.";

  // Give the checklist only what is left after the message embed and the
  // checklist titles/wrappers, so the combined text stays under Discord's cap.
  const checklistBudget =
    EMBED_TEXT_BUDGET -
    embedTextLength(title, messageDescription, fields) -
    CHECKLIST_OVERHEAD;
  const checklistText =
    checklist && checklistBudget > 0
      ? clamp(checklist, checklistBudget)
      : "";

  const embeds = [
    {
      title,
      description: messageDescription,
      color: COLORS[kind] ?? COLORS.feedback,
      fields,
      timestamp: new Date().toISOString(),
    },
  ];

  if (checklistText) {
    splitText(checklistText, CHECKLIST_CHUNK).forEach((chunk, index) => {
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
    // The desktop app sends no Origin. A browser that is not the allowlisted
    // site is rejected before its body is read or forwarded.
    if (origin && origin !== allowedOrigin) {
      return json({ ok: false, error: "origin not allowed" }, 403, cors);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method not allowed" }, 405, {
        ...cors,
        Allow: "POST, OPTIONS",
      });
    }
    if (!isJsonContentType(request)) {
      return json({ ok: false, error: "JSON body required" }, 415, cors);
    }

    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload too large" }, 413, cors);
    }

    const body = await readCappedBody(request);
    if (body.tooLarge) {
      return json({ ok: false, error: "payload too large" }, 413, cors);
    }
    const raw = body.text;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid JSON" }, 400, cors);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json({ ok: false, error: "invalid payload" }, 400, cors);
    }

    // Honeypot: a real person never fills this hidden field. Any non-empty
    // value counts, including numbers, objects and arrays.
    const website = data.website;
    if (
      website !== undefined &&
      website !== null &&
      (typeof website !== "string" || website.trim() !== "")
    ) {
      return json({ ok: true }, 200, cors);
    }

    const kind = text(data.kind).toLowerCase();
    if (!KINDS.has(kind)) {
      return json({ ok: false, error: "invalid kind" }, 400, cors);
    }

    const message = clamp(data.message, MAX_MESSAGE);
    const checklist = clamp(data.checklist, MAX_CHECKLIST);
    const contact = neutralizeFences(clamp(data.contact, MAX_CONTACT));
    const appVersion = neutralizeFences(clamp(data.app_version, MAX_APP_VERSION));
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

    // Fail closed: without KV and a salt the limiter cannot run.
    if (!env.FEEDBACK_KV || !env.IP_SALT) {
      return json({ ok: false, error: "rate limiter unavailable" }, 503, cors);
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

    try {
      await markRateLimited(request, env);
    } catch {
      // The report was already delivered; a limiter write failure must not
      // turn a successful submission into an error.
    }

    return json({ ok: true }, 200, cors);
  },
};
