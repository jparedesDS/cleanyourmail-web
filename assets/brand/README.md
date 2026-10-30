# Brand assets

The October 2026 refresh uses a single, large wordmark lockup: the envelope mark, a white
“CleanYour” + lime “Mail”, the tagline and one supporting line. The product screenshot is reserved
for the 1280×640 social previews.

| File | Direction | Use |
|---|---|---|
| `banner-web.png` | Dark editorial, 1600×440 | Website and web-repository README. |
| `banner-skill.png` | Same lockup, skill-specific supporting line | Skill-repository README. |
| `banner-light.png` | Light “paper” alternate | Optional light-context banner. |
| `social-web.png` | 1280×640, inbox UI on the right | Website Open Graph / GitHub social preview. |
| `social-skill.png` | 1280×640, terminal UI on the right | Skill-repository social preview. |

Final site assets are `../banner.png` (1600×440) and `../og.png` (1280×640). The banners were rendered
locally with Pillow and the Outfit typeface (SIL Open Font License); the site itself has no build step,
no external fonts and no image dependency.
