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
PAGES = ("index.html", "es.html", "404.html")
PAGES_WITH_JSONLD = ("index.html", "es.html")
APP_RELEASE_URL = "https://github.com/jparedesDS/cleanyourmail-app/releases/latest"


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
                    with self.subTest(page=name, target=target):
                        self.assertTrue((page.parent / target).resolve().exists())

    def test_language_switch(self):
        english = (ROOT / "index.html").read_text(encoding="utf-8")
        spanish = (ROOT / "es.html").read_text(encoding="utf-8")
        self.assertIn('href="es.html"', english)
        self.assertIn('href="index.html"', spanish)

    def test_no_analytics_or_tracking(self):
        for name in PAGES:
            text = (ROOT / name).read_text(encoding="utf-8").lower()
            with self.subTest(page=name):
                for marker in ("google-analytics", "googletagmanager", "plausible.io",
                               "matomo", "hotjar", "segment.com"):
                    self.assertNotIn(marker, text)

    def test_start_routes_and_skill_link(self):
        for name in ("index.html", "es.html"):
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

    def test_cleanyourphone_nav_link(self):
        for name in ("index.html", "es.html"):
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
        for name in ("index.html", "es.html"):
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
        for marker in ("fetch(", "xmlhttprequest", "websocket", "sendbeacon"):
            self.assertNotIn(marker, js)

    def test_canonical_and_alternates(self):
        cases = {
            "index.html": "https://jparedesds.github.io/cleanyourmail-web/",
            "es.html": "https://jparedesds.github.io/cleanyourmail-web/es.html",
        }
        for name, canonical in cases.items():
            text = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn(f'<link rel="canonical" href="{canonical}">', text)
                self.assertIn('hreflang="en"', text)
                self.assertIn('hreflang="es"', text)
                self.assertIn('hreflang="x-default"', text)

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
