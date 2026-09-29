# 🎵 My Music — GitHub Pages Edition

This is the static GitHub Pages version of the Shiny music player you were using. It keeps the same general layout and player behavior but removes the Shiny session entirely.

## Features

- Permanent music library from the repository `music/` folder
- Search
- Play / pause
- Previous / next
- Back / forward 10 seconds
- Shuffle
- Autoplay
- Repeat
- Album artwork
- Generated wallpaper when artwork is unavailable
- RGB frequency visualizer
- 10-band Web Audio equalizer
- EQ presets: Flat, Bass Boost, Vocal, Rock, Electronic
- EQ Preamp
- **Save & Close** and **✕ Close** for the equalizer
- EQ settings saved in browser local storage
- Player state saved in browser local storage
- Last track and playback position restored when possible
- Local music folder support as a temporary fallback
- No Shiny disconnect/reload screen
- No page scrollbar
- PWA manifest + small app-shell cache

## Repository structure

```text
github_music_player/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── service-worker.js
├── favicon.svg
├── .gitattributes
├── .gitignore
├── requirements.txt
├── music/
│   └── playlist.json
├── artwork/
├── tools/
│   └── build_playlist.py
└── .github/
    └── workflows/
        └── deploy.yml
```

## Put your music into the store

Copy your music into:

```text
music/
```

Then generate the permanent playlist:

```bash
python -m pip install mutagen
python tools/build_playlist.py
```

The playlist contains relative file paths such as:

```json
{
  "songs": [
    {
      "src": "music/My Song.mp3",
      "title": "My Song",
      "artist": "Artist",
      "album": "Album",
      "cover": "artwork/abc123.jpg"
    }
  ]
}
```

## Git LFS

The repository is configured for common audio formats with Git LFS because GitHub blocks individual normal Git files above 100 MiB. GitHub documents Git LFS as the mechanism for larger files, with GitHub Free/Pro currently allowing individual LFS files up to 2 GB.

On your computer:

```bash
git lfs install
git add .
git commit -m "Add music player"
git push
```

The included GitHub Actions workflow checks out LFS content and deploys the static site.


## Automatic playlist generation

You do **not** have to manually generate `playlist.json` after every music change.

The GitHub Actions deployment workflow now:
1. Checks out your `music/` folder (including Git LFS files).
2. Installs `mutagen`.
3. Runs `tools/build_playlist.py`.
4. Verifies that supported audio files were found.
5. Publishes the generated `music/playlist.json`.

Therefore, after adding/removing music, just push the changes to `main` and wait for the GitHub Pages deployment to finish.

## Enable GitHub Pages

On GitHub:

1. Open the repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main`.

The included workflow publishes the site automatically after each push.

## Important for a personal music library

A GitHub Pages site is a web site. Anyone who can access the deployed site can request the files that the site makes available. Do not publish copyrighted/private music unless you have the necessary rights and authorization.

For a truly private ~1 GB personal library, a private object-storage bucket (such as a cloud object store) is a better place for the audio, while GitHub hosts the player code and playlist.

## Using the player

After the Pages deployment finishes, open the published site.

Your permanent repository music appears automatically. You should not have to select the folder again after a normal browser refresh.

The **Add Local Music** button remains only as a temporary browser-side fallback. Files selected there are not uploaded back to GitHub.


## Full-screen player

Click **⛶ Full Screen** under the main player controls.

This opens the player as a full-screen music interface and hides the left music-library sidebar so the album artwork, visualizer and controls have more space.

- The button changes to **⛶ Exit Full Screen** while active.
- Press **Esc** to leave browser full screen.
- This uses the browser Fullscreen API, so the first activation must come from a user click.
- On browsers that do not expose the Fullscreen API, the app uses a visual full-screen fallback.


### Full-screen behavior

Click **⛶ Full Screen** to enter the enlarged player. The player content now scales down to keep the lower controls visible within the viewport. When you click **⛶ Exit Full Screen** (or press `Esc` in browser fullscreen), the normal library/sidebar layout is restored automatically.

## Equalizer

Click:

```text
🎚 Equalizer
```

Then adjust the bands.

- **💾 Save & Close** stores the current EQ in the browser and closes the panel.
- **✕** closes the panel without changing the current live audio settings.
- **Reset to Flat** sets all bands and preamp to neutral.
- Presets change the live EQ immediately.

## Browser note

A browser may prevent automatic playback immediately after a full page reload. The player restores the last song and position when possible; if the browser blocks automatic audio, press Play once.

## Optional next step

This static version is suitable for GitHub Pages and can later be wrapped as an iPhone/PWA app. Native Apple CarPlay support would require an iOS/CarPlay application rather than GitHub Pages alone.
