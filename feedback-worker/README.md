# CleanYourMail feedback Worker

A small Cloudflare Worker that accepts a JSON feedback or bug report from the CleanYourMail website
and posts it to a private Discord channel. The Discord webhook URL is stored as a Worker secret; it is
never shipped in the website, the app or this repository.

Deployed at: <https://cleanyourmail-feedback.subtitleme.workers.dev>

## What it receives

```json
{
  "kind": "feedback",
  "message": "The review screen could explain ...",
  "checklist": "Platform: Windows\nBrowser: Chrome 120\nVersion: 0.4.0",
  "contact": "optional email or GitHub handle",
  "app_version": "CleanYourMail app 0.4.0",
  "website": ""
}
```

- `kind` is `feedback` or `bug`.
- `message` or `checklist` is required.
- `website` is a honeypot and must stay empty. It is hidden in the website form and is never shown to
  real visitors.
- Unknown kinds are rejected with `400`.

The Worker does **not** store or log the request body. It hashes the Cloudflare client IP together
with the `IP_SALT` secret and keeps only a five-minute rate-limit flag in KV. That flag is written
only after Discord accepts the report. The message itself is only forwarded to Discord.

## Limits

Request-level cap:

- A raw JSON body above 16 KiB is rejected with `413`.

Per-field input caps (longer values are trimmed with `…`, not rejected):

- `message`: 4000 characters
- `checklist`: 6000 characters
- `contact`: 200 characters
- `app_version`: 80 characters

Delivered to Discord:

- `message` is capped at 2800 characters.
- The checklist is clamped to the room left in a 5800-character embed-text budget, after the
  message, titles, field names/values and code-block wrappers. Discord's aggregate limit is 6000
  characters, so the margin keeps a maximum-sized report deliverable instead of rejected.
- `contact` and `app_version` are delivered within their 200/80 input caps.

Client code must never add serial numbers, IP addresses, IMEI, MAC addresses, email message IDs or
similar identifiers to the checklist. `contact` is optional and voluntary.

## Discord

1. Open the Discord server and the channel that should receive feedback.
2. **Channel settings → Integrations → Webhooks → New Webhook**.
3. Name it `CleanYourMail`, copy the **Webhook URL** and keep it private.

Do not put that URL in the website, the app, this repository or a chat message. Anyone with the URL
can post to the channel.

The Worker posts a message with:

- username `CleanYourMail`;
- title `New feedback` (colour `#F4A261`) or `New bug report` (colour `#E76F51`);
- fields for kind, app version and optional contact;
- a separate `Checklist` code block when a checklist is sent;
- mentions disabled (`allowed_mentions: { parse: [] }`) and user-supplied code fences neutralised.

## Cloudflare dashboard

1. Go to **Workers & Pages → Create application → Create Worker**.
2. Name it `cleanyourmail-feedback` and deploy the starter.
3. Open **Edit code**, replace everything with the contents of `worker.js`, and deploy.
4. Go to **Storage & Databases → KV → Create namespace**. Name it `FEEDBACK_KV`.
5. Open the Worker → **Settings → Bindings → Add → KV namespace**:
   - Variable name: `FEEDBACK_KV`
   - KV namespace: `FEEDBACK_KV`
6. In **Settings → Variables and Secrets** add:
   - Secret `DISCORD_WEBHOOK_URL`: the Discord webhook from above.
   - Secret `IP_SALT`: a long random string. Generate one with a password manager.
   - Variable `ALLOWED_ORIGIN`: `https://jparedesds.github.io`
7. Deploy again and copy the public URL.

The URL is public and can be shared. The webhook and `IP_SALT` are secrets.

## Wrangler CLI

```powershell
cd feedback-worker
npm install
npx wrangler login
npx wrangler kv namespace create FEEDBACK_KV
# Put the returned id in wrangler.toml under [[kv_namespaces]].
npx wrangler secret put IP_SALT
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler deploy
```

`ALLOWED_ORIGIN` lives in `wrangler.toml` under `[vars]`:

```toml
[vars]
ALLOWED_ORIGIN = "https://jparedesds.github.io"
```

Setting `DISCORD_WEBHOOK_URL` is a manual step for the maintainer, done once the channel exists.
Until then the Worker answers `503 feedback is not configured` and does not contact Discord. Do not
commit the webhook or the salt, and do not set `DISCORD_WEBHOOK_URL` in scripts or CI logs.

## Test

```powershell
npm test
```

After deploying, run this from PowerShell. It exercises CORS, validation and honeypot handling
without needing the webhook to be configured:

```powershell
$url = "https://cleanyourmail-feedback.subtitleme.workers.dev"

# CORS preflight: expect 204 and the allowed origin.
$options = Invoke-WebRequest -Method Options -Uri $url `
  -Headers @{ Origin = "https://jparedesds.github.io" }
$options.StatusCode
$options.Headers["Access-Control-Allow-Origin"]

# Honeypot: expect { ok: true } and no Discord post.
$body = @{
  kind = "feedback"
  message = "Test from the CleanYourMail setup"
  checklist = "Platform: test`nVersion: test"
  website = "bot"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body $body
```

To send a real message, set `website` to `""` after the maintainer has configured the webhook. The
message should appear in Discord. Sending twice within five minutes from the same IP returns `429`
after the first report was accepted by Discord; a failed delivery does not start the window.

## Security notes

- Only `POST` with `Content-Type: application/json` is accepted. Optional parameters such as
  `application/json; charset=utf-8` are allowed; `application/jsonp` is not.
- Other methods return `405` with `Allow: POST, OPTIONS`.
- The raw body is capped at 16 KiB and rejected with `413` above that.
- `message` accepts up to 4000 characters and `checklist` up to 6000, but delivery is bounded to
  2800 characters for the message and the leftover of a 5800-character embed budget for the
  checklist. `contact` and `app_version` are delivered within their 200/80 input caps.
- Discord mentions are disabled and user-supplied code fences are neutralised.
- Rate limiting is per salted-hashed IP for five minutes, stored in KV. The raw IP and salt are
  never stored. The KV key is written only after Discord accepts the report, so a Discord `502`
  never consumes the window.
- The limiter is non-atomic and KV is eventually consistent: two concurrent requests from the same
  IP can both pass the read before either writes the key. This is deliberate best-effort abuse
  protection, not an exact quota.
- If `FEEDBACK_KV` or `IP_SALT` is missing, the Worker fails closed with `503
  rate limiter unavailable` instead of silently skipping the limit. There is no public salt
  fallback.
- The Worker never logs or persists the message; only the KV rate-limit flag is written.
- CORS allows only `ALLOWED_ORIGIN`. Requests with another `Origin` get no
  `Access-Control-Allow-Origin`, so browsers cannot read the response.
- Requests without an `Origin` header (for example a desktop app) are not blocked by CORS; the
  endpoint is public, so the honeypot, size caps and rate limit are the protections against abuse.
- `node_modules/`, `.wrangler/` and `.dev.vars` are ignored by git.
