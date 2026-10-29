# CleanYourMail — website

Static landing page for [CleanYourMail](https://github.com/jparedesDS/clean-your-mail), the
open-source, reversible email cleanup skill.

Live site: **https://jparedesds.github.io/clean-your-mail-web/**  
Spanish: **https://jparedesds.github.io/clean-your-mail-web/es.html**

No framework, no build step, no external fonts, no analytics.

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
| `app.js` | Provider tabs, before/after toggle, copy buttons. |
| `assets/logo.svg`, `assets/favicon.svg` | Brand mark. |
| `assets/og.png` | Social preview image. |
| `assets/og.svg` | Source for the social preview. |
| `robots.txt`, `sitemap.xml` | Crawler metadata. |
| `404.html` | Not-found page. |
| `tests/test_site.py` | Link, ID, language and analytics checks. |
| `.nojekyll` | Keep GitHub Pages from running Jekyll. |

## Deploy

This repository is a static site at the root. In GitHub:

1. **Settings → Pages**.
2. **Build and deployment → Source**: **Deploy from a branch**.
3. Branch: **`main`**, folder: **`/ (root)`**.
4. Save.

No workflow is required. If you prefer GitHub Actions, add a Pages workflow that uploads the root
directory as the artifact.

## Tests

```bash
python -m unittest discover -s tests -v
```

The test checks local links, duplicate IDs, the language switch and the absence of analytics.

## Links

- Skill repository: <https://github.com/jparedesDS/clean-your-mail>
- Safety rules: <https://github.com/jparedesDS/clean-your-mail/blob/master/docs/SAFETY.md>
- Prompt: <https://github.com/jparedesDS/clean-your-mail/blob/master/PROMPT.md>
- Spanish prompt: <https://github.com/jparedesDS/clean-your-mail/blob/master/PROMPT.es.md>

## License

MIT. See [LICENSE](LICENSE).
