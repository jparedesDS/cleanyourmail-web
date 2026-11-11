<p align="center">
  <img src="assets/banner.png" alt="CleanYourMail — your inbox, minus the noise" width="100%">
</p>

# CleanYourMail — website

Static landing page for [CleanYourMail](https://github.com/jparedesDS/cleanyourmail), the
open-source, reversible inbox cleanup agent skill, with an optional local app and CLI.

**Live site:** <https://jparedesds.github.io/cleanyourmail-web/>  
**Spanish:** <https://jparedesds.github.io/cleanyourmail-web/es.html>

No framework, no build step, no external fonts, no analytics, no third-party requests
except the explicit feedback POST.

## What is here

- A ten-language, skill-first landing page with a “Choose your path” section: English, Spanish,
  German, French, Italian, Japanese, Korean, Brazilian Portuguese, Simplified Chinese and
  Traditional Chinese.
- The agent skill as the primary offer, the local app second, and the CLI as a small GitHub link.
- A provider grid with official full-color PNG marks and no white backing chip.
- A slim, slow provider marquee between the hero and “Choose your path”.
- A plain-language safety section: headers only, protected mail, no permanent deletion, undo.
- An opt-in feedback form in every language. Nothing leaves the browser until the person
  ticks consent and presses Send; the form posts to the `cleanyourmail-feedback` Worker,
  which forwards to a private Discord channel.
- A short FAQ, inline icons and clear calls to action.
- A strict Content Security Policy, `security.txt`, canonical URLs, hreflang alternates,
  Open Graph metadata, JSON-LD and a sitemap.
- Footer links to the app, CLI, repository, docs, security policy and discussions.

## Preview locally

```bash
python -m http.server 8080
```

Open <http://localhost:8080/>.

## Files

| Path | What it is |
|---|---|
| `index.html` | English landing page. |
| `es.html` | Spanish landing page. |
| `de.html` | German landing page. |
| `fr.html` | French landing page. |
| `it.html` | Italian landing page. |
| `ja.html` | Japanese landing page. |
| `ko.html` | Korean landing page. |
| `pt-BR.html` | Brazilian Portuguese landing page. |
| `zh-CN.html` | Simplified Chinese landing page. |
| `zh-TW.html` | Traditional Chinese landing page. |
| `styles.css` | Shared styles. |
| `app.js` | Ten-language copy/toast/feedback messages, language selector and the opt-in feedback form client. |
| `feedback-worker/` | Cloudflare Worker, Wrangler config and `node:test` suite. The Discord webhook and IP salt are Cloudflare secrets, never files in this repository. |
| `assets/logo.svg`, `assets/favicon.svg` | Brand mark. |
| `assets/banner.png` | Repository banner (1600×440). |
| `assets/og.png` | Social preview image (1280×640). |
| `assets/providers/` | Official provider marks and their source/trademark notes. |
| `assets/brand/` | Earlier banner and social-preview explorations. |
| `robots.txt`, `sitemap.xml` | Crawler metadata. |
| `.well-known/security.txt` | Security contact and policy. |
| `404.html` | Not-found page. |
| `tests/test_site.py` | Link, ID, language, CSP, metadata, icon and brand-asset checks. |
| `tests/feedback_app.test.mjs` | Node `node:test` behavior test for the feedback form (fake DOM, no jsdom). |

## Brand assets

The website uses the primary **Spectrum** direction: carbon canvas `#121316`, pastel orange
`#FFB38A` envelope, mint `#A8E6CF` return arrow, and an orange `Mail` wordmark. The primary brand
package lives in the skill repository at `brand/final-spectrum/`; the CleanYourPhone-aligned Family
palette and the Forest/Lime palette remain as alternates.

The files in `assets/brand/` are earlier Forest/Lime explorations kept for reference.

- `assets/banner.png` — current 1600×440 Spectrum repository banner.
- `assets/og.png` — current 1280×640 Spectrum social card.
- `assets/logo.svg`, `assets/favicon.svg` — current Return Fold mark.
- `assets/brand/banner-web.png` — earlier Forest/Lime website banner.
- `assets/brand/banner-skill.png` — earlier Forest/Lime skill banner.
- `assets/brand/banner-light.png` — earlier light “paper” alternate.
- `assets/brand/social-web.png`, `assets/brand/social-skill.png` — earlier 1280×640 social previews.

## Feedback Worker

`feedback-worker/` is deployed separately from the static site:

```bash
cd feedback-worker
npx wrangler deploy
```

`DISCORD_WEBHOOK_URL` and `IP_SALT` are Cloudflare secrets and are never committed,
written to a client or printed. The Worker rejects a non-allowlisted browser origin,
caps the body at 16 KiB, rate-limits by a salted IP hash for five minutes and does not
store the message. The site only needs the public Worker URL in `data-endpoint` and in
the CSP `connect-src`.

## Release sync

`softwareVersion` in `index.html` and `es.html` must match `tools/cym_version.py` in the skill
repository. When the JSON-LD block changes, recompute the CSP `sha256` hash in both pages and run the
test suite again.

## Deploy

This repository is a static site at the root. In GitHub:

1. **Settings → Pages**.
2. **Build and deployment → Source**: **Deploy from a branch**.
3. Branch: **`main`**, folder: **`/ (root)`**.
4. Save.

If the first build does not start, push any commit to `main`. The `pages build and deployment`
workflow should appear in **Actions**.

No workflow is required. If you prefer GitHub Actions, add a Pages workflow that uploads the root
directory as the artifact.

## Tests

```bash
python -m unittest discover -s tests -v
node --test feedback-worker/worker.test.mjs
node --test tests/feedback_app.test.mjs
```

The Python suite checks local links and assets, duplicate IDs, the language switch,
analytics absence, inline-style absence (CSP compatibility), the CSP hash against the
JSON-LD block, third-party requests, canonical/hreflang metadata, PNG dimensions,
unrelated-project references, the skill and app routes, provider PNGs, the provider
marquee, the GitHub icon, `security.txt` and the feedback form's ids, CSP, consent and
limits.

The Node suites need no `npm install`: the Worker suite runs against a memory KV and a
fake Discord `fetch`, and the form suite loads `app.js` in `vm` with a minimal fake DOM
to check consent, empty input, a single POST, the disabled pending button, 429/503 and
`{ok:true}` handling, and the success reset.

## Links

- Skill repository: <https://github.com/jparedesDS/cleanyourmail>
- Skill entry point: <https://github.com/jparedesDS/cleanyourmail/blob/master/SKILL.md>
- App: <https://github.com/jparedesDS/cleanyourmail-app>
- Discussions: <https://github.com/jparedesDS/cleanyourmail/discussions>
- Safety rules: <https://github.com/jparedesDS/cleanyourmail/blob/master/docs/SAFETY.md>
- Prompt: <https://github.com/jparedesDS/cleanyourmail/blob/master/PROMPT.md>
- Spanish prompt: <https://github.com/jparedesDS/cleanyourmail/blob/master/PROMPT.es.md>

## License

MIT. See [LICENSE](LICENSE).
