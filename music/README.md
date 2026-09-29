# Music folder

Put your music files here (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`).

After adding or removing music, run from the repository root:

```bash
python tools/build_playlist.py
```

The script creates `music/playlist.json` and can extract common embedded title/artist/album artwork when `mutagen` is installed.

Only publish music you own or are authorized to make available through a public web site.
