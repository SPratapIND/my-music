from __future__ import annotations

import json
import mimetypes
import hashlib
from pathlib import Path

SUPPORTED = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}
ROOT = Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "music"
ART_DIR = ROOT / "artwork"
PLAYLIST = MUSIC_DIR / "playlist.json"


def clean_text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = value[0] if value else ""
    return str(value).strip()


def extract_metadata(path: Path) -> dict:
    data = {
        "title": path.stem,
        "artist": "",
        "album": "",
        "cover": "",
    }

    try:
        from mutagen import File
    except ImportError:
        return data

    try:
        audio = File(str(path), easy=True)
        if audio is not None:
            tags = audio
            data["title"] = clean_text(tags.get("title")) or path.stem
            data["artist"] = clean_text(tags.get("artist"))
            data["album"] = clean_text(tags.get("album"))
    except Exception:
        pass

    # Optional cover extraction for common formats.
    try:
        raw = File(str(path), easy=False)
        if raw is None:
            return data

        picture_bytes = None
        picture_type = "jpg"

        # MP3 / ID3
        if hasattr(raw, "tags") and raw.tags is not None and hasattr(raw.tags, "getall"):
            apic = raw.tags.getall("APIC")
            if apic:
                picture_bytes = apic[0].data
                mime = getattr(apic[0], "mime", "image/jpeg")
                picture_type = "png" if "png" in mime else "jpg"

        # FLAC
        if picture_bytes is None and getattr(raw, "pictures", None):
            picture = raw.pictures[0]
            picture_bytes = picture.data
            mime = getattr(picture, "mime", "image/jpeg")
            picture_type = "png" if "png" in mime else "jpg"

        # MP4 / M4A
        if picture_bytes is None and getattr(raw, "tags", None) is not None:
            covr = raw.tags.get("covr")
            if covr:
                first = covr[0]
                picture_bytes = bytes(first)
                # JPEG starts with FF D8; otherwise use PNG.
                picture_type = "jpg" if picture_bytes[:2] == b"\xff\xd8" else "png"

        if picture_bytes:
            rel = path.relative_to(ROOT).as_posix()
            digest = hashlib.sha1(rel.encode("utf-8")).hexdigest()[:10]
            out = ART_DIR / f"{digest}.{picture_type}"
            out.write_bytes(picture_bytes)
            data["cover"] = out.relative_to(ROOT).as_posix()

    except Exception:
        pass

    return data


def main():
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    ART_DIR.mkdir(parents=True, exist_ok=True)

    songs = []

    for path in sorted(MUSIC_DIR.rglob("*")):
        if not path.is_file():
            continue
        if path.name.lower() == "playlist.json":
            continue
        if path.suffix.lower() not in SUPPORTED:
            continue

        meta = extract_metadata(path)
        rel = path.relative_to(ROOT).as_posix()

        songs.append({
            "src": rel,
            "title": meta["title"],
            "artist": meta["artist"],
            "album": meta["album"],
            "cover": meta["cover"],
        })

    PLAYLIST.write_text(
        json.dumps({"songs": songs}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"Wrote {len(songs)} songs to {PLAYLIST}")
    if not _has_mutagen():
        print("Note: install mutagen for embedded artist/album/cover metadata extraction:")
        print("  python -m pip install mutagen")


def _has_mutagen():
    try:
        import mutagen  # noqa: F401
        return True
    except Exception:
        return False


if __name__ == "__main__":
    main()
