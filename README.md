<p align="center">
  <img src="assets/banner.png" alt="CleanYourMail — your inbox, minus the noise" width="100%">
</p>

# CleanYourMail — website

Static landing page for [CleanYourMail](https://github.com/jparedesDS/cleanyourmail), the
open-source, reversible inbox cleanup agent skill, with an optional local app and CLI.

**Live site:** <https://jparedesds.github.io/cleanyourmail-web/>  
**Spanish:** <https://jparedesds.github.io/cleanyourmail-web/es.html>

No framework, no build step, no external fonts, no analytics, no third-party requests.

## What is here

- A bilingual English/Spanish, skill-first landing page with a “Choose your path” section.
- The agent skill as the primary offer, the local app second, and the CLI as a small GitHub link.
- A provider grid with official full-color PNG marks and no white backing chip.
- A plain-language safety section: headers only, protected mail, no permanent deletion, undo.
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
| `styles.css` | Shared styles. |
| `app.js` | Copy-prompt button and toast feedback. |
| `assets/logo.svg`, `assets/favicon.svg` | Brand mark. |
| `assets/banner.png` | Repository banner (1600×440). |
| `assets/og.png` | Social preview image (1280×640). |
| `assets/providers/` | Official provider marks and their source/trademark notes. |
| `assets/brand/` | Earlier banner and social-preview explorations. |
| `robots.txt`, `sitemap.xml` | Crawler metadata. |
| `.well-known/security.txt` | Security contact and policy. |
| `404.html` | Not-found page. |
| `tests/test_site.py` | Link, ID, language, CSP, metadata, icon and brand-asset checks. |

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
```

The suite checks local links and assets, duplicate IDs, the language switch, analytics absence,
inline-style absence (CSP compatibility), the CSP hash against the JSON-LD block, third-party
requests, canonical/hreflang metadata, PNG dimensions, unrelated-project references, the skill and
app routes, provider PNGs, the GitHub icon and `security.txt`.

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
