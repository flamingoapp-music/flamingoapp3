document.addEventListener("DOMContentLoaded", function () {
  const selectedPlatform = "youtubeInsights";

  // ✅ Fallback cover (ruta web relativa, NO ruta Windows)
  const DEFAULT_COVER = "images/backgroundlogo.png";

  // ✅ Debe coincidir con tu export del extractor:
  // yt_insights_<cc>.json  (ej: yt_insights_us.json)
  const platformOptions = {
    youtubeInsights: "DATABASES/ALL_JSON/yt_insights_"
  };

  // ✅ Debe coincidir con los JSON que exporta YOUTUBE_NEWEXTRACT:
  // YOUTUBE_SI.json / YOUTUBE_TS.json / YOUTUBE_SP.json / YOUTUBE_ARTIST_FEATURES.json
  const siTsFiles = {
    youtubeInsights: {
      si: "DATABASES/ALL_JSON/YOUTUBE_SI.json",
      ts: "DATABASES/ALL_JSON/YOUTUBE_TS.json",
      sp: "DATABASES/ALL_JSON/YOUTUBE_SP.json",
      af: "DATABASES/ALL_JSON/YOUTUBE_ARTIST_FEATURES.json"
    }
  };

  const platformNameMap = {
    youtubeInsights: "YouTube Insights"
  };

  const platformLogos = {
    youtubeInsights:
      "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg"
  };

  const { si, ts, sp, af } = siTsFiles[selectedPlatform];

  function loadCountryData(countryCode) {
    const dataFile = `${platformOptions[selectedPlatform]}${countryCode}.json`;

    console.log("[LOAD] dataFile:", dataFile);
    console.log("[LOAD] si/ts/sp/af:", si, ts, sp, af);

    document.getElementById("countryName").textContent =
      `${platformNameMap[selectedPlatform].toUpperCase()} ${countryCode.toUpperCase()}`;
    document.getElementById("platformLogo").src = platformLogos[selectedPlatform];
    document.getElementById("platformLogo").alt = platformNameMap[selectedPlatform];

    const icon = document.getElementById("countryIcon");
    if (countryCode.toLowerCase() === "us") {
      icon.style.display = "none";
    } else {
      icon.src = `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
      icon.style.display = "inline";
    }

    const fetchJSON = (url) =>
      fetch(url).then((r) => {
        if (!r.ok) {
          throw new Error(`Fetch failed ${r.status} for ${url}`);
        }
        return r.json();
      });

    const fetches = [
      fetchJSON(dataFile),
      fetchJSON(si),
      fetchJSON(ts),
      fetchJSON(sp),
      fetchJSON(af)
    ];

    Promise.all(fetches)
      .then(([data, siData, tsData, spData, artistFeatures]) => {
        // ✅ Normaliza claves a string para evitar mismatch (number vs string)
        const spMap = Object.fromEntries(
          (spData || []).map((d) => [String(d.SongID), d.Spotify_URL])
        );
        const siMap = Object.fromEntries(
          (siData || []).map((d) => [String(d.SongID), d])
        );
        const tsMap = Object.fromEntries(
          (tsData || []).map((d) => [String(d.SongID), d])
        );

        const artistMapByID = Object.fromEntries(
          (artistFeatures || []).map((a) => [String(a.ArtistID), a])
        );

        const merged = (data || []).map((entry) => {
          const id = String(entry.SongID);

          const artistIDs = (siMap[id]?.ArtistID || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);

          const artistLinks = [];
          artistIDs.forEach((aid) => {
            const artistObj = artistMapByID[aid];
            if (artistObj) {
              artistLinks.push({
                name: artistObj.Artist,
                url: artistObj.SpotifyURL || null
              });
            }
          });

          const coverCandidate = tsMap[id]?.CoverImage;
          const finalCover =
            typeof coverCandidate === "string" && coverCandidate.trim() !== ""
              ? coverCandidate
              : DEFAULT_COVER;

          return {
            SongID: id,
            Position: Number(entry.Position ?? 0),
            Title: siMap[id]?.Title || "Unknown Title",
            ArtistNames: artistLinks.length ? artistLinks : [{ name: siMap[id]?.Artist || "Unknown Artist", url: null }],
            CoverImage: finalCover,
            SpotifyURL: spMap[id] || null
          };
        });

        const finalList = merged
          .sort((a, b) => a.Position - b.Position)
          .slice(0, 100);

        updateSongListUI(finalList);
      })
      .catch((err) => {
        console.error("Error loading data:", err);
        const el = document.getElementById("songList");
        if (el) {
          el.innerHTML = `<li>Error loading ${countryCode.toUpperCase()} data.<br>${String(
            err.message || err
          )}</li>`;
        }
      });
  }

  const countrySelect = document.getElementById("countrySelect");
  if (countrySelect) {
    countrySelect.addEventListener("change", function () {
      loadCountryData(this.value);
    });
  }

  // ✅ Default
  loadCountryData("us");

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

      // ✅ Si la imagen falla al cargar, usa fallback
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

      // ✅ Click en cover: si ya está seleccionado, abre Spotify URL
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
});