document.addEventListener("DOMContentLoaded", function () {
  // =========================
  // CONFIG
  // =========================
  const selectedPlatform = "youtubeInsights";
  const DEFAULT_COVER = "images/backgroundlogo.png";

  const platformOptions = {
    youtubeInsights: "DATABASES/ALL_JSON/yt_"
  };

  const siTsFiles = {
    youtubeInsights: {
      siPrimary: "DATABASES/ALL_JSON/YOUTUBE_SI.json",
      tsPrimary: "DATABASES/ALL_JSON/YOUTUBE_TS.json",
      spPrimary: "DATABASES/ALL_JSON/YOUTUBE_SP.json",
      afPrimary: "DATABASES/ALL_JSON/YOUTUBE_ARTIST_FEATURES.json",

      siFallback: "DATABASES/ALL_JSON/SI.json",
      tsFallback: "DATABASES/ALL_JSON/TS.json",
      spFallback: "DATABASES/ALL_JSON/SP.json",
      afFallback: "DATABASES/ALL_JSON/ARTIST_FEATURES.json"
    }
  };

  const platformNameMap = {
    youtubeInsights: "YouTube Insights"
  };

  const platformLogos = {
    youtubeInsights:
      "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg"
  };

  // =========================
  // GLOBAL CONTROL
  // =========================
  let allSongs = [];
  let visibleCount = 0;
  const batchSize = 25;
  let isLoading = false;

  // =========================
  // HELPERS
  // =========================
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const fetchJSONStrict = (url) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
      return r.json();
    });

  const fetchJSONWithFallback = async (primaryUrl, fallbackUrl, fallbackValue = []) => {
    try {
      return await fetchJSONStrict(primaryUrl);
    } catch (e1) {
      console.warn("[FALLBACK]", e1.message);
      try {
        return await fetchJSONStrict(fallbackUrl);
      } catch (e2) {
        console.warn("[FALLBACK FAILED]", e2.message);
        return fallbackValue;
      }
    }
  };

  const normalizeStr = (v) => (v === null || v === undefined ? "" : String(v));

  function setHeader(countryCode) {
    const nameEl = document.getElementById("countryName");
    const logoEl = document.getElementById("platformLogo");
    const iconEl = document.getElementById("countryIcon");

    if (nameEl) {
      nameEl.textContent = `${platformNameMap[selectedPlatform].toUpperCase()} ${countryCode.toUpperCase()}`;
    }

    if (logoEl) {
      logoEl.src = platformLogos[selectedPlatform];
      logoEl.alt = platformNameMap[selectedPlatform];
    }

    if (iconEl) {
      if (countryCode.toLowerCase() === "us") {
        iconEl.style.display = "none";
      } else {
        iconEl.src = `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
        iconEl.style.display = "inline";
      }
    }
  }

  // =========================
  // MAIN LOADER
  // =========================
  async function loadCountryData(countryCode) {
    const dataFile = `${platformOptions[selectedPlatform]}${countryCode}.json`;
    const cfg = siTsFiles[selectedPlatform];

    console.log("[LOAD] dataFile:", dataFile);
    console.log("[LOAD] primary:", cfg.siPrimary, cfg.tsPrimary, cfg.spPrimary, cfg.afPrimary);
    console.log("[LOAD] fallback:", cfg.siFallback, cfg.tsFallback, cfg.spFallback, cfg.afFallback);

    setHeader(countryCode);

    try {
      const data = await fetchJSONStrict(dataFile);

      const [siData, tsData, spData, artistFeatures] = await Promise.all([
        fetchJSONWithFallback(cfg.siPrimary, cfg.siFallback, []),
        fetchJSONWithFallback(cfg.tsPrimary, cfg.tsFallback, []),
        fetchJSONWithFallback(cfg.spPrimary, cfg.spFallback, []),
        fetchJSONWithFallback(cfg.afPrimary, cfg.afFallback, [])
      ]);

      const spMap = Object.fromEntries(
        (spData || []).map((d) => [normalizeStr(d.SongID), d.Spotify_URL || d.SpotifyURL || null])
      );

      const siMap = Object.fromEntries(
        (siData || []).map((d) => [normalizeStr(d.SongID), d])
      );

      const tsMap = Object.fromEntries(
        (tsData || []).map((d) => [normalizeStr(d.SongID), d])
      );

      const artistMapByID = Object.fromEntries(
        (artistFeatures || []).map((a) => [normalizeStr(a.ArtistID), a])
      );

      allSongs = (data || [])
        .map((entry) => {
          const id = normalizeStr(entry.SongID);

          const artistIDs = normalizeStr(siMap[id]?.ArtistID)
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);

          const artistLinks = [];
          artistIDs.forEach((aid) => {
            const artistObj = artistMapByID[aid];
            if (artistObj) {
              artistLinks.push({
                name: artistObj.Artist || "Unknown Artist",
                url: artistObj.SpotifyURL || null
              });
            }
          });

          const fallbackArtist = normalizeStr(siMap[id]?.Artist) || "Unknown Artist";

          const coverCandidate = tsMap[id]?.CoverImage;
          const finalCover =
            typeof coverCandidate === "string" && coverCandidate.trim() !== ""
              ? coverCandidate
              : DEFAULT_COVER;

          return {
            SongID: id,
            Position: Number(entry.Position ?? 0),
            Title: normalizeStr(siMap[id]?.Title) || "Unknown Title",
            ArtistNames: artistLinks.length ? artistLinks : [{ name: fallbackArtist, url: null }],
            CoverImage: finalCover,
            SpotifyURL: spMap[id] || null
          };
        })
        .sort((a, b) => a.Position - b.Position);

      const songList = document.getElementById("songList");
      if (songList) {
        songList.innerHTML = "";
      }

      visibleCount = 0;
      isLoading = false;

      loadMoreSongs();
    } catch (err) {
      console.error("Error loading data:", err);
      const el = document.getElementById("songList");
      if (el) {
        el.innerHTML = `<li>Error loading ${countryCode.toUpperCase()} data.<br>${String(
          err.message || err
        )}</li>`;
      }
    }
  }

  // =========================
  // BATCH LOADER
  // =========================
  async function loadMoreSongs() {
    if (isLoading) return;

    isLoading = true;

    const nextBatch = allSongs.slice(visibleCount, visibleCount + batchSize);

    if (nextBatch.length === 0) {
      isLoading = false;
      return;
    }

    for (const song of nextBatch) {
      appendSong(song);
      await delay(5);
    }

    visibleCount += batchSize;
    isLoading = false;

    setTimeout(() => {}, 500);
  }

  // =========================
  // UI RENDER
  // =========================
  function appendSong(song) {
    const songList = document.getElementById("songList");
    if (!songList) return;

    const li = document.createElement("li");

    const rank = document.createElement("div");
    rank.className = "song-rank";
    rank.textContent = `${song.Position}.`;

    const img = document.createElement("img");
    img.src = song.CoverImage;
    img.alt = `${song.Title} Cover`;

    img.onerror = () => {
      img.src = DEFAULT_COVER;
    };

    const info = document.createElement("div");
    info.className = "song-info-list";

    const title = document.createElement("span");
    title.className = "song-title";
    title.textContent = song.Title;

    const artistContainer = document.createElement("div");
    artistContainer.className = "song-artist";

    (song.ArtistNames || []).forEach((artistObj, index) => {
      if (artistObj.url) {
        const link = document.createElement("a");
        link.href = artistObj.url;
        link.textContent = artistObj.name;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.color = "#3498db";
        link.style.textDecoration = "underline";
        artistContainer.appendChild(link);
      } else {
        const span = document.createElement("span");
        span.textContent = artistObj.name;
        artistContainer.appendChild(span);
      }

      if (index < song.ArtistNames.length - 1) {
        artistContainer.appendChild(document.createTextNode(", "));
      }
    });

    info.appendChild(title);
    info.appendChild(artistContainer);

    li.appendChild(rank);
    li.appendChild(img);
    li.appendChild(info);

    li.addEventListener("click", () => {
      document
        .querySelectorAll(".song-list li")
        .forEach((el) => el.classList.remove("selected"));
      li.classList.add("selected");
    });

    if (song.SpotifyURL) {
      img.style.cursor = "pointer";
      img.addEventListener("click", () => {
        const isSelected = li.classList.contains("selected");

        if (!isSelected) {
          document
            .querySelectorAll(".song-list li")
            .forEach((el) => el.classList.remove("selected"));
          li.classList.add("selected");
        } else {
          window.open(song.SpotifyURL, "_blank");
        }
      });
    }

    songList.appendChild(li);
  }

  // =========================
  // EVENTS
  // =========================
  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const docHeight = document.body.offsetHeight;

    if (scrollTop + windowHeight >= docHeight - 400) {
      if (visibleCount < allSongs.length) {
        loadMoreSongs();
      }
    }
  });

  const countrySelect = document.getElementById("countrySelect");
  if (countrySelect) {
    countrySelect.addEventListener("change", function () {
      loadCountryData(this.value);
    });
  }

  loadCountryData("us");
});