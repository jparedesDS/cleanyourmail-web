from __future__ import annotations

import base64
import hashlib
import json
import re
import struct
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_RELEASE_URL = "https://github.com/jparedesDS/cleanyourmail-app/releases/latest"
WORKER_ORIGIN = "https://cleanyourmail-feedback.subtitleme.workers.dev"
SITE_URL = "https://cleanyourmail.org/"
LANGUAGES = (
    ("index.html", "English"),
    ("es.html", "Español"),
    ("de.html", "Deutsch"),
    ("fr.html", "Français"),
    ("it.html", "Italiano"),
    ("ja.html", "日本語"),
    ("ko.html", "한국어"),
    ("pt-BR.html", "Português (BR)"),
    ("zh-CN.html", "简体中文"),
    ("zh-TW.html", "繁體中文"),
)
PAGES = tuple(value for value, _label in LANGUAGES) + ("404.html",)
PAGES_WITH_JSONLD = tuple(value for value, _label in LANGUAGES)
HREFLANG_LINKS = (
    ("en", SITE_URL),
    ("es", f"{SITE_URL}es.html"),
    ("pt-BR", f"{SITE_URL}pt-BR.html"),
    ("fr", f"{SITE_URL}fr.html"),
    ("de", f"{SITE_URL}de.html"),
    ("it", f"{SITE_URL}it.html"),
    ("ja", f"{SITE_URL}ja.html"),
    ("zh-CN", f"{SITE_URL}zh-CN.html"),
    ("zh-TW", f"{SITE_URL}zh-TW.html"),
    ("ko", f"{SITE_URL}ko.html"),
    ("x-default", SITE_URL),
)
LANGUAGE_PAGES = {value for value, _label in LANGUAGES}
FEEDBACK_FORM_IDS = {
    "feedback-form",
    "feedback-kind",
    "feedback-message",
    "feedback-checklist",
    "feedback-contact",
    "feedback-website",
    "feedback-consent",
    "feedback-submit",
    "feedback-status",
}


def csp_content(text: str) -> str:
    match = re.search(r'Content-Security-Policy" content="([^"]+)"', text)
    if match is None:
        raise AssertionError("missing Content-Security-Policy meta tag")
    return match.group(1)


def csp_sources(content: str, directive: str) -> list[str]:
    for part in content.split(";"):
        tokens = part.strip().split()
        if tokens and tokens[0] == directive:
            return tokens[1:]
    raise AssertionError(f"missing {directive} directive")


def feedback_form(text: str) -> str:
    match = re.search(r'<form\b[^>]*id="feedback-form".*?</form>', text, re.S)
    if match is None:
        raise AssertionError("missing feedback form")
    return match.group(0)


def language_options(text: str) -> list[tuple[str, str, bool]]:
    match = re.search(
        r'<select class="lang-select" id="language-select"[^>]*>(.*?)</select>',
        text,
        re.S,
    )
    if match is None:
        raise AssertionError("missing language selector")
    return [
        (value, label, bool(selected))
        for value, selected, label in re.findall(
            r'<option value="([^"]+)"( selected)?>(.*?)</option>', match.group(1)
        )
    ]


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} is not a PNG")
    width, height = struct.unpack(">II", data[16:24])
    return width, height


class SiteTest(unittest.TestCase):
    def test_pages_exist(self):
        for name in PAGES:
            self.assertTrue((ROOT / name).is_file(), name)

    def test_titles_and_viewport(self):
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn("<title>", text)
                self.assertIn('name="viewport"', text)

    def test_unique_ids(self):
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            ids = re.findall(r'id="([^"]+)"', text)
            duplicates = [item for item, count in Counter(ids).items() if count > 1]
            with self.subTest(page=name):
                self.assertEqual(duplicates, [])

    def test_local_links_and_assets_resolve(self):
        for name in PAGES:
            page = ROOT / name
            text = page.read_text(encoding="utf-8")
            for attr in ("href", "src"):
                for target in re.findall(rf'{attr}="([^"]+)"', text):
                    if target.startswith(("#", "http://", "https://", "mailto:", "tel:")):
                        continue
                    target = target.split("#", 1)[0]
                    if not target:
                        continue
                    resolved = (page.parent / target).resolve()
                    with self.subTest(page=name, target=target):
                        self.assertTrue(resolved.exists())

    def test_language_switch(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertEqual(text.count('id="language-select"'), 1)
                self.assertIn('class="lang-select" id="language-select"', text)
                self.assertEqual(
                    language_options(text),
                    [
                        (value, label, value == name)
                        for value, label in LANGUAGES
                    ],
                )

    def test_feedback_section_on_every_page(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn('id="feedback"', text)
                self.assertIn(f'data-endpoint="{WORKER_ORIGIN}"', text)
                self.assertIn('class="feedback-honeypot" aria-hidden="true"', text)
                for element_id in FEEDBACK_FORM_IDS:
                    self.assertIn(f'id="{element_id}"', text)
                self.assertLess(
                    text.index('id="feedback"'),
                    text.index('class="cta"'),
                    "the feedback section must come before the CTA",
                )

    def test_feedback_csp_allows_only_the_worker(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                content = csp_content(text)
                self.assertEqual(csp_sources(content, "connect-src"), [WORKER_ORIGIN])
                self.assertIn("form-action 'none'", content)

    def test_feedback_nav_and_footer(self):
        english = (ROOT / "index.html").read_text(encoding="utf-8")
        spanish = (ROOT / "es.html").read_text(encoding="utf-8")
        self.assertIn('<a href="#feedback">Feedback</a>', english)
        self.assertIn('<a href="#feedback">Comentarios</a>', spanish)
        self.assertIn(
            "No cookies. No analytics. Feedback is sent only when you submit the form.",
            english,
        )
        self.assertIn(
            "Sin cookies. Sin analítica. El feedback solo se envía al enviar el formulario.",
            spanish,
        )

    def test_feedback_consent_copy(self):
        english = (ROOT / "index.html").read_text(encoding="utf-8")
        spanish = (ROOT / "es.html").read_text(encoding="utf-8")
        self.assertIn("I agree to send this message to the CleanYourMail Discord.", english)
        self.assertIn("Acepto enviar este mensaje al Discord de CleanYourMail.", spanish)
        for text, words in (
            (english, ("Improvement", "Bug", "Send feedback")),
            (spanish, ("Mejora", "Error", "Enviar feedback")),
        ):
            for word in words:
                with self.subTest(word=word):
                    self.assertIn(word, text)

    def test_feedback_field_ids_match_across_languages(self):
        english = feedback_form((ROOT / "index.html").read_text(encoding="utf-8"))
        english_ids = set(re.findall(r'id="([^"]+)"', english))
        self.assertEqual(english_ids, FEEDBACK_FORM_IDS)
        for name, _label in LANGUAGES:
            if name == "index.html":
                continue
            form = feedback_form((ROOT / name).read_text(encoding="utf-8"))
            with self.subTest(page=name):
                self.assertEqual(set(re.findall(r'id="([^"]+)"', form)), english_ids)

    def test_feedback_form_limits_and_opt_in(self):
        for name, _label in LANGUAGES:
            form = feedback_form((ROOT / name).read_text(encoding="utf-8"))
            with self.subTest(page=name):
                self.assertIn('type="checkbox"', form)
                self.assertIn('type="submit"', form)
                self.assertIn('maxlength="2800"', form)
                self.assertIn('maxlength="2500"', form)
                self.assertIn("2800", form)
                self.assertIn("2500", form)
                self.assertIn('name="website"', form)
                self.assertIn('name="consent"', form)

    def test_feedback_noscript_notice(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn("<noscript>", text)
                self.assertIn("JavaScript", text)

    def test_feedback_client_maps_worker_errors(self):
        js = (ROOT / "app.js").read_text(encoding="utf-8")
        for marker in (
            "dataset.endpoint",
            "application/json",
            '"web"',
            "Sending...",
            "Sent. Thanks for helping.",
            "Enviando...",
            "Enviado. Gracias por ayudar.",
            "429",
            "503",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, js)

    def test_no_analytics_or_tracking(self):
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8").lower()
            with self.subTest(page=name):
                for marker in ("google-analytics", "googletagmanager", "plausible.io",
                               "matomo", "hotjar", "segment.com"):
                    self.assertNotIn(marker, text)

    def test_start_routes_and_skill_link(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn('id="start"', text)
                self.assertIn('id="why"', text)
                self.assertIn("SKILL.md", text)
                self.assertIn("cleanyourmail-app", text)
                self.assertIn("https://github.com/jparedesDS/cleanyourmail", text)
                self.assertIn("docs/VALIDATION.md", text)
                self.assertEqual(text.count("<details>"), 6)
                self.assertIn('id="i-github"', text)
                self.assertIn('href="#i-github"', text)

                for value in re.findall(r'data-copy="([^"]*)"', text):
                    self.assertNotIn("apply", value)
                    self.assertIn("https://github.com/jparedesDS/cleanyourmail", value)

    def test_app_download_points_at_the_release(self):
        expectations = {
            "index.html": {
                "cta": "Download for Windows",
                "note": "Windows 10/11 · installer · early MVP",
                "outlook": (
                    "Microsoft 365 sign-in requires tenant admin consent; "
                    "personal Outlook.com requires a verified publisher (pending)"
                ),
                "stale": ("installer coming", "runs locally from source"),
            },
            "es.html": {
                "cta": "Descargar para Windows",
                "note": "Windows 10/11 · instalador · MVP temprano",
                "outlook": (
                    "el inicio de sesión de Microsoft 365 requiere consentimiento del admin del tenant; "
                    "Outlook.com personal requiere verified publisher (pendiente)"
                ),
                "stale": ("instalador próximamente", "se ejecuta desde el código"),
            },
        }
        for name, expected in expectations.items():
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                # Hero, app card, closing CTA and footer all point at the release page.
                self.assertEqual(text.count(f'href="{APP_RELEASE_URL}"'), 4)
                self.assertNotIn('href="https://github.com/jparedesDS/cleanyourmail-app"', text)
                self.assertIn(expected["cta"], text)
                self.assertIn(f'<p class="start-note">{expected["note"]}</p>', text)
                self.assertIn(expected["outlook"], text)
                for marker in expected["stale"]:
                    self.assertNotIn(marker, text)

                block = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
                self.assertIsNotNone(block)
                payload = json.loads(block.group(1))
                self.assertEqual(payload["downloadUrl"], APP_RELEASE_URL)
                # The schema describes the skill/CLI, so its version and Python requirement stay.
                self.assertEqual(payload["softwareVersion"], "1.2.2")
                self.assertEqual(payload["operatingSystem"], "Windows, macOS, Linux")
                self.assertEqual(payload["softwareRequirements"], "Python 3.11+")

        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertEqual(text.count(f'href="{APP_RELEASE_URL}"'), 4)
                self.assertNotIn('href="https://github.com/jparedesDS/cleanyourmail-app"', text)
                block = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
                self.assertIsNotNone(block)
                payload = json.loads(block.group(1))
                self.assertEqual(payload["downloadUrl"], APP_RELEASE_URL)
                self.assertEqual(payload["softwareVersion"], "1.2.2")

    def test_cleanyourphone_nav_link(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn(
                    'href="https://jparedesds.github.io/cleanyourphone-web"',
                    text,
                )
                self.assertIn(
                    'CleanYour<span class="phone-accent">Phone</span>',
                    text,
                )

    def test_provider_logos_are_png(self):
        for name, _label in LANGUAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                for provider in ("gmail", "outlook", "yahoo", "icloud", "fastmail", "proton"):
                    self.assertIn(f"assets/providers/{provider}.png", text)
                    self.assertTrue((ROOT / "assets" / "providers" / f"{provider}.png").is_file())
                self.assertIn('class="provider-strip"', text)
                self.assertIn('class="provider-strip-track"', text)
                self.assertGreaterEqual(text.count('class="provider-strip-item"'), 12)

    def test_no_unrelated_project_reference(self):
        """The site must not claim an unrelated project as its inspiration."""
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8").lower()
            with self.subTest(page=name):
                self.assertNotIn("cleanyour.tv", text)

    def test_no_todo_markers(self):
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertNotIn("TODO", text)
                self.assertNotIn("FIXME", text)

    def test_no_inline_styles(self):
        """The CSP allows style-src 'self', so inline style attributes must not be used."""
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertNotIn("style=", text)

    def test_csp_hash_matches_json_ld(self):
        for name in PAGES_WITH_JSONLD:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                block = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
                self.assertIsNotNone(block)
                payload = block.group(1)
                json.loads(payload)
                digest = base64.b64encode(hashlib.sha256(payload.encode("utf-8")).digest()).decode()
                csp = re.search(r'Content-Security-Policy" content="([^"]+)"', text)
                self.assertIsNotNone(csp)
                self.assertIn(f"'sha256-{digest}'", csp.group(1))

    def test_no_third_party_requests(self):
        """The landing page must not load external scripts, styles, fonts or images."""
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8")
            for target in re.findall(r'src="([^"]+)"', text):
                with self.subTest(page=name, src=target):
                    self.assertFalse(target.startswith("http"), target)
            for tag in re.findall(r"<link\b[^>]*>", text):
                if 'rel="stylesheet"' in tag or 'rel="icon"' in tag:
                    href = re.search(r'href="([^"]+)"', tag)
                    if href:
                        with self.subTest(page=name, link=href.group(1)):
                            self.assertFalse(href.group(1).startswith("http"), href.group(1))

        css = (ROOT / "styles.css").read_text(encoding="utf-8").lower()
        self.assertNotIn("@import", css)
        self.assertNotIn("url(http", css)

        js = (ROOT / "app.js").read_text(encoding="utf-8").lower()
        for marker in ("xmlhttprequest", "websocket", "sendbeacon"):
            self.assertNotIn(marker, js)
        # The only network call is the explicit feedback POST. The endpoint is
        # read from the form, so app.js carries no hardcoded remote URL.
        self.assertEqual(js.count("fetch("), 1)
        self.assertNotIn("http://", js)
        self.assertNotIn("https://", js)

    def test_canonical_and_alternates(self):
        for name, _label in LANGUAGES:
            canonical = SITE_URL if name == "index.html" else f"{SITE_URL}{name}"
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn(f'<link rel="canonical" href="{canonical}">', text)
                self.assertEqual(
                    re.findall(
                        r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">',
                        text,
                    ),
                    list(HREFLANG_LINKS),
                )

    def test_sitemap_lists_ten_pages(self):
        text = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        self.assertEqual(text.count("<url>"), 10)
        for name, _label in LANGUAGES:
            loc = SITE_URL if name == "index.html" else f"{SITE_URL}{name}"
            with self.subTest(page=name):
                self.assertIn(f"<loc>{loc}</loc>", text)

    def test_social_metadata(self):
        for name in PAGES_WITH_JSONLD:
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertEqual(text.count('name="twitter:card"'), 1)
                self.assertIn('property="og:image"', text)
                self.assertIn('property="og:image:width" content="1280"', text)
                self.assertIn('property="og:image:height" content="640"', text)
                self.assertIn('name="description"', text)

    def test_brand_assets(self):
        self.assertEqual(png_size(ROOT / "assets" / "og.png"), (1280, 640))
        self.assertEqual(png_size(ROOT / "assets" / "banner.png"), (1600, 440))
        for name in ("banner-web.png", "banner-skill.png", "banner-light.png",
                     "social-web.png", "social-skill.png"):
            with self.subTest(asset=name):
                self.assertTrue((ROOT / "assets" / "brand" / name).is_file())

    def test_security_txt(self):
        security = (ROOT / ".well-known" / "security.txt").read_text(encoding="utf-8")
        self.assertIn("Contact:", security)
        self.assertIn("Expires:", security)
        self.assertIn("Canonical:", security)


if __name__ == "__main__":
    unittest.main()
