import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.js";

const ORIGIN = "https://jparedesds.github.io";
const WEBHOOK = "https://discord.test/webhook";

function memoryKv() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    DISCORD_WEBHOOK_URL: WEBHOOK,
    IP_SALT: "test-salt",
    ALLOWED_ORIGIN: ORIGIN,
    FEEDBACK_KV: memoryKv(),
    ...overrides,
  };
}

function makeRequest(payload, init = {}) {
  const method = init.method ?? "POST";
  const bodyless = method === "GET" || method === "HEAD";
  return new Request("https://feedback.test/", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "CF-Connecting-IP": "192.0.2.10",
      ...(init.headers ?? {}),
    },
    body: bodyless ? undefined : (init.body ?? JSON.stringify(payload)),
  });
}

function mockDiscord(statuses = []) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    const status = statuses[calls.length - 1] ?? 204;
    return new Response(null, { status });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function aggregateEmbedText(payload) {
  return payload.embeds.reduce((total, embed) => {
    const fields = embed.fields ?? [];
    const fieldText = fields.reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    );
    return total + embed.title.length + embed.description.length + fieldText;
  }, 0);
}

test("options returns CORS preflight for the allowed origin", async () => {
  const response = await worker.fetch(
    makeRequest({}, { method: "OPTIONS" }),
    makeEnv(),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
});

test("an unknown origin gets no Access-Control-Allow-Origin", async () => {
  const response = await worker.fetch(
    makeRequest(
      { kind: "feedback", message: "hello" },
      { headers: { Origin: "https://evil.example" } },
    ),
    makeEnv(),
  );
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("valid feedback reaches Discord without exposing the webhook", async () => {
  const discord = mockDiscord();
  try {
    const response = await worker.fetch(
      makeRequest({
        kind: "feedback",
        message: "Please explain the review screen",
        checklist: "Platform: Windows\nBrowser: Chrome",
        contact: "someone@example.com",
        app_version: "CleanYourMail app 0.4.0",
        website: "",
      }),
      makeEnv(),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(discord.calls.length, 1);
    assert.equal(discord.calls[0].url, WEBHOOK);

    const payload = discord.calls[0].payload;
    assert.equal(payload.username, "CleanYourMail");
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].title, "New feedback");
    assert.equal(payload.embeds[0].color, 0xf4a261);
    assert.match(payload.embeds[0].description, /review screen/);
    assert.match(payload.embeds[1].description, /Platform: Windows/);

    const serialized = JSON.stringify(payload);
    assert.ok(!serialized.includes(WEBHOOK), "webhook URL leaked into payload");
    assert.ok(!serialized.includes("discord.test"));
  } finally {
    discord.restore();
  }
});

test("bug reports use their own title and colour", async () => {
  const discord = mockDiscord();
  try {
    const response = await worker.fetch(
      makeRequest({
        kind: "bug",
        message: "The export button crashes",
        app_version: "CleanYourMail app 0.4.0",
      }),
      makeEnv(),
    );
    assert.equal(response.status, 200);
    const payload = discord.calls[0].payload;
    assert.equal(payload.embeds[0].title, "New bug report");
    assert.equal(payload.embeds[0].color, 0xe76f51);
  } finally {
    discord.restore();
  }
});

test("honeypot silently accepts without calling Discord", async () => {
  const discord = mockDiscord();
  try {
    const response = await worker.fetch(
      makeRequest({ kind: "feedback", message: "spam", website: "bot" }),
      makeEnv(),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(discord.calls.length, 0);
  } finally {
    discord.restore();
  }
});

test("an unknown kind is rejected", async () => {
  const response = await worker.fetch(
    makeRequest({ kind: "profile", message: "hello" }),
    makeEnv(),
  );
  assert.equal(response.status, 400);
});

test("an empty message and checklist is rejected", async () => {
  for (const payload of [
    { kind: "feedback" },
    { kind: "bug", message: "   ", checklist: "\n\t " },
  ]) {
    const response = await worker.fetch(makeRequest(payload), makeEnv());
    assert.equal(response.status, 400);
  }
});

test("only application/json with optional parameters is accepted", async () => {
  const discord = mockDiscord();
  try {
    const jsonp = await worker.fetch(
      makeRequest(
        { kind: "feedback", message: "hello" },
        { headers: { "Content-Type": "application/jsonp" } },
      ),
      makeEnv(),
    );
    assert.equal(jsonp.status, 415);

    const withCharset = await worker.fetch(
      makeRequest(
        { kind: "feedback", message: "hello" },
        { headers: { "Content-Type": "application/json; charset=utf-8" } },
      ),
      makeEnv(),
    );
    assert.equal(withCharset.status, 200);
    assert.equal(discord.calls.length, 1);
  } finally {
    discord.restore();
  }
});

test("a non-JSON content type is rejected", async () => {
  const response = await worker.fetch(
    makeRequest(null, {
      headers: { "Content-Type": "text/plain" },
      body: "kind=feedback",
    }),
    makeEnv(),
  );
  assert.equal(response.status, 415);
});

test("a body over 16 KiB is rejected with 413", async () => {
  const response = await worker.fetch(
    makeRequest(null, {
      body: JSON.stringify({
        kind: "feedback",
        message: "x".repeat(17 * 1024),
      }),
    }),
    makeEnv(),
  );
  assert.equal(response.status, 413);
});

test("missing webhook configuration returns 503", async () => {
  const response = await worker.fetch(
    makeRequest({ kind: "feedback", message: "hello" }),
    makeEnv({ DISCORD_WEBHOOK_URL: "" }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "feedback is not configured",
  });
});

test("missing KV fails closed with 503", async () => {
  const discord = mockDiscord();
  try {
    const response = await worker.fetch(
      makeRequest({ kind: "feedback", message: "hello" }),
      makeEnv({ FEEDBACK_KV: undefined }),
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "rate limiter unavailable",
    });
    assert.equal(discord.calls.length, 0);
  } finally {
    discord.restore();
  }
});

test("missing IP_SALT fails closed with 503", async () => {
  const discord = mockDiscord();
  try {
    for (const salt of [undefined, ""]) {
      const response = await worker.fetch(
        makeRequest({ kind: "feedback", message: "hello" }),
        makeEnv({ IP_SALT: salt }),
      );
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "rate limiter unavailable",
      });
    }
    assert.equal(discord.calls.length, 0);
  } finally {
    discord.restore();
  }
});

test("the same IP is rate limited for five minutes after a successful send", async () => {
  const discord = mockDiscord();
  const env = makeEnv();
  try {
    const first = await worker.fetch(
      makeRequest({ kind: "feedback", message: "one" }),
      env,
    );
    const second = await worker.fetch(
      makeRequest({ kind: "feedback", message: "two" }),
      env,
    );
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(discord.calls.length, 1);
  } finally {
    discord.restore();
  }
});

test("a Discord failure does not consume the rate-limit window", async () => {
  const discord = mockDiscord([500, 204]);
  const env = makeEnv();
  try {
    const first = await worker.fetch(
      makeRequest({ kind: "feedback", message: "one" }),
      env,
    );
    const second = await worker.fetch(
      makeRequest({ kind: "feedback", message: "two" }),
      env,
    );
    assert.equal(first.status, 502);
    assert.deepEqual(await first.json(), {
      ok: false,
      error: "Discord rejected the message",
    });
    assert.equal(second.status, 200);
    assert.equal(discord.calls.length, 2);
  } finally {
    discord.restore();
  }
});

test("a maximum-sized report stays under Discord's aggregate embed limit", async () => {
  const discord = mockDiscord();
  try {
    const response = await worker.fetch(
      makeRequest({
        kind: "feedback",
        message: "m".repeat(4000),
        checklist: "c".repeat(6000),
        contact: "c".repeat(200),
        app_version: "v".repeat(80),
      }),
      makeEnv(),
    );
    assert.equal(response.status, 200);
    assert.equal(discord.calls.length, 1);

    const payload = discord.calls[0].payload;
    const total = aggregateEmbedText(payload);
    assert.ok(
      total <= 6000,
      `aggregate embed text ${total} exceeds Discord's 6000 character limit`,
    );
    assert.ok(total <= 5800, `aggregate embed text ${total} exceeds the budget`);

    const message = payload.embeds[0].description;
    assert.equal(message.length, 2800);
    assert.ok(message.endsWith("…"), "truncated message lost its ellipsis");

    assert.ok(payload.embeds.length >= 2, "checklist was dropped");
    const checklist = payload.embeds[1].description;
    assert.match(checklist, /c{100}/);
    assert.ok(checklist.includes("…"), "truncated checklist lost its ellipsis");
    assert.ok(checklist.startsWith("```\n"));
    assert.ok(checklist.endsWith("\n```"));
  } finally {
    discord.restore();
  }
});

test("mentions are disabled and code fences are neutralised", async () => {
  const discord = mockDiscord();
  try {
    const response = await worker.fetch(
      makeRequest({
        kind: "bug",
        message: "@everyone look at this ```broken```",
        checklist: "Step 1\n```\n@here\n```\nStep 2",
      }),
      makeEnv(),
    );
    assert.equal(response.status, 200);
    const payload = discord.calls[0].payload;
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.match(payload.embeds[0].description, /@everyone/);
    assert.ok(
      !payload.embeds[0].description.includes("```"),
      "message code fences were not neutralised",
    );
    const checklistDescription = payload.embeds[1].description;
    assert.ok(checklistDescription.startsWith("```\n"));
    assert.ok(checklistDescription.endsWith("\n```"));
    assert.ok(
      !checklistDescription.slice(4, -4).includes("```"),
      "checklist code fences were not neutralised",
    );
    assert.match(checklistDescription, /@here/);
  } finally {
    discord.restore();
  }
});

test("an error from a bad origin has no CORS header", async () => {
  const response = await worker.fetch(
    makeRequest(
      { kind: "profile", message: "hello" },
      { headers: { Origin: "https://evil.example" } },
    ),
    makeEnv(),
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("a method other than POST or OPTIONS returns 405 with Allow", async () => {
  const response = await worker.fetch(
    makeRequest(null, { method: "GET" }),
    makeEnv(),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST, OPTIONS");
});

test("error responses never include the webhook URL", async () => {
  const discord = mockDiscord([500]);
  try {
    const responses = [
      await worker.fetch(
        makeRequest({ kind: "other", message: "x" }),
        makeEnv(),
      ),
      await worker.fetch(makeRequest({ kind: "feedback" }), makeEnv()),
      await worker.fetch(
        makeRequest(null, {
          headers: { "Content-Type": "text/plain" },
          body: "x",
        }),
        makeEnv(),
      ),
      await worker.fetch(
        makeRequest(null, { body: "x".repeat(17 * 1024) }),
        makeEnv(),
      ),
      await worker.fetch(
        makeRequest({ kind: "feedback", message: "x" }),
        makeEnv({ DISCORD_WEBHOOK_URL: "" }),
      ),
      await worker.fetch(
        makeRequest({ kind: "feedback", message: "x" }),
        makeEnv(),
      ),
    ];

    for (const response of responses) {
      assert.ok(response.status >= 400);
      const body = await response.text();
      assert.ok(!body.includes(WEBHOOK), "webhook URL leaked into an error body");
      assert.ok(!body.includes("discord.test"), "webhook host leaked into an error body");
    }
  } finally {
    discord.restore();
  }
});
