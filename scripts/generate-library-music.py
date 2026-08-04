"""
Build public/music/library/*.mp3 from Kevin MacLeod (incompetech.com) CC BY 4.0 tracks.
Curated beds (~40–55s) for Family Memory Vault movie soundtracks.
"""

from __future__ import annotations

import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "music" / "library"
CACHE_DIR = Path.home() / "AppData" / "Local" / "Temp" / "fmv-music-src"
BASE = "https://incompetech.com/music/royalty-free/mp3-royaltyfree"

# (out_filename, source_title.mp3, start_sec, duration_sec, display_title)
TRACKS = [
    # Soft Piano
    ("soft-piano.mp3", "Meditation Impromptu 01.mp3", 8, 48, "Meditation Impromptu 01"),
    ("morning-keys.mp3", "Dreamy Flashback.mp3", 4, 48, "Dreamy Flashback"),
    ("quiet-keys.mp3", "Gymnopedie No 1.mp3", 0, 50, "Gymnopedie No 1"),
    # Warm / Family
    ("gentle-acoustic.mp3", "Wholesome.mp3", 10, 48, "Wholesome"),
    ("vinyl-soft.mp3", "Lobby Time.mp3", 6, 48, "Lobby Time"),
    ("family-porch.mp3", "Easy Lemon.mp3", 8, 48, "Easy Lemon"),
    # Cinematic
    ("quiet-score.mp3", "Virtutes Instrumenti.mp3", 12, 50, "Virtutes Instrumenti"),
    ("ambient-pads.mp3", "Floating Cities.mp3", 8, 50, "Floating Cities"),
    ("film-rise.mp3", "Ascending the Vale.mp3", 10, 52, "Ascending the Vale"),
    # Holiday
    ("festive-strings.mp3", "Dance of the Sugar Plum Fairy.mp3", 2, 45, "Dance of the Sugar Plum Fairy"),
    ("carol-lite.mp3", "Silent Night.mp3", 4, 45, "Silent Night"),
    ("holiday-glow.mp3", "Holiday Weasel.mp3", 4, 46, "Holiday Weasel"),
    # Upbeat
    ("light-ukulele.mp3", "Beachfront Celebration.mp3", 6, 42, "Beachfront Celebration"),
    ("upbeat-pop.mp3", "Happy Boy Theme.mp3", 0, 40, "Happy Boy Theme"),
    ("sunny-stride.mp3", "Jaunty Gumption.mp3", 4, 44, "Jaunty Gumption"),
    # Memorial / Reflective
    ("soft-farewell.mp3", "Past Sadness.mp3", 6, 52, "Past Sadness"),
    ("long-memory.mp3", "Long Note Two.mp3", 8, 55, "Long Note Two"),
    ("gentle-goodbye.mp3", "Bittersweet.mp3", 4, 50, "Bittersweet"),
    # Bright Social
    ("social-spark.mp3", "Wallpaper.mp3", 4, 42, "Wallpaper"),
    ("feed-ready.mp3", "Carefree.mp3", 6, 42, "Carefree"),
    ("bright-scroll.mp3", "Monkeys Spinning Monkeys.mp3", 2, 40, "Monkeys Spinning Monkeys"),
]


def find_ffmpeg() -> str:
    bundled = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
    if bundled.exists():
        return str(bundled)
    bundled_unix = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg"
    if bundled_unix.exists():
        return str(bundled_unix)
    return "ffmpeg"


def download_source(src_name: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / src_name
    if dest.exists() and dest.stat().st_size > 100_000:
        print(f"Cached: {src_name}")
        return dest
    url = f"{BASE}/{urllib.parse.quote(src_name)}"
    print(f"Downloading: {src_name}")
    # Windows schannel often fails incompetech's cert revocation check.
    cmd = [
        "curl.exe",
        "-L",
        "--ssl-no-revoke",
        "--fail",
        "-A",
        "FamilyMemoryVault/1.0 (royalty-free library build)",
        "-o",
        str(dest),
        url,
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0 or not dest.exists() or dest.stat().st_size < 100_000:
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise RuntimeError(
            f"Download failed for {src_name}: {proc.stderr or proc.stdout or proc.returncode}"
        )
    return dest


def encode_clip(ffmpeg: str, src: Path, out: Path, start: float, duration: float) -> None:
    fade_out = max(0.0, duration - 2.5)
    af = (
        f"afade=t=in:d=1.2,afade=t=out:st={fade_out}:d=2.5,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    cmd = [
        ffmpeg,
        "-y",
        "-ss",
        str(start),
        "-t",
        str(duration),
        "-i",
        str(src),
        "-af",
        af,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ac",
        "2",
        "-ar",
        "44100",
        str(out),
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0 or not out.exists() or out.stat().st_size < 50_000:
        raise RuntimeError(
            f"ffmpeg failed for {out.name}: {proc.stderr[-800:] if proc.stderr else proc.returncode}"
        )


def main() -> int:
    ffmpeg = find_ffmpeg()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    for out_name, src_name, start, duration, title in TRACKS:
        dest = OUT_DIR / out_name
        try:
            src = download_source(src_name)
            print(f"Encoding {out_name} from '{title}' @ {start}s ({duration}s)")
            encode_clip(ffmpeg, src, dest, float(start), float(duration))
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{out_name}: {exc}")
            print(f"FAILED {out_name}: {exc}", file=sys.stderr)
    print("\nLibrary files:")
    for p in sorted(OUT_DIR.glob("*.mp3")):
        print(f"  {p.name:24} {p.stat().st_size // 1024} KB")
    print("Music by Kevin MacLeod (incompetech.com) - CC BY 4.0")
    if failures:
        print(f"\n{len(failures)} track(s) failed:", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
