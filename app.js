(() => {
  "use strict";

  const SUPPORTED_EXT = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
  const EQ_FREQS = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000];

  const STORAGE_KEYS = {
    eq: "myMusic.eq.v1",
    player: "myMusic.player.v1"
  };

  let musicLibrary = [];
  let currentIndex = -1;
  let autoplay = true;
  let repeat = false;
  let shuffle = false;
  let equalizerOpen = false;
  let fullscreenFallback = false;
  let pendingRestoreTime = 0;
  let toastTimer = null;

  const audio = new Audio();
  audio.preload = "metadata";

  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let eqFilters = [];
  let eqPreamp = null;
  let animationStarted = false;
  let artworkURL = null;
  let localObjectURL = null;

  const el = {};

  function cacheElements() {
    [
      "wallpaper", "albumArt", "currentTitle", "currentArtist",
      "visualizer", "progress", "currentTime", "duration",
      "musicList", "searchInput", "folderUpload", "storeStatus",
      "playButton", "previousButton", "backButton", "forwardButton",
      "nextButton", "shuffleButton", "autoplayButton", "repeatButton",
      "equalizerButton", "fullscreenButton", "equalizerPanel", "equalizerPreset",
      "equalizerBands", "eqPreamp", "eqPreampValue",
      "eqResetButton", "eqSaveCloseButton", "eqCloseButton", "toast", "fullscreenHint"
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  function supportedAudio(fileName) {
    const lower = String(fileName || "").toLowerCase();
    return SUPPORTED_EXT.some(ext => lower.endsWith(ext));
  }

  function getSongName(fileOrSong) {
    const name = fileOrSong?.name || fileOrSong?.title || "Unknown song";
    return name.replace(/\.[^/.]+$/, "");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeLabel(value) {
    return String(value || "").trim();
  }

  function safeParseJSON(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function storageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : safeParseJSON(value, fallback);
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1800);
  }

  function setGeneratedWallpaper(name) {
    let hash = 0;
    const text = String(name || "My Music");
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }

    const hue1 = Math.abs(hash) % 360;
    const hue2 = (hue1 + 70) % 360;

    if (el.wallpaper) {
      el.wallpaper.style.backgroundImage =
        `linear-gradient(135deg, hsl(${hue1},65%,28%), hsl(${hue2},55%,12%))`;
    }
  }

  function setArtwork(url, fallbackName) {
    if (artworkURL && artworkURL.startsWith("blob:")) {
      try { URL.revokeObjectURL(artworkURL); } catch {}
    }
    artworkURL = url || null;

    if (el.albumArt) {
      if (url) {
        el.albumArt.style.backgroundImage = `url("${url}")`;
        el.albumArt.textContent = "";
      } else {
        el.albumArt.style.backgroundImage = "";
        el.albumArt.textContent = "🎵";
      }
    }

    if (url && el.wallpaper) {
      el.wallpaper.style.backgroundImage = `url("${url}")`;
    } else {
      setGeneratedWallpaper(fallbackName);
    }
  }

  function loadLocalEmbeddedArtwork(file) {
    if (!window.jsmediatags || !file) {
      setArtwork(null, getSongName(file));
      return;
    }

    try {
      window.jsmediatags.read(file, {
        onSuccess: tag => {
          const picture = tag?.tags?.picture;
          if (!picture?.data) {
            setArtwork(null, getSongName(file));
            return;
          }

          const bytes = new Uint8Array(picture.data);
          const blob = new Blob([bytes], {
            type: picture.format || "image/jpeg"
          });

          const url = URL.createObjectURL(blob);
          setArtwork(url, getSongName(file));
        },
        onError: () => setArtwork(null, getSongName(file))
      });
    } catch {
      setArtwork(null, getSongName(file));
    }
  }

  function loadSongArtwork(song) {
    if (song.cover) {
      const coverUrl = new URL(song.cover, window.location.href).href;
      setArtwork(coverUrl, song.title || song.src);
      return;
    }

    if (song._localFile) {
      loadLocalEmbeddedArtwork(song._localFile);
      return;
    }

    setArtwork(null, song.title || song.src);
  }

  function resolveMediaURL(src) {
    return new URL(src, window.location.href).href;
  }

  function setupAudioGraph() {
    if (audioContext) return true;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showToast("Web Audio API is not available in this browser.");
      return false;
    }

    try {
      audioContext = new AudioContextClass();

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      sourceNode = audioContext.createMediaElementSource(audio);

      eqFilters = EQ_FREQS.map(freq => {
        const filter = audioContext.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = 0;
        return filter;
      });

      eqPreamp = audioContext.createGain();
      eqPreamp.gain.value = 1;

      let chain = sourceNode;
      eqFilters.forEach(filter => {
        chain.connect(filter);
        chain = filter;
      });

      chain.connect(eqPreamp);
      eqPreamp.connect(analyser);
      analyser.connect(audioContext.destination);

      applySavedEQValues();
      startVisualizer();
      return true;
    } catch (error) {
      console.error(error);
      showToast("Could not initialize the equalizer/audio engine.");
      return false;
    }
  }

  function resumeAudioContext() {
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  }

  function updatePlayButton() {
    if (!el.playButton) return;
    el.playButton.textContent = audio.paused ? "▶" : "⏸";
  }

  function updateToggleButton(button, active) {
    if (!button) return;
    button.classList.toggle("active", Boolean(active));
  }

  function updateModeButtons() {
    updateToggleButton(el.shuffleButton, shuffle);
    updateToggleButton(el.autoplayButton, autoplay);
    updateToggleButton(el.repeatButton, repeat);
    updateToggleButton(el.equalizerButton, equalizerOpen);
  }

  function renderMusicList(query = "") {
    const q = String(query || "").toLowerCase().trim();
    el.musicList.innerHTML = "";

    const filtered = musicLibrary
      .map((song, index) => ({ song, index }))
      .filter(({ song }) => {
        const haystack = [
          song.title,
          song.artist,
          song.album,
          song.src,
          song.name
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = musicLibrary.length
        ? "No matching songs."
        : "No songs in the music store yet. Add music to the repository and regenerate playlist.json.";
      el.musicList.appendChild(empty);
      return;
    }

    for (const { song, index } of filtered) {
      const item = document.createElement("div");
      item.className = "song-item";
      if (index === currentIndex) item.classList.add("active");
      item.dataset.index = String(index);

      const title = document.createElement("div");
      title.className = "song-title";
      title.textContent = `${index + 1}. ${escapeLabel(song.title || getSongName(song))}`;

      item.appendChild(title);

      const artist = escapeLabel(song.artist || song.album || "");
      if (artist) {
        const artistNode = document.createElement("div");
        artistNode.className = "song-artist";
        artistNode.textContent = artist;
        item.appendChild(artistNode);
      }

      item.addEventListener("click", () => playSong(index));
      el.musicList.appendChild(item);
    }
  }

  function highlightCurrentSong() {
    const items = el.musicList.querySelectorAll(".song-item");
    items.forEach(item => item.classList.remove("active"));

    const item = el.musicList.querySelector(`[data-index="${currentIndex}"]`);
    if (item) {
      item.classList.add("active");
      item.scrollIntoView({ block: "nearest" });
    }
  }

  async function playSong(index, options = {}) {
    if (index < 0 || index >= musicLibrary.length) return;

    const song = musicLibrary[index];
    currentIndex = index;

    if (localObjectURL) {
      try { URL.revokeObjectURL(localObjectURL); } catch {}
      localObjectURL = null;
    }

    if (song._localFile) {
      localObjectURL = URL.createObjectURL(song._localFile);
      audio.src = localObjectURL;
    } else {
      audio.src = resolveMediaURL(song.src);
    }

    audio.load();

    el.currentTitle.textContent = song.title || getSongName(song);
    el.currentArtist.textContent = [song.artist, song.album].filter(Boolean).join(" • ");

    loadSongArtwork(song);
    highlightCurrentSong();

    setupAudioGraph();
    resumeAudioContext();

    savePlayerState();

    if (options.play !== false) {
      try {
        await audio.play();
      } catch {
        // Browser autoplay policies may block playback after a refresh.
      }
    }

    updatePlayButton();
  }

  async function togglePlay() {
    if (!audio.src) {
      if (musicLibrary.length) {
        await playSong(0);
      }
      return;
    }

    setupAudioGraph();
    resumeAudioContext();

    if (audio.paused) {
      try { await audio.play(); } catch {}
    } else {
      audio.pause();
    }

    updatePlayButton();
    savePlayerState();
  }

  function nextSong() {
    if (!musicLibrary.length) return;

    let nextIndex;

    if (shuffle) {
      if (musicLibrary.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * musicLibrary.length);
        } while (nextIndex === currentIndex);
      }
    } else {
      nextIndex = currentIndex + 1;
    }

    if (nextIndex >= musicLibrary.length) {
      if (repeat) {
        nextIndex = 0;
      } else {
        audio.pause();
        updatePlayButton();
        savePlayerState();
        return;
      }
    }

    playSong(nextIndex);
  }

  function previousSong() {
    if (!musicLibrary.length) return;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    let previousIndex = currentIndex - 1;
    if (previousIndex < 0) previousIndex = musicLibrary.length - 1;
    playSong(previousIndex);
  }

  function skipBackward() {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  }

  function skipForward() {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
  }

  function persistModes() {
    storageSet(STORAGE_KEYS.player, {
      autoplay,
      repeat,
      shuffle
    });
  }

  function savePlayerState() {
    const song = musicLibrary[currentIndex];
    if (!song || song._localFile) return;

    storageSet(STORAGE_KEYS.player, {
      autoplay,
      repeat,
      shuffle,
      songSrc: song.src,
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      wasPlaying: !audio.paused
    });
  }

  function restoreModes() {
    const state = storageGet(STORAGE_KEYS.player, {});
    autoplay = state.autoplay !== false;
    repeat = state.repeat === true;
    shuffle = state.shuffle === true;
    updateModeButtons();
    return state;
  }

  async function restorePermanentPlayerState(state) {
    if (!state?.songSrc) return;

    const index = musicLibrary.findIndex(song => song.src === state.songSrc);
    if (index < 0) return;

    pendingRestoreTime = Number(state.position) || 0;

    await playSong(index, { play: false });

    if (state.wasPlaying) {
      // Browser autoplay restrictions may still require the user to press Play.
      try {
        setupAudioGraph();
        resumeAudioContext();
        await audio.play();
      } catch {}
    }
  }

  function setupEQUI() {
    el.equalizerBands.innerHTML = "";

    EQ_FREQS.forEach((freq, index) => {
      const band = document.createElement("div");
      band.className = "eq-band";

      const value = document.createElement("div");
      value.className = "eq-value";
      value.id = `eqValue${index}`;
      value.textContent = "0.0 dB";

      const wrap = document.createElement("div");
      wrap.className = "eq-slider-wrap";

      const slider = document.createElement("input");
      slider.id = `eqSlider${index}`;
      slider.className = "eq-slider";
      slider.type = "range";
      slider.min = "-12";
      slider.max = "12";
      slider.step = "0.5";
      slider.value = "0";
      slider.setAttribute("aria-label", `${freq} Hz`);

      slider.addEventListener("input", () => {
        setEQBand(index, slider.value);
      });

      const label = document.createElement("div");
      label.className = "eq-frequency";
      label.textContent = freq >= 1000 ? `${freq / 1000}k` : String(freq);

      wrap.appendChild(slider);
      band.appendChild(value);
      band.appendChild(wrap);
      band.appendChild(label);
      el.equalizerBands.appendChild(band);
    });

    const saved = storageGet(STORAGE_KEYS.eq, null);
    if (saved) {
      applyEQSettingsToUI(saved.bands || Array(EQ_FREQS.length).fill(0), saved.preamp ?? 0);
    }
  }

  function updateEQLabel(index, gain) {
    const label = document.getElementById(`eqValue${index}`);
    if (label) {
      label.textContent = `${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB`;
    }
  }

  function setEQBand(index, rawValue) {
    const gain = clamp(parseFloat(rawValue) || 0, -12, 12);

    if (!audioContext) setupAudioGraph();
    if (eqFilters[index]) eqFilters[index].gain.value = gain;

    const slider = document.getElementById(`eqSlider${index}`);
    if (slider) slider.value = String(gain);
    updateEQLabel(index, gain);
  }

  function setEQPreamp(rawValue) {
    const gain = clamp(parseFloat(rawValue) || 0, -12, 6);

    if (!audioContext) setupAudioGraph();
    if (eqPreamp) eqPreamp.gain.value = Math.pow(10, gain / 20);

    if (el.eqPreamp) el.eqPreamp.value = String(gain);
    if (el.eqPreampValue) {
      el.eqPreampValue.textContent = `${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB`;
    }
  }

  function getCurrentEQ() {
    const bands = EQ_FREQS.map((_, index) => {
      const slider = document.getElementById(`eqSlider${index}`);
      return parseFloat(slider?.value || "0");
    });

    const preamp = parseFloat(el.eqPreamp?.value || "0");
    return { bands, preamp };
  }

  function applyEQSettingsToUI(bands, preamp) {
    bands.forEach((gain, index) => {
      const safeGain = clamp(Number(gain) || 0, -12, 12);
      const slider = document.getElementById(`eqSlider${index}`);
      if (slider) slider.value = String(safeGain);
      updateEQLabel(index, safeGain);

      if (!audioContext) return;
      if (eqFilters[index]) eqFilters[index].gain.value = safeGain;
    });

    const safePreamp = clamp(Number(preamp) || 0, -12, 6);
    if (el.eqPreamp) el.eqPreamp.value = String(safePreamp);
    if (el.eqPreampValue) {
      el.eqPreampValue.textContent =
        `${safePreamp > 0 ? "+" : ""}${safePreamp.toFixed(1)} dB`;
    }

    if (eqPreamp) {
      eqPreamp.gain.value = Math.pow(10, safePreamp / 20);
    }
  }

  function applySavedEQValues() {
    const saved = storageGet(STORAGE_KEYS.eq, null);
    if (saved) {
      applyEQSettingsToUI(saved.bands || Array(EQ_FREQS.length).fill(0), saved.preamp ?? 0);
    }
  }

  function applyEQPreset(name) {
    const presets = {
      flat:        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass:        [5.0, 4.0, 2.5, 1.0, 0, 0, -0.5, -1.0, -1.0, -1.0],
      vocal:       [-2.0, -1.0, 0.5, 1.5, 2.5, 2.0, 1.0, 0, -0.5, -1.0],
      rock:        [4.0, 3.0, 1.5, -0.5, -1.0, 0.5, 2.0, 3.0, 2.0, 1.0],
      electronic:  [4.5, 3.5, 1.5, 0, -1.0, 0.5, 2.0, 3.0, 3.5, 2.5]
    };

    const gains = presets[name] || presets.flat;

    const preampMap = {
      flat: 0,
      bass: -4,
      vocal: -2,
      rock: -4,
      electronic: -4
    };

    applyEQSettingsToUI(gains, preampMap[name] ?? 0);
  }

  function saveEQAndClose() {
    const settings = getCurrentEQ();
    storageSet(STORAGE_KEYS.eq, settings);
    equalizerOpen = false;
    el.equalizerPanel.classList.remove("open");
    updateModeButtons();
    showToast("Equalizer settings saved.");
  }

  function closeEqualizer() {
    equalizerOpen = false;
    el.equalizerPanel.classList.remove("open");
    updateModeButtons();
  }

  function toggleEqualizer() {
    equalizerOpen = !equalizerOpen;
    el.equalizerPanel.classList.toggle("open", equalizerOpen);
    updateModeButtons();

    if (equalizerOpen && !audioContext) {
      setupAudioGraph();
    }
  }


  async function toggleFullscreen() {
    const app = document.getElementById("musicApp");

    if (!app) return;

    /*
      Native browser fullscreen:
        document.fullscreenElement controls the actual state.

      Fallback fullscreen:
        Used only if the browser Fullscreen API is unavailable
        or refuses the request.
    */

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.warn("Could not exit browser fullscreen:", error);
      }

      fullscreenFallback = false;
      updateFullscreenUI();
      return;
    }

    if (fullscreenFallback) {
      fullscreenFallback = false;
      updateFullscreenUI();
      return;
    }

    try {
      if (typeof app.requestFullscreen === "function") {
        await app.requestFullscreen();

        /*
          Do NOT add the fullscreen CSS classes here.
          fullscreenchange will update the UI after the browser
          has actually entered fullscreen.
        */

        updateFullscreenUI();
        return;
      }

      throw new Error("Fullscreen API unavailable.");
    } catch (error) {
      console.warn("Fullscreen request failed:", error);

      /*
        CSS-only fallback.
        This is still the same player; it simply uses all
        available viewport space without changing the app state.
      */
      fullscreenFallback = true;
      updateFullscreenUI();
    }
  }

  function updateFullscreenUI() {
    const app = document.getElementById("musicApp");
    const button = el.fullscreenButton;

    const isBrowserFullscreen =
      Boolean(document.fullscreenElement);

    const isFullscreen =
      isBrowserFullscreen ||
      fullscreenFallback;

    if (button) {
      button.textContent =
        isFullscreen
          ? "⛶ Exit Full Screen"
          : "⛶ Full Screen";

      button.title =
        isFullscreen
          ? "Exit Full Screen"
          : "Full Screen";
    }

    if (app) {
      app.classList.toggle(
        "app-fullscreen",
        isFullscreen
      );

      app.classList.toggle(
        "browser-fullscreen",
        isFullscreen
      );
    }

    if (el.fullscreenHint) {
      el.fullscreenHint.style.display =
        isFullscreen ? "none" : "";
    }
  }

  function startVisualizer() {
    if (animationStarted || !analyser) return;
    animationStarted = true;

    const canvas = el.visualizer;
    const ctx = canvas.getContext("2d");
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let lastWidth = 0;
    let lastHeight = 0;
    let lastDPR = 0;

    function resizeIfNeeded() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));

      if (width !== lastWidth || height !== lastHeight || dpr !== lastDPR) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lastWidth = width;
        lastHeight = height;
        lastDPR = dpr;
      }

      return { width: rect.width, height: rect.height };
    }

    function render() {
      requestAnimationFrame(render);
      const { width, height } = resizeIfNeeded();

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, width, height);

      const bars = 64;
      const gap = 3;
      const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);

      for (let i = 0; i < bars; i++) {
        const dataIndex = Math.floor(i * dataArray.length / bars);
        let value = dataArray[dataIndex] / 255;

        if (i < 12) value = Math.min(1, value * 1.25);

        const barHeight = Math.max(3, value * height * 0.92);
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const position = i / (bars - 1);

        let hue;
        if (position < 0.5) {
          hue = 240 - (position * 2 * 120);
        } else {
          hue = 120 - ((position - 0.5) * 2 * 120);
        }

        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, `hsla(${hue},100%,72%,1)`);
        gradient.addColorStop(0.45, `hsla(${hue},100%,58%,0.95)`);
        gradient.addColorStop(1, `hsla(${hue},100%,38%,0.20)`);

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 14;
        ctx.shadowColor = `hsla(${hue},100%,60%,0.85)`;

        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, barWidth, barHeight, 4);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();

        ctx.shadowBlur = 0;
      }
    }

    render();
  }

  async function loadMusicStore() {
    try {
      const playlistURL = new URL("./music/playlist.json", document.baseURI).href + "?v=" + Date.now();
      const response = await fetch(playlistURL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const songs = Array.isArray(payload) ? payload : payload.songs;

      musicLibrary = (songs || [])
        .filter(song => song && song.src)
        .map(song => ({
          src: String(song.src),
          title: song.title || getSongName(song.src),
          artist: song.artist || "",
          album: song.album || "",
          cover: song.cover || "",
          name: song.name || song.src.split("/").pop()
        }));

      el.storeStatus.textContent = musicLibrary.length
        ? `${musicLibrary.length} song${musicLibrary.length === 1 ? "" : "s"} in music store`
        : "Music store is empty. Check music/playlist.json.";
    } catch {
      musicLibrary = [];
      el.storeStatus.textContent =
        "Music store not loaded yet. Add songs to /music and regenerate playlist.json.";
    }

    renderMusicList(el.searchInput.value);
  }

  function addLocalFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => supportedAudio(file.name));

    if (!files.length) {
      showToast("No supported audio files found.");
      return;
    }

    const localSongs = files.map(file => ({
      title: getSongName(file),
      artist: "",
      album: "",
      name: file.name,
      src: "",
      cover: "",
      _localFile: file
    }));

    const firstLocalIndex = musicLibrary.length;
    musicLibrary = musicLibrary.concat(localSongs);
    renderMusicList(el.searchInput.value);

    showToast(`${files.length} local song${files.length === 1 ? "" : "s"} added.`);
    if (currentIndex < 0) playSong(firstLocalIndex);
  }

  function wireEvents() {
    el.searchInput.addEventListener("input", event => {
      renderMusicList(event.target.value);
    });

    el.folderUpload.addEventListener("change", event => {
      addLocalFiles(event.target.files);
      event.target.value = "";
    });

    el.playButton.addEventListener("click", togglePlay);
    el.previousButton.addEventListener("click", previousSong);
    el.nextButton.addEventListener("click", nextSong);
    el.backButton.addEventListener("click", skipBackward);
    el.forwardButton.addEventListener("click", skipForward);

    el.shuffleButton.addEventListener("click", () => {
      shuffle = !shuffle;
      persistModes();
      updateModeButtons();
    });

    el.autoplayButton.addEventListener("click", () => {
      autoplay = !autoplay;
      persistModes();
      updateModeButtons();
      savePlayerState();
    });

    el.repeatButton.addEventListener("click", () => {
      repeat = !repeat;
      persistModes();
      updateModeButtons();
      savePlayerState();
    });

    el.equalizerButton.addEventListener("click", toggleEqualizer);
    el.fullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenUI);
    el.eqCloseButton.addEventListener("click", closeEqualizer);
    el.eqSaveCloseButton.addEventListener("click", saveEQAndClose);

    el.eqResetButton.addEventListener("click", () => {
      el.equalizerPreset.value = "flat";
      applyEQPreset("flat");
    });

    el.equalizerPreset.addEventListener("change", event => {
      applyEQPreset(event.target.value);
    });

    el.progress.addEventListener("input", event => {
      if (!Number.isFinite(audio.duration)) return;
      audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    });

    audio.addEventListener("loadedmetadata", () => {
      el.duration.textContent = formatTime(audio.duration);
      if (pendingRestoreTime > 0 && pendingRestoreTime < audio.duration) {
        try { audio.currentTime = pendingRestoreTime; } catch {}
        pendingRestoreTime = 0;
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        el.progress.value = String((audio.currentTime / audio.duration) * 100);
      }
      el.currentTime.textContent = formatTime(audio.currentTime);
      el.duration.textContent = formatTime(audio.duration);
      savePlayerState();
    });

    audio.addEventListener("play", () => {
      resumeAudioContext();
      updatePlayButton();
      savePlayerState();
    });

    audio.addEventListener("pause", () => {
      updatePlayButton();
      savePlayerState();
    });

    audio.addEventListener("ended", () => {
      if (repeat) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else if (autoplay) {
        nextSong();
      } else {
        updatePlayButton();
        savePlayerState();
      }
    });

    window.addEventListener("beforeunload", savePlayerState);

    document.addEventListener("keydown", event => {
      if (event.target && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "ArrowRight") {
        skipForward();
      } else if (event.code === "ArrowLeft") {
        skipBackward();
      } else if (event.code === "ArrowDown") {
        nextSong();
      } else if (event.code === "ArrowUp") {
        previousSong();
      } else if (event.code === "Escape" && equalizerOpen) {
        closeEqualizer();
      } else if (event.code === "Escape" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        updatePlayButton();
      }
    });
  }

  async function init() {
    cacheElements();
    setupEQUI();
    const playerState = restoreModes();
    setGeneratedWallpaper("My Music");
    wireEvents();
    await loadMusicStore();
    await restorePermanentPlayerState(playerState);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
