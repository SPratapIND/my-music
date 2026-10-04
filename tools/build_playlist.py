from __future__ import annotations

import json
import hashlib
import re
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

SUPPORTED = {
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".aac",
    ".flac",
}

ROOT = Path(__file__).resolve().parents[1]

MUSIC_DIR = ROOT / "music"
ART_DIR = ROOT / "artwork"
PLAYLIST = MUSIC_DIR / "playlist.json"

# Optional manual correction file.
#
# Example:
#
# {
#     "some_song.mp3": "Punjabi",
#     "music/old_song.mp3": "Hindi"
# }
#
LANGUAGE_MAP_FILE = ROOT / "language_map.json"


# ============================================================
# SUPPORTED LANGUAGES
# ============================================================

SUPPORTED_LANGUAGES = {
    "Hindi",
    "Punjabi",
}


# ============================================================
# LANGUAGE ALIASES
# ============================================================

LANGUAGE_ALIASES = {
    "hindi": "Hindi",
    "hindhi": "Hindi",

    "punjabi": "Punjabi",
    "panjabi": "Punjabi",
}


# ============================================================
# BASIC TEXT CLEANING
# ============================================================

def clean_text(value) -> str:

    if value is None:
        return ""

    if isinstance(value, (list, tuple)):

        value = value[0] if value else ""

    return str(value).strip()


# ============================================================
# SONG TITLE CLEANING
# ============================================================

def clean_song_title(
    value: str,
    fallback: str = ""
) -> str:

    title = clean_text(value)

    if not title:
        title = clean_text(fallback)

    # Remove text before "=".
    #
    # Example:
    # Khandan = Yeh Mulaqat
    #
    # becomes:
    # Yeh Mulaqat
    if "=" in title:

        title = title.split(
            "=",
            1
        )[1]

    # Remove leading track numbers.
    #
    # 01 Song
    # 07 - Song
    # 12. Song
    # 001_Song
    #
    title = re.sub(
        r"^\s*\d+\s*[-_.]?\s*",
        "",
        title
    )

    # Remove repeated spaces.
    title = re.sub(
        r"\s+",
        " ",
        title
    ).strip()

    # Safety fallback.
    if not title:

        title = clean_text(fallback)

        if "=" in title:

            title = title.split(
                "=",
                1
            )[1]

        title = re.sub(
            r"^\s*\d+\s*[-_.]?\s*",
            "",
            title
        )

        title = re.sub(
            r"\s+",
            " ",
            title
        ).strip()

    return title


# ============================================================
# ARTIST / ALBUM CLEANING
# ============================================================

def clean_metadata_field(value) -> str:

    value = clean_text(value)

    if not value:
        return ""

    value = re.sub(
        r"^\s*\d+\s*[-_.]?\s*",
        "",
        value
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    ).strip()

    return value


# ============================================================
# NORMALIZE LANGUAGE
# ============================================================

def normalize_language(value) -> str | None:

    value = clean_text(value)

    if not value:
        return None

    return LANGUAGE_ALIASES.get(
        value.lower()
    )


# ============================================================
# LOAD MANUAL LANGUAGE MAP
# ============================================================

def load_language_map() -> dict[str, str]:

    if not LANGUAGE_MAP_FILE.exists():

        print(
            "ℹ️ No language_map.json found."
        )

        print(
            "ℹ️ Automatic Hindi/Punjabi detection "
            "will be used."
        )

        return {}

    try:

        data = json.loads(
            LANGUAGE_MAP_FILE.read_text(
                encoding="utf-8"
            )
        )

    except Exception as error:

        print(
            "⚠️ Could not read language_map.json:"
        )

        print(
            f"   {error}"
        )

        return {}

    if not isinstance(data, dict):

        print(
            "⚠️ language_map.json must contain "
            "a JSON object."
        )

        return {}

    result = {}

    for key, value in data.items():

        language = normalize_language(
            value
        )

        if language is None:

            print(
                f"⚠️ Invalid language for "
                f"'{key}': {value}"
            )

            continue

        clean_key = clean_text(key)

        if clean_key:

            result[clean_key] = language

    print(
        f"🌐 Loaded {len(result)} manual "
        f"language mappings."
    )

    return result


# ============================================================
# MANUAL LANGUAGE LOOKUP
# ============================================================

def get_manual_language(
    path: Path,
    language_map: dict[str, str]
) -> str | None:

    try:

        relative_path = (
            path.relative_to(ROOT)
            .as_posix()
        )

    except ValueError:

        relative_path = path.name

    try:

        music_relative_path = (
            path.relative_to(MUSIC_DIR)
            .as_posix()
        )

    except ValueError:

        music_relative_path = path.name

    candidates = [
        relative_path,
        music_relative_path,
        path.name,
    ]

    for candidate in candidates:

        if candidate in language_map:

            return language_map[candidate]

    return None


# ============================================================
# FOLDER LANGUAGE
# ============================================================

def get_folder_language(
    path: Path
) -> str | None:

    try:

        relative = path.relative_to(
            MUSIC_DIR
        )

    except ValueError:

        return None

    for folder in relative.parent.parts:

        normalized = folder.lower().strip()

        if normalized == "hindi":

            return "Hindi"

        if normalized == "punjabi":

            return "Punjabi"

    return None


# ============================================================
# AUDIO METADATA LANGUAGE
# ============================================================

def get_metadata_language(
    tags
) -> str | None:

    if tags is None:
        return None

    possible_keys = [
        "language",
        "languages",
        "lang",
        "languagecode",
        "language_code",
    ]

    for key in possible_keys:

        try:

            value = tags.get(key)

        except Exception:

            value = None

        language = normalize_language(
            value
        )

        if language:

            return language

    return None


# ============================================================
# SCRIPT DETECTION
# ============================================================

def has_devanagari(text: str) -> bool:

    return bool(
        re.search(
            r"[\u0900-\u097F]",
            text
        )
    )


def has_gurmukhi(text: str) -> bool:

    return bool(
        re.search(
            r"[\u0A00-\u0A7F]",
            text
        )
    )


# ============================================================
# HINDI ARTISTS
# ============================================================

HINDI_ARTISTS = [

    "kishore kumar",
    "mohammed rafi",
    "mohd rafi",
    "mohammad rafi",

    "mukesh",
    "lata mangeshkar",
    "asha bhosle",
    "asha ji",

    "hemant kumar",
    "manna dey",
    "manna de",
    "mannadey",

    "yesudas",

    "kumar sanu",
    "udit narayan",
    "alka yagnik",
    "abhijeet",
    "abhijeet bhattacharya",

    "sonu nigam",
    "shaan",
    "shreya ghoshal",
    "sunidhi chauhan",

    "arijit singh",
    "atif aslam",
    "jubin nautiyal",
    "darshan raval",
    "kk",
    "k k",

    "himesh reshammiya",
    "sukhwinder singh",
    "babul supriyo",

    "atif",
    "udit",
    "alka",

    "amit trivedi",
    "ar rahman",
    "a r rahman",

    "shankar mahadevan",
    "hariharan",

    "javed ali",
    "mohit chauhan",
    "neeraj sridhar",

    "rahat fateh ali khan",
    "nusrat fateh ali khan",

    "lucky ali",
    "pankaj udhas",

    "jagjit singh",
    "chitra singh",

    "talat mahmood",
    "geeta dutt",

    "suraiya",
    "asha",

    "rafi",
    "kishore",
    "mukesh",

    "alka yagnik",
    "kavita krishnamurti",
    "kavita krishnamurthy",

    "sapna mukherjee",
    "sadhana sargam",

    "shankar ehsaan loy",
    "vishal dadlani",
    "shekhar ravjiani",

    "vishal mishra",
    "sachin jigar",

    "pritam",
    "anu malik",
    "nadeem shravan",
    "anand milind",
    "jatin lalit",
]


# ============================================================
# PUNJABI ARTISTS
# ============================================================

PUNJABI_ARTISTS = [

    "diljit dosanjh",
    "diljit",

    "gurdas maan",
    "gurdaas maan",

    "sidhu moose wala",
    "sidhu moosewala",

    "karan aujla",
    "ap dhillon",
    "amrit maan",

    "guru randhawa",
    "harrdy sandhu",
    "hardy sandhu",

    "jass manak",
    "maninder buttar",

    "b praak",
    "bpraak",

    "babbu maan",

    "jazzy b",
    "jazzy bhangra",

    "surjit bindrakhia",

    "sardool sikander",

    "chamkila",
    "amar singh chamkila",

    "malkit singh",

    "gippy grewal",
    "ammy virk",

    "parmish verma",
    "jassi gill",

    "badshah",
    "yo yo honey singh",

    "honey singh",
    "yo yo",

    "bohemia",

    "sukshinder shinda",

    "rdb",

    "panjabi mc",
    "punjabi mc",

    "kanika kapoor",

    "daler mehndi",
]


# ============================================================
# HINDI TITLE WORDS
#
# These are weighted rather than treated as absolute proof.
# ============================================================

HINDI_WORDS = {

    "tum": 2,
    "tera": 2,
    "tere": 2,
    "meri": 2,
    "mera": 2,
    "mere": 2,

    "mujhe": 3,
    "mujh": 2,
    "hum": 1,
    "ham": 1,

    "pyar": 3,
    "pyaar": 3,
    "mohabbat": 3,
    "ishq": 2,

    "dil": 2,
    "dilbar": 2,
    "jaan": 2,
    "jaana": 2,
    "jane": 2,

    "zindagi": 3,
    "zindagi": 3,
    "khushi": 2,
    "khush": 2,

    "aankhon": 2,
    "aankho": 2,
    "aankh": 2,

    "raat": 2,
    "din": 1,
    "subah": 2,
    "shaam": 2,

    "safar": 2,
    "rasta": 2,
    "raasta": 2,

    "chalo": 2,
    "chal": 1,
    "aaja": 2,
    "aao": 2,
    "aana": 2,

    "jao": 1,
    "jaana": 2,
    "jane": 2,

    "kabhi": 2,
    "kya": 1,
    "kyun": 2,
    "kyu": 2,

    "kaise": 2,
    "kaisa": 2,

    "duniya": 2,
    "zara": 2,

    "sanam": 3,
    "sajna": 2,

    "deewana": 3,
    "deewani": 3,

    "mehboob": 3,
    "mehbooba": 3,

    "mausam": 2,
    "barsaat": 2,

    "sapna": 2,
    "sapne": 2,

    "yaad": 2,
    "yaadein": 2,

    "tanha": 2,
    "tanhai": 2,

    "rooh": 2,
    "dard": 2,

    "nazar": 2,
    "nazrein": 2,

    "pal": 1,
    "lamha": 2,
    "lamhe": 2,

    "geet": 2,
    "gaana": 2,
    "gaane": 2,

    "dilwale": 2,
    "dost": 2,
    "dosti": 2,

    "maahi": 2,
    "maahiya": 2,

    "chand": 2,
    "chaand": 2,

    "suraj": 2,
    "sajan": 2,

    "sajni": 2,
    "rani": 2,
    "raja": 2,

    "o mere": 3,
    "mere dil": 3,
    "mera dil": 3,
}


# ============================================================
# PUNJABI TITLE WORDS
#
# These are weighted rather than treated as absolute proof.
# ============================================================

PUNJABI_WORDS = {

    "ve": 4,
    "ni": 3,
    "na": 1,

    "mainu": 4,
    "menu": 4,
    "tenu": 4,
    "tainu": 4,

    "tuhanu": 4,
    "tuhada": 4,
    "tuhadi": 4,

    "sanu": 4,
    "saade": 4,
    "sadda": 4,
    "sadi": 4,

    "mera": 1,
    "meri": 1,
    "mere": 1,

    "tera": 1,
    "tere": 1,

    "goriye": 5,
    "sohniye": 5,
    "soniye": 5,
    "soniye": 5,

    "kudi": 4,
    "kudiyan": 4,

    "munda": 4,
    "munde": 4,

    "jatti": 5,
    "jatt": 5,
    "jattan": 5,

    "gabru": 5,

    "yaar": 4,
    "yaari": 4,

    "balle": 5,
    "balle balle": 6,

    "bhra": 4,
    "pra": 4,
    "veer": 4,

    "paaji": 5,
    "paji": 5,

    "akh": 4,
    "akhan": 4,
    "akhiyaan": 4,
    "akhiyan": 4,

    "nakhra": 4,
    "nakhre": 4,

    "chann": 4,
    "channa": 4,

    "maahi": 1,
    "mahiya": 3,
    "maahiya": 3,

    "dil": 1,

    "ishq": 1,
    "pyaar": 1,
    "pyar": 1,

    "ni sohniye": 6,
    "ve mahiya": 6,
    "oye": 2,

    "att": 5,
    "sira": 5,
    "sirra": 5,

    "shad": 4,
    "chhad": 4,
    "chadd": 4,

    "karda": 4,
    "kardi": 4,
    "karde": 4,

    "karna": 1,
    "krda": 4,
    "krdi": 4,

    "lagdi": 4,
    "lagda": 4,

    "awein": 4,
    "aivein": 4,

    "tere naal": 5,
    "mere naal": 5,
    "sade naal": 5,
    "naal": 4,

    "pind": 5,
    "pindaan": 5,

    "jind": 4,
    "jindri": 4,

    "suit": 3,
    "chunni": 4,
    "dupatta": 3,

    "bhabi": 4,

    "akhiyan": 4,
    "gallan": 4,
    "gal": 4,

    "diljit": 5,
}


# ============================================================
# TOKENIZE TEXT
# ============================================================

def tokenize(text: str) -> list[str]:

    text = text.lower()

    return re.findall(
        r"[a-zA-ZÀ-ÿ\u0900-\u097F\u0A00-\u0A7F]+",
        text
    )


# ============================================================
# SCORE LANGUAGE
# ============================================================

def score_language(
    title: str,
    artist: str,
    album: str,
    filename: str
) -> tuple[int, int]:

    combined = " ".join(
        [
            clean_text(title),
            clean_text(artist),
            clean_text(album),
            clean_text(filename),
        ]
    ).lower()

    tokens = tokenize(combined)

    hindi_score = 0
    punjabi_score = 0

    # --------------------------------------------------------
    # SCRIPT
    # --------------------------------------------------------

    if has_devanagari(combined):

        hindi_score += 100

    if has_gurmukhi(combined):

        punjabi_score += 100

    # --------------------------------------------------------
    # HINDI WORDS
    # --------------------------------------------------------

    for word, weight in HINDI_WORDS.items():

        if " " in word:

            if word in combined:

                hindi_score += weight

        elif word in tokens:

            hindi_score += weight

    # --------------------------------------------------------
    # PUNJABI WORDS
    # --------------------------------------------------------

    for word, weight in PUNJABI_WORDS.items():

        if " " in word:

            if word in combined:

                punjabi_score += weight

        elif word in tokens:

            punjabi_score += weight

    # --------------------------------------------------------
    # ARTIST
    # --------------------------------------------------------

    artist_normalized = (
        clean_text(artist)
        .lower()
    )

    for artist_name in HINDI_ARTISTS:

        if artist_name in artist_normalized:

            hindi_score += 30

    for artist_name in PUNJABI_ARTISTS:

        if artist_name in artist_normalized:

            punjabi_score += 30

    # --------------------------------------------------------
    # EXPLICIT LANGUAGE NAMES
    # --------------------------------------------------------

    if "hindi" in combined:

        hindi_score += 50

    if "bollywood" in combined:

        hindi_score += 40

    if "punjabi" in combined:

        punjabi_score += 50

    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    return (
        hindi_score,
        punjabi_score
    )


# ============================================================
# DETECT LANGUAGE
# ============================================================

def detect_language(
    path: Path,
    title: str,
    artist: str,
    album: str,
    metadata_language: str | None,
    language_map: dict[str, str]
) -> tuple[str, str]:

    # --------------------------------------------------------
    # 1. Manual mapping
    # --------------------------------------------------------

    language = get_manual_language(
        path,
        language_map
    )

    if language:

        return (
            language,
            "manual mapping"
        )

    # --------------------------------------------------------
    # 2. Audio metadata
    # --------------------------------------------------------

    language = normalize_language(
        metadata_language
    )

    if language:

        return (
            language,
            "audio metadata"
        )

    # --------------------------------------------------------
    # 3. Folder
    # --------------------------------------------------------

    language = get_folder_language(
        path
    )

    if language:

        return (
            language,
            "folder"
        )

    # --------------------------------------------------------
    # 4. Score
    # --------------------------------------------------------

    hindi_score, punjabi_score = score_language(
        title=title,
        artist=artist,
        album=album,
        filename=path.stem,
    )

    # --------------------------------------------------------
    # Strong Hindi
    # --------------------------------------------------------

    if hindi_score >= 100:

        return (
            "Hindi",
            "Devanagari/script"
        )

    # --------------------------------------------------------
    # Strong Punjabi
    # --------------------------------------------------------

    if punjabi_score >= 100:

        return (
            "Punjabi",
            "Gurmukhi/script"
        )

    # --------------------------------------------------------
    # Compare scores
    # --------------------------------------------------------

    if hindi_score > punjabi_score:

        if hindi_score >= 3:

            return (
                "Hindi",
                "title/artist scoring"
            )

    if punjabi_score > hindi_score:

        if punjabi_score >= 3:

            return (
                "Punjabi",
                "title/artist scoring"
            )

    # --------------------------------------------------------
    # Ambiguous case
    #
    # User confirmed the remaining songs are Hindi or Punjabi.
    #
    # We therefore assign ambiguous songs to Hindi instead of
    # leaving them invisible from the language section.
    # --------------------------------------------------------

    return (
        "Hindi",
        "default for ambiguous Hindi/Punjabi library"
    )


# ============================================================
# METADATA EXTRACTION
# ============================================================

def extract_metadata(path: Path) -> dict:

    data = {
        "title": clean_song_title(
            path.stem,
            path.stem
        ),
        "artist": "",
        "album": "",
        "cover": "",
        "language": None,
    }

    try:

        from mutagen import File

    except ImportError:

        return data

    # ========================================================
    # AUDIO METADATA
    # ========================================================

    try:

        audio = File(
            str(path),
            easy=True
        )

        if audio is not None:

            tags = audio

            # TITLE
            raw_title = clean_text(
                tags.get("title")
            )

            data["title"] = clean_song_title(
                raw_title,
                path.stem
            )

            # ARTIST
            data["artist"] = clean_metadata_field(
                tags.get("artist")
            )

            # ALBUM
            data["album"] = clean_metadata_field(
                tags.get("album")
            )

            # LANGUAGE
            data["language"] = (
                get_metadata_language(tags)
            )

    except Exception:
        pass

    # ========================================================
    # COVER ART EXTRACTION
    # ========================================================

    try:

        raw = File(
            str(path),
            easy=False
        )

        if raw is None:
            return data

        picture_bytes = None
        picture_type = "jpg"

        # ----------------------------------------------------
        # MP3 / ID3
        # ----------------------------------------------------

        if (
            hasattr(raw, "tags")
            and raw.tags is not None
            and hasattr(raw.tags, "getall")
        ):

            apic = raw.tags.getall(
                "APIC"
            )

            if apic:

                picture_bytes = apic[0].data

                mime = getattr(
                    apic[0],
                    "mime",
                    "image/jpeg"
                )

                picture_type = (
                    "png"
                    if "png" in mime
                    else "jpg"
                )

        # ----------------------------------------------------
        # FLAC
        # ----------------------------------------------------

        if (
            picture_bytes is None
            and getattr(
                raw,
                "pictures",
                None
            )
        ):

            picture = raw.pictures[0]

            picture_bytes = picture.data

            mime = getattr(
                picture,
                "mime",
                "image/jpeg"
            )

            picture_type = (
                "png"
                if "png" in mime
                else "jpg"
            )

        # ----------------------------------------------------
        # MP4 / M4A
        # ----------------------------------------------------

        if (
            picture_bytes is None
            and getattr(
                raw,
                "tags",
                None
            ) is not None
        ):

            covr = raw.tags.get(
                "covr"
            )

            if covr:

                first = covr[0]

                picture_bytes = bytes(
                    first
                )

                picture_type = (
                    "jpg"
                    if picture_bytes[:2]
                    == b"\xff\xd8"
                    else "png"
                )

        # ----------------------------------------------------
        # SAVE COVER
        # ----------------------------------------------------

        if picture_bytes:

            rel = path.relative_to(
                ROOT
            ).as_posix()

            digest = hashlib.sha1(
                rel.encode("utf-8")
            ).hexdigest()[:10]

            out = (
                ART_DIR
                / f"{digest}.{picture_type}"
            )

            out.write_bytes(
                picture_bytes
            )

            data["cover"] = (
                out.relative_to(ROOT)
                .as_posix()
            )

    except Exception:
        pass

    return data


# ============================================================
# BUILD PLAYLIST
# ============================================================

def main():

    # --------------------------------------------------------
    # Create directories
    # --------------------------------------------------------

    MUSIC_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    ART_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Load manual mappings
    # --------------------------------------------------------

    language_map = load_language_map()

    songs = []

    language_counts = {
        "Hindi": 0,
        "Punjabi": 0,
    }

    detection_counts = {
        "manual mapping": 0,
        "audio metadata": 0,
        "folder": 0,
        "Devanagari/script": 0,
        "Gurmukhi/script": 0,
        "title/artist scoring": 0,
        "default for ambiguous Hindi/Punjabi library": 0,
    }

    # ========================================================
    # FIND ALL MUSIC FILES
    # ========================================================

    for path in sorted(
        MUSIC_DIR.rglob("*")
    ):

        # Skip folders.
        if not path.is_file():
            continue

        # Skip playlist itself.
        if path.name.lower() == "playlist.json":
            continue

        # Skip unsupported formats.
        if path.suffix.lower() not in SUPPORTED:
            continue

        # ----------------------------------------------------
        # Extract metadata
        # ----------------------------------------------------

        meta = extract_metadata(
            path
        )

        # ----------------------------------------------------
        # Relative URL
        # ----------------------------------------------------

        rel = path.relative_to(
            ROOT
        ).as_posix()

        # ----------------------------------------------------
        # Detect language
        # ----------------------------------------------------

        language, reason = detect_language(
            path=path,
            title=meta["title"],
            artist=meta["artist"],
            album=meta["album"],
            metadata_language=meta["language"],
            language_map=language_map,
        )

        # ----------------------------------------------------
        # Count language
        # ----------------------------------------------------

        language_counts[
            language
        ] += 1

        detection_counts[
            reason
        ] = (
            detection_counts.get(
                reason,
                0
            ) + 1
        )

        # ----------------------------------------------------
        # Add song
        # ----------------------------------------------------

        songs.append({
            "src": rel,
            "title": meta["title"],
            "artist": meta["artist"],
            "album": meta["album"],
            "cover": meta["cover"],
            "language": language,
        })

    # ========================================================
    # WRITE PLAYLIST.JSON
    # ========================================================

    PLAYLIST.write_text(
        json.dumps(
            {
                "songs": songs
            },
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    # ========================================================
    # FINAL SUMMARY
    # ========================================================

    print("")
    print(
        f"Wrote {len(songs)} songs to {PLAYLIST}"
    )

    print("")
    print(
        "🌐 LANGUAGE SUMMARY"
    )

    print(
        "-------------------"
    )

    print(
        f"Hindi:   {language_counts['Hindi']} songs"
    )

    print(
        f"Punjabi: {language_counts['Punjabi']} songs"
    )

    print("")
    print(
        "🔎 DETECTION SUMMARY"
    )

    print(
        "--------------------"
    )

    for reason, count in detection_counts.items():

        if count > 0:

            print(
                f"{reason}: {count}"
            )

    print("")

    # ========================================================
    # MUTAGEN CHECK
    # ========================================================

    if not _has_mutagen():

        print(
            "⚠️ Mutagen is not installed."
        )

        print(
            "Install it with:"
        )

        print(
            "    py -m pip install mutagen"
        )

        print("")


# ============================================================
# CHECK MUTAGEN
# ============================================================

def _has_mutagen():

    try:

        import mutagen  # noqa: F401

        return True

    except Exception:

        return False


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()