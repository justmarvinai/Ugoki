#!/usr/bin/env python3
"""Ugoki fonts pipeline (docs/05-architecture.md §10). Run with `pnpm fonts`.

Downloads pinned SIL OFL font sources (SHA-256 verified), instances and subsets them, and writes:

  public/fonts/engine/<id>.<hash>.ttf.gz  Engine fonts (sfnt for HarfBuzz), gzip-compressed here and
                                          decompressed in the worker with DecompressionStream, so
                                          delivery never depends on the host's compression settings.
  src/fonts/<name>.woff2                  Interface fonts, loaded through next/font/local.
  public/fonts/licenses/<source>.txt      License texts that must accompany the fonts.
  src/engine/text/font-manifest.json      Engine font registry data (files, axes, metrics, credits).

OFL compliance: subsetting/instancing creates a "Modified Version". Sources that declare a Reserved
Font Name (e.g. Mona Sans reserves "Mona") are renamed in every name record except the ones that
credit the original (copyright, trademark, designer, vendor, license). The script refuses to build a
source with an RFN unless a rename is configured.

Outputs are deterministic (no timestamps), so re-running without changes produces no diff.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:  # pragma: no cover - guidance for first-time setup
    sys.exit("fontTools is missing: pip install 'fonttools[woff]==4.60.1'")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "fonts"
ENGINE_OUT = ROOT / "public" / "fonts" / "engine"
UI_OUT = ROOT / "src" / "fonts"
LICENSE_OUT = ROOT / "public" / "fonts" / "licenses"
MANIFEST = ROOT / "src" / "engine" / "text" / "font-manifest.json"

MONA = "https://raw.githubusercontent.com/github/mona-sans/v2.0.27"
# google/fonts pinned to a commit (2026-09-27), so upstream moves never change a build.
GF = "https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl"

# Pinned sources. If an upstream file changes, the hash check fails loudly — review and re-pin.
SOURCES: dict[str, dict] = {
    "mona-sans": {
        "url": f"{MONA}/fonts/variable/MonaSansVF%5Bwdth,wght,opsz,ital%5D.ttf",
        "sha256": "ade8e0e711f2798266e12f02b271aba1c345c5a38be4e98cb72d198248ccc8a7",
        "license_url": f"{MONA}/OFL.txt",
        "license_sha256": "9261dcb61fb5e3c587d50d7a9fdae12bc7422d8822d7ac06b8f34550479575de",
        "credit": "Mona Sans v2.0.27 by GitHub",
        "reserved_name": "Mona",
    },
    "mona-sans-mono": {
        "url": f"{MONA}/fonts/variable/MonaSansMonoVF%5Bwght%5D.ttf",
        "sha256": "e1d0ba93b9abf682de1bd67d20b58d312fab5d0cbe8fe012e2b1ab7687b42219",
        "license_url": f"{MONA}/OFL.txt",
        "license_sha256": "9261dcb61fb5e3c587d50d7a9fdae12bc7422d8822d7ac06b8f34550479575de",
        "credit": "Mona Sans Mono v2.0.27 by GitHub",
        "reserved_name": "Mona",
    },
    "inter": {
        "url": f"{GF}/inter/Inter%5Bopsz,wght%5D.ttf",
        "sha256": "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
        "license_url": f"{GF}/inter/OFL.txt",
        "license_sha256": "5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57",
        "credit": "Inter 4 by Rasmus Andersson and the Inter Project Authors",
        "reserved_name": None,
    },
    "instrument-serif": {
        "url": f"{GF}/instrumentserif/InstrumentSerif-Regular.ttf",
        "sha256": "498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88",
        "license_url": f"{GF}/instrumentserif/OFL.txt",
        "license_sha256": "129ed7618959716959f2941fdd5b49e0ad6e6c1d78726761786a00253d865521",
        "credit": "Instrument Serif by the Instrument Serif Project Authors",
        "reserved_name": None,
    },
    "instrument-serif-italic": {
        "url": f"{GF}/instrumentserif/InstrumentSerif-Italic.ttf",
        "sha256": "08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385",
        "license_url": f"{GF}/instrumentserif/OFL.txt",
        "license_sha256": "129ed7618959716959f2941fdd5b49e0ad6e6c1d78726761786a00253d865521",
        "credit": "Instrument Serif Italic by the Instrument Serif Project Authors",
        "reserved_name": None,
    },
    "anton": {
        "url": f"{GF}/anton/Anton-Regular.ttf",
        "sha256": "a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab",
        "license_url": f"{GF}/anton/OFL.txt",
        "license_sha256": "ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4",
        "credit": "Anton by the Anton Project Authors (Vernon Adams)",
        "reserved_name": None,
    },
    "archivo": {
        "url": f"{GF}/archivo/Archivo%5Bwdth,wght%5D.ttf",
        "sha256": "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053",
        "license_url": f"{GF}/archivo/OFL.txt",
        "license_sha256": "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b",
        "credit": "Archivo by the Archivo Project Authors (Omnibus-Type)",
        "reserved_name": None,
    },
    "anybody": {
        "url": f"{GF}/anybody/Anybody%5Bwdth,wght%5D.ttf",
        "sha256": "b184bd7e6ca8348bbaecec98951565729d7e89b7872d4898a1f9981342b5b64c",
        "license_url": f"{GF}/anybody/OFL.txt",
        "license_sha256": "7f0313b042b462fcae1934436cc747f9fd4433e3b08fd6459a4a5104b0bbd5db",
        "credit": "Anybody by the Anybody Project Authors (Etcetera Type Co)",
        "reserved_name": None,
    },
    "big-shoulders": {
        "url": f"{GF}/bigshoulders/BigShoulders%5Bopsz,wght%5D.ttf",
        "sha256": "4b4b24aa6f799aa73cdcd5b6fa840cbcbbb38b81fa9fa82c25126a4530c1ba44",
        "license_url": f"{GF}/bigshoulders/OFL.txt",
        "license_sha256": "fbc746aabf0eb1847dfd92e2efc4596d79fa897d60b8e64062a22f585508fb3f",
        "credit": "Big Shoulders by the Big Shoulders Project Authors (Patric King, XO Type)",
        "reserved_name": None,
    },
    "bricolage-grotesque": {
        "url": f"{GF}/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf",
        "sha256": "413e7357809ddd12fd80a96a8a396de0e401638d4acd3cb3e37532f0472ac682",
        "license_url": f"{GF}/bricolagegrotesque/OFL.txt",
        "license_sha256": "4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba",
        "credit": "Bricolage Grotesque by the Bricolage Grotesque Project Authors (Mathieu Triay)",
        "reserved_name": None,
    },
    "dm-serif-display": {
        "url": f"{GF}/dmserifdisplay/DMSerifDisplay-Regular.ttf",
        "sha256": "8cc3643535edf039aa5d95440a8542735e9197e4f4b8d9303e980fefbf5ab616",
        "license_url": f"{GF}/dmserifdisplay/OFL.txt",
        "license_sha256": "a3e5cdd67d4571dd0a24fcc968de0efde7ae97ef752daf0906e4767619dd7231",
        "credit": "DM Serif Display by Colophon Foundry for Google, based on Source Serif by Adobe",
        "reserved_name": "Source",
    },
    "dm-serif-display-italic": {
        "url": f"{GF}/dmserifdisplay/DMSerifDisplay-Italic.ttf",
        "sha256": "df74c0ac387baeaeb0fe4f2324e1668e6a3ed8c09cd9796fe162c71753e19e45",
        "license_url": f"{GF}/dmserifdisplay/OFL.txt",
        "license_sha256": "a3e5cdd67d4571dd0a24fcc968de0efde7ae97ef752daf0906e4767619dd7231",
        "credit": "DM Serif Display Italic by Colophon Foundry for Google, based on Source Serif by Adobe",
        "reserved_name": "Source",
    },
    "fraunces": {
        "url": f"{GF}/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf",
        "sha256": "177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb",
        "license_url": f"{GF}/fraunces/OFL.txt",
        "license_sha256": "bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b",
        "credit": "Fraunces by the Fraunces Project Authors (Undercase Type)",
        "reserved_name": None,
    },
    "fraunces-italic": {
        "url": f"{GF}/fraunces/Fraunces-Italic%5BSOFT,WONK,opsz,wght%5D.ttf",
        "sha256": "b24448c43702fac4ee856781d461a0dfba8d8e594b6e8e190234b75fed2c0e01",
        "license_url": f"{GF}/fraunces/OFL.txt",
        "license_sha256": "bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b",
        "credit": "Fraunces Italic by the Fraunces Project Authors (Undercase Type)",
        "reserved_name": None,
    },
    "hubot-sans": {
        "url": f"{GF}/hubotsans/HubotSans%5Bwdth,wght%5D.ttf",
        "sha256": "229c7682f64b499668d2f47ac803bbde0b5a63225326c8659ea436748ab29965",
        "license_url": f"{GF}/hubotsans/OFL.txt",
        "license_sha256": "9593ae8ccefcbd9f3dea9e4da74b421ea04da7f597e8e64250f6419fc6032139",
        "credit": "Hubot Sans by GitHub (the Hubot Sans Project Authors)",
        "reserved_name": "Hubot",
    },
    "instrument-sans": {
        "url": f"{GF}/instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf",
        "sha256": "b24f1812584816958afcf22e22d08e44318c5e51651e25d2438efdde389b33b1",
        "license_url": f"{GF}/instrumentsans/OFL.txt",
        "license_sha256": "9e27a72ed30eb49a08678f6a5d6ed98ec7ba5368f541637ee0683ec9134ef966",
        "credit": "Instrument Sans by the Instrument Sans Project Authors",
        "reserved_name": None,
    },
    "jetbrains-mono": {
        "url": f"{GF}/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
        "sha256": "48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda",
        "license_url": f"{GF}/jetbrainsmono/OFL.txt",
        "license_sha256": "b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d",
        "credit": "JetBrains Mono by the JetBrains Mono Project Authors",
        "reserved_name": None,
    },
    "syne": {
        "url": f"{GF}/syne/Syne%5Bwght%5D.ttf",
        "sha256": "ce5ac77142a65cab2248a1a2ebb740b1d4d9c20b52488877d3ff664d1356104a",
        "license_url": f"{GF}/syne/OFL.txt",
        "license_sha256": "cc43cdce6f91c57989af8459341c276655e34224e954fa69c2ad700831a742d8",
        "credit": "Syne by the Syne Project Authors (Bonjour Monde)",
        "reserved_name": None,
    },
    "unbounded": {
        "url": f"{GF}/unbounded/Unbounded%5Bwght%5D.ttf",
        "sha256": "323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f",
        "license_url": f"{GF}/unbounded/OFL.txt",
        "license_sha256": "31e5d4e83955e7103c34570dd49b0570ef490800bd65b42923c0dd02445263b3",
        "credit": "Unbounded by the Unbounded Project Authors (NaN)",
        "reserved_name": None,
    },
}

# Latin + Latin Extended-A (German, French, Nordic, Polish, Czech, Turkish, …), Romanian,
# punctuation, super/subscripts, currencies, letterlike symbols, arrows and UI symbols (⌘ ↵ ⇧ ●).
UNICODES = ",".join(
    [
        "U+0000-00FF",
        "U+0100-017F",
        "U+0218-021B",
        "U+02BB-02BC,U+02C6,U+02DA,U+02DC",
        "U+1E9E",
        "U+2000-206F",
        "U+2070-209F",
        "U+20A0-20BF",
        "U+2100-214F",
        "U+2190-2199,U+21B5,U+21E7",
        "U+2212,U+2215",
        "U+2303,U+2318,U+2325",
        "U+25CF,U+2713",
    ]
)

# Engine fonts: full design space except what templates never use (italics come as separate files).
ENGINE_FONTS = [
    {"id": "mona-sans", "source": "mona-sans", "limits": {"ital": 0}, "rename": "Ugoki Sans"},
    {"id": "inter", "source": "inter", "limits": {}, "rename": None},
    {"id": "instrument-serif", "source": "instrument-serif", "limits": {}, "rename": None},
    {
        "id": "instrument-serif-italic",
        "source": "instrument-serif-italic",
        "limits": {},
        "rename": None,
    },
    {"id": "anton", "source": "anton", "limits": {}, "rename": None},
    {"id": "archivo", "source": "archivo", "limits": {}, "rename": None},
    {"id": "anybody", "source": "anybody", "limits": {}, "rename": None},
    {"id": "big-shoulders", "source": "big-shoulders", "limits": {}, "rename": None},
    {"id": "bricolage-grotesque", "source": "bricolage-grotesque", "limits": {}, "rename": None},
    {"id": "dm-serif-display", "source": "dm-serif-display", "limits": {}, "rename": None},
    {"id": "dm-serif-display-italic", "source": "dm-serif-display-italic", "limits": {}, "rename": None},
    {"id": "fraunces", "source": "fraunces", "limits": {"SOFT": 100}, "rename": None},
    {"id": "fraunces-italic", "source": "fraunces-italic", "limits": {"SOFT": 100}, "rename": None},
    {"id": "hubot-sans", "source": "hubot-sans", "limits": {}, "rename": "Ugoki Tech"},
    {"id": "instrument-sans", "source": "instrument-sans", "limits": {}, "rename": None},
    {"id": "jetbrains-mono", "source": "jetbrains-mono", "limits": {}, "rename": None},
    {"id": "syne", "source": "syne", "limits": {}, "rename": None},
    {"id": "unbounded", "source": "unbounded", "limits": {}, "rename": None},
]

# Interface fonts: only the slice of the design space the UI uses (keeps first paint light).
UI_FONTS = [
    {
        "file": "ugoki-sans.woff2",
        "source": "mona-sans",
        "limits": {"ital": 0, "opsz": 0, "wght": (350, 850), "wdth": (100, 125)},
        "rename": "Ugoki Sans",
    },
    {
        "file": "ugoki-mono.woff2",
        "source": "mona-sans-mono",
        "limits": {"wght": (350, 700)},
        "rename": "Ugoki Mono",
    },
]

# Name records that credit the original design and must keep its name.
CREDIT_NAME_IDS = {0, 7, 8, 9, 11, 12, 13, 14}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, expected: str, dest: Path) -> bytes:
    if dest.exists() and sha256(dest.read_bytes()) == expected:
        return dest.read_bytes()
    print(f"  downloading {url}")
    with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 - pinned https URLs
        data = response.read()
    actual = sha256(data)
    if actual != expected:
        sys.exit(f"SHA-256 mismatch for {url}\n  expected {expected}\n  actual   {actual}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


def load_source(key: str) -> tuple[TTFont, str]:
    src = SOURCES[key]
    data = fetch(src["url"], src["sha256"], CACHE / f"{key}.ttf")
    license_text = fetch(
        src["license_url"], src["license_sha256"], CACHE / f"{key}.license.txt"
    ).decode("utf-8")
    declared = "Reserved Font Name" in license_text.split("This Font Software is licensed")[0]
    if declared and not src["reserved_name"]:
        sys.exit(f"{key}: license declares a Reserved Font Name; configure it before building.")
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    return font, license_text


def rename(font: TTFont, source_key: str, new_family: str) -> None:
    """Rename a modified RFN font (OFL §3), keeping credit records intact."""
    reserved = SOURCES[source_key]["reserved_name"]
    old_family = font["name"].getBestFamilyName()
    old_ps = old_family.replace(" ", "")
    new_ps = new_family.replace(" ", "")
    for record in font["name"].names:
        if record.nameID in CREDIT_NAME_IDS:
            continue
        text = record.toUnicode()
        updated = text.replace(old_family, new_family).replace(old_ps, new_ps)
        if reserved:
            updated = re.sub(rf"\b{reserved}\b", new_family.split()[0], updated)
        if updated != text:
            record.string = updated
    check_reserved(font, source_key)


def check_reserved(font: TTFont, source_key: str) -> None:
    """Fails if a Reserved Font Name appears outside the records that credit the original."""
    reserved = SOURCES[source_key]["reserved_name"]
    for record in font["name"].names:
        if record.nameID in CREDIT_NAME_IDS or not reserved:
            continue
        if reserved in record.toUnicode():
            sys.exit(f"{source_key}: reserved name still present in name ID {record.nameID}")


def build(font: TTFont, limits: dict, flavor: str | None) -> TTFont:
    if limits and "fvar" in font:
        font = instancer.instantiateVariableFont(font, limits)
        # Round-trip through bytes: subsetting a lazily loaded, freshly instanced gvar can fail
        # (KeyError on glyph variations) in fontTools 4.60.
        font.recalcTimestamp = False
        font = TTFont(io.BytesIO(to_bytes(font)), recalcTimestamp=False)
    font.recalcTimestamp = False
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.hinting = False
    options.drop_tables += ["DSIG"]
    options.flavor = flavor
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    font.flavor = flavor
    return font


def to_bytes(font: TTFont) -> bytes:
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def axes_of(font: TTFont) -> dict:
    if "fvar" not in font:
        return {}
    return {
        a.axisTag: {"min": a.minValue, "default": a.defaultValue, "max": a.maxValue}
        for a in font["fvar"].axes
    }


def metrics_of(font: TTFont) -> dict:
    os2 = font["OS/2"]
    hhea = font["hhea"]
    return {
        "upem": font["head"].unitsPerEm,
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "lineGap": hhea.lineGap,
        "capHeight": getattr(os2, "sCapHeight", 0) or 0,
        "xHeight": getattr(os2, "sxHeight", 0) or 0,
    }


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for directory in (ENGINE_OUT, LICENSE_OUT):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True)
    UI_OUT.mkdir(parents=True, exist_ok=True)

    manifest: dict = {
        "$comment": "Generated by scripts/fonts.py — do not edit by hand.",
        "fonts": {},
    }

    for spec in ENGINE_FONTS:
        font, license_text = load_source(spec["source"])
        (LICENSE_OUT / f"{spec['source']}.txt").write_text(license_text, encoding="utf-8")
        font = build(font, spec["limits"], None)
        if spec["rename"]:
            rename(font, spec["source"], spec["rename"])
        check_reserved(font, spec["source"])
        data = to_bytes(font)
        digest = sha256(data)
        packed = gzip.compress(data, compresslevel=9, mtime=0)
        name = f"{spec['id']}.{digest[:10]}.ttf.gz"
        (ENGINE_OUT / name).write_bytes(packed)
        manifest["fonts"][spec["id"]] = {
            "url": f"/fonts/engine/{name}",
            "bytes": len(packed),
            "sha256": digest,
            "family": font["name"].getBestFamilyName(),
            "axes": axes_of(font),
            "metrics": metrics_of(font),
            "license": "OFL-1.1",
            "credit": SOURCES[spec["source"]]["credit"],
        }
        print(f"  engine {name:48} {len(data) / 1024:6.0f} KB → gz {len(packed) / 1024:5.0f} KB")

    for spec in UI_FONTS:
        font, license_text = load_source(spec["source"])
        (LICENSE_OUT / f"{spec['source']}.txt").write_text(license_text, encoding="utf-8")
        font = build(font, spec["limits"], "woff2")
        if spec["rename"]:
            rename(font, spec["source"], spec["rename"])
        data = to_bytes(font)
        (UI_OUT / spec["file"]).write_bytes(data)
        print(f"  ui     {spec['file']:48} {len(data) / 1024:6.0f} KB (woff2)")

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
