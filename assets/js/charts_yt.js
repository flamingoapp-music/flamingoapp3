document.addEventListener("DOMContentLoaded", function () {
  // =========================
  // CONFIG
  // =========================
  const selectedPlatform = "youtubeInsights";

  // Fallback cover (ruta web relativa, NO ruta Windows)
  const DEFAULT_COVER = "images/backgroundlogo.png";

  // ✅ Country JSON naming produced by your extractor:
  // yt_insights_<cc>.json  (ex: yt_insights_us.json)
  const platformOptions = {
    youtubeInsights: "DATABASES/ALL_JSON/yt_insights_"
  };

  // ✅ IMPORTANT:
  // Many times your web has SI.json / TS.json / SP.json / ARTIST_FEATURES.json
  // while the extractor may create YOUTUBE_SI.json / YOUTUBE_TS.json / etc.
  //
  // This code AUTO-FALLBACKS:
  // - First tries YOUTUBE_*.json
  // - If 404, falls back to the generic ones: SI.json / TS.json / SP.json / ARTIST_FEATURES.json
  const siTsFiles = {
    youtubeInsights: {
      // prefer youtube-specific
      siPrimary: "DATABASES/ALL_JSON/YOUTUBE_SI.json",
      tsPrimary: "DATABASES/ALL_JSON/YOUTUBE_TS.json",
      spPrimary: "DATABASES/ALL_JSON/YOUTUBE_SP.json",
      afPrimary: "DATABASES/ALL_JSON/YOUTUBE_ARTIST_FEATURES.json",

      // fallback to shared/global
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
  // HELPERS
  // =========================
  const fetchJSONStrict = (url) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
      return r.json();
    });

  // Tries primary; if fails (404 etc) uses fallback.
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
      // 1) fetch country data (must exist)
      const data = await fetchJSONStrict(dataFile);

      // 2) fetch SI/TS/SP/AF with fallback logic
      const [siData, tsData, spData, artistFeatures] = await Promise.all([
        fetchJSONWithFallback(cfg.siPrimary, cfg.siFallback, []),
        fetchJSONWithFallback(cfg.tsPrimary, cfg.tsFallback, []),
        fetchJSONWithFallback(cfg.spPrimary, cfg.spFallback, []),
        fetchJSONWithFallback(cfg.afPrimary, cfg.afFallback, [])
      ]);

      // Normalize keys to string to avoid number vs string mismatches
      const spMap = Object.fromEntries(
        (spData || []).map((d) => [normalizeStr(d.SongID), d.Spotify_URL || d.SpotifyURL || null])
      );
      const siMap = Object.fromEntries(
        (siData || []).map((d) => [normalizeStr(d.SongID), d])
      );
      const tsMap = Object.fromEntries(
        (tsData || []).map((d) => [normalizeStr(d.SongID), d])
      );

      // Artist map by ArtistID (string)
      const artistMapByID = Object.fromEntries(
        (artistFeatures || []).map((a) => [normalizeStr(a.ArtistID), a])
      );

      // Merge rows
      const merged = (data || []).map((entry) => {
        const id = normalizeStr(entry.SongID);

        // ArtistIDs from SI (comma-separated)
        const artistIDs = normalizeStr(siMap[id]?.ArtistID)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        // Build artist links
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

        // Fallback: if no ArtistID mapping, show SI Artist
        const fallbackArtist = normalizeStr(siMap[id]?.Artist) || "Unknown Artist";

        // Cover image robust fallback
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
      });

      const finalList = merged
        .sort((a, b) => a.Position - b.Position)
        .slice(0, 100);

      updateSongListUI(finalList);
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
  // UI RENDER
  // =========================
  function updateSongListUI(songs) {
    const songList = document.getElementById("songList");
    if (!songList) return;

    songList.innerHTML = "";

    songs.forEach((song) => {
      const li = document.createElement("li");

      const rank = document.createElement("div");
      rank.className = "song-rank";
      rank.textContent = `${song.Position}.`;

      const img = document.createElement("img");
      img.src = song.CoverImage;
      img.alt = `${song.Title} Cover`;

      // If image fails -> fallback
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

      // Click selects row
      li.addEventListener("click", () => {
        document
          .querySelectorAll(".song-list li")
          .forEach((el) => el.classList.remove("selected"));
        li.classList.add("selected");
      });

      // Cover click: first selects, second opens Spotify URL (if exists)
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
    });
  }

  // =========================
  // EVENTS
  // =========================
  const countrySelect = document.getElementById("countrySelect");
  if (countrySelect) {
    countrySelect.addEventListener("change", function () {
      loadCountryData(this.value);
    });
  }

  // Default load
  loadCountryData("us");
});