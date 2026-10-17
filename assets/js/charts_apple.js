
document.addEventListener("DOMContentLoaded", function () {
    const selectedPlatform = "appleMusic";

    const DEFAULT_COVER = "images/backgroundlogo.png";

    const platformOptions = {
        appleMusic: "DATABASES/ALL_JSON/am_"
    };

    const siTsFiles = {
        appleMusic: {
            si: "DATABASES/ALL_JSON/SI.json",
            ts: "DATABASES/ALL_JSON/TS.json",
            sp: "DATABASES/ALL_JSON/SP.json"
        }
    };

    const platformNameMap = {
        appleMusic: "Apple Music"
    };

    const platformLogos = {
        appleMusic:
            "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg"
    };

    const { si, ts, sp } = siTsFiles[selectedPlatform];

    // ============================================================
    // GLOBAL CONTROL
    // ============================================================

    let allSongs = [];
    let visibleCount = 0;
    const batchSize = 25;
    let isLoading = false;
    let loadVersion = 0;

    // ============================================================
    // HELPERS
    // ============================================================

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function firstNonEmpty(...values) {
        for (const value of values) {
            if (
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
            ) {
                return String(value).trim();
            }
        }

        return "";
    }

    function normalizeText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    function getSongID(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "";
        }

        return String(value).trim();
    }

    async function fetchJSON(url) {
        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Could not load ${url}: HTTP ${response.status}`
            );
        }

        return response.json();
    }

    function splitArtistIDs(value) {
        return String(value || "")
            .split(",")
            .map(id => id.trim())
            .filter(Boolean);
    }

    // Artist names are resolved against known individual artist records.
    // Protect compound names (e.g. Earth, Wind & Fire) before splitting.
    function artistKey(value) {
        return normalizeText(value).replace(/[^\p{L}\p{N}]/gu, "");
    }

    function splitArtistNames(value, artistMapByName, artistIDs, artistMapByID) {
        const text = String(value || "").trim();
        if (!text) return [];

        // A composite artist record can be present in ARTIST_FEATURES.
        // Do not let it swallow several separately identified collaborators.
        const candidateRows = artistIDs.map(id => artistMapByID[id]).filter(Boolean);
        const distinctCandidates = new Set(candidateRows.map(row => artistKey(row.Artist || row.Name)));
        const isCollaboration = distinctCandidates.size > 1;
        if (!isCollaboration && artistMapByName[artistKey(text)]) return [text];

        const protectedNames = Object.values(artistMapByName)
            .map(row => firstNonEmpty(row.Artist, row.Name))
            .filter(name => name && /[,&]/.test(name))
            .filter(name => !(isCollaboration && artistKey(name) === artistKey(text)))
            .sort((a, b) => b.length - a.length);

        const tokens = [];
        let masked = text;
        for (const name of protectedNames) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(`(^|[,\\s])(${escaped})(?=$|[,\\s]|\\s*&\\s*)`, "gi");
            masked = masked.replace(pattern, (whole, prefix, found) => {
                const token = `__ARTIST_${tokens.length}__`;
                tokens.push(found);
                return prefix + token;
            });
        }
        return masked.split(/\s*,\s*|\s+&\s+/)
            .map(part => part.replace(/__ARTIST_(\d+)__/g, (_, i) => tokens[Number(i)] || ""))
            .map(part => part.trim()).filter(Boolean);
    }

    function resolveArtistLinks(rawText, artistIDs, artistMapByID, artistMapByName) {
        const names = splitArtistNames(rawText, artistMapByName, artistIDs, artistMapByID);
        const linked = [];
        const used = new Set();
        const idCandidates = artistIDs.map(id => artistMapByID[id]).filter(Boolean);

        for (const name of names) {
            const key = artistKey(name);
            // Never use a positional ID without verifying the artist identity.
            let artist = idCandidates.find(row =>
                artistKey(firstNonEmpty(row.Artist, row.Name)) === key
            );
            if (!artist) artist = artistMapByName[key] || null;
            if (artist && used.has(String(artist.ArtistID))) artist = null;
            if (artist) used.add(String(artist.ArtistID));
            linked.push({
                name: artist ? firstNonEmpty(artist.Artist, artist.Name, name) : name,
                url: artist ? firstNonEmpty(artist.SpotifyURL, artist.Spotify_URL) || null : null,
                artistId: artist?.ArtistID ?? null
            });
        }
        return linked;
    }

    // ============================================================
    // LOAD COUNTRY
    // ============================================================

    async function loadCountryData(countryCode) {
        const currentVersion = ++loadVersion;

        const dataFile =
            `${platformOptions[selectedPlatform]}${countryCode}.json`;

        const songList = document.getElementById("songList");

        allSongs = [];
        visibleCount = 0;
        isLoading = false;

        if (songList) {
            songList.innerHTML = "";
        }

        // --------------------------------------------------------
        // HEADER
        // --------------------------------------------------------

        const countryName = document.getElementById("countryName");

        if (countryName) {
            countryName.textContent =
                `${platformNameMap[selectedPlatform].toUpperCase()} ${countryCode.toUpperCase()}`;
        }

        const platformLogo = document.getElementById("platformLogo");

        if (platformLogo) {
            platformLogo.src = platformLogos[selectedPlatform];
            platformLogo.alt = platformNameMap[selectedPlatform];
        }

        const icon = document.getElementById("countryIcon");

        if (icon) {
            const code = countryCode.toLowerCase();

            if (code === "global") {
                icon.style.display = "none";
            } else {
                icon.src = `https://flagcdn.com/w40/${code}.png`;
                icon.style.display = "inline";
            }
        }

        console.log(`[APPLE MUSIC] Loading ${dataFile}`);

        try {
            // ====================================================
            // LOAD JSON FILES
            // ====================================================

            const [
                data,
                siData,
                tsData,
                spData,
                artistFeatures
            ] = await Promise.all([
                fetchJSON(dataFile),
                fetchJSON(si),
                fetchJSON(ts),
                fetchJSON(sp),
                fetchJSON(
                    "DATABASES/ALL_JSON/ARTIST_FEATURES.json"
                )
            ]);

            if (currentVersion !== loadVersion) {
                return;
            }

            if (!Array.isArray(data)) {
                throw new Error(
                    `Invalid chart JSON: ${dataFile}`
                );
            }

            // ====================================================
            // CREATE LOOKUP MAPS
            // ====================================================

            const spMap = Object.create(null);
            const siMap = Object.create(null);
            const tsMap = Object.create(null);
            const artistMapByID = Object.create(null);
            const artistMapByName = Object.create(null);

            // ----------------------------------------------------
            // SPOTIFY LINKS
            // ----------------------------------------------------

            for (const row of spData || []) {
                const id = getSongID(row.SongID);

                if (!id) continue;

                spMap[id] = firstNonEmpty(
                    row.Spotify_URL,
                    row.SpotifyURL
                );
            }

            // ----------------------------------------------------
            // SI
            // ----------------------------------------------------

            for (const row of siData || []) {
                const id = getSongID(row.SongID);

                if (!id) continue;

                siMap[id] = row;
            }

            // ----------------------------------------------------
            // TS
            // ----------------------------------------------------

            for (const row of tsData || []) {
                const id = getSongID(row.SongID);

                if (!id) continue;

                tsMap[id] = row;
            }

            // ----------------------------------------------------
            // ARTIST FEATURES
            // ----------------------------------------------------

            for (const artist of artistFeatures || []) {
                if (!artist) continue;

                if (
                    artist.ArtistID !== null &&
                    artist.ArtistID !== undefined &&
                    artist.ArtistID !== ""
                ) {
                    artistMapByID[
                        String(artist.ArtistID)
                    ] = artist;
                }

                const name = firstNonEmpty(
                    artist.Artist,
                    artist.Name
                );

                if (name) {
                    const normalized = artistKey(name);

                    if (
                        normalized &&
                        !artistMapByName[normalized]
                    ) {
                        artistMapByName[normalized] = artist;
                    }
                }
            }

            // ====================================================
            // BUILD SONG LIST
            // ====================================================
            //
            // Chart JSON is the primary source for:
            // Title, Artist and Position.
            //
            // SI / TS / SP provide fallback and enrichment.
            //
            // ArtistID is NOT required to display Artist.
            // ====================================================

            allSongs = data.map(entry => {
                const id = getSongID(entry.SongID);
                const siEntry = siMap[id] || {};

                // ------------------------------------------------
                // TITLE
                // ------------------------------------------------

                const finalTitle = firstNonEmpty(
                    entry.Title,
                    siEntry.Title,
                    "Unknown Title"
                );

                // ------------------------------------------------
                // ARTIST
                // ------------------------------------------------

                const finalArtist = firstNonEmpty(
                    entry.Artist,
                    siEntry.Artist,
                    "Unknown Artist"
                );

                // ------------------------------------------------
                // ARTIST IDs
                // ------------------------------------------------

                const artistIDs = splitArtistIDs(
                    firstNonEmpty(
                        entry.ArtistID,
                        siEntry.ArtistID
                    )
                );

                // ------------------------------------------------
                // ARTIST NAMES
                // ------------------------------------------------

                const artistLinks = resolveArtistLinks(
                    finalArtist, artistIDs, artistMapByID, artistMapByName
                );

                // ------------------------------------------------
                // COVER
                // ------------------------------------------------

                const coverCandidate = firstNonEmpty(
                    entry.CoverImage,
                    tsMap[id]?.CoverImage
                );

                const finalCover =
                    coverCandidate || DEFAULT_COVER;

                // ------------------------------------------------
                // SPOTIFY URL
                // ------------------------------------------------

                const spotifyURL = firstNonEmpty(
                    entry.Spotify_URL,
                    entry.SpotifyURL,
                    spMap[id]
                ) || null;

                // ------------------------------------------------
                // FINAL SONG
                // ------------------------------------------------

                return {
                    SongID: id,
                    Position: entry.Position,
                    Title: finalTitle,
                    Artist: finalArtist,
                    ArtistNames: artistLinks,
                    CoverImage: finalCover,
                    SpotifyURL: spotifyURL
                };
            }).sort(
                (a, b) =>
                    (Number(a.Position) || 999999) -
                    (Number(b.Position) || 999999)
            );

            // ====================================================
            // DEBUG
            // ====================================================

            console.log(
                `[APPLE MUSIC] ${allSongs.length} songs prepared`
            );

            const patientZero = allSongs.filter(
                song =>
                    normalizeText(song.Title) ===
                    "patient zero"
            );

            if (patientZero.length > 0) {
                console.table(
                    patientZero.map(song => ({
                        SongID: song.SongID,
                        Position: song.Position,
                        Title: song.Title,
                        Artist: song.Artist
                    }))
                );
            }

            // ====================================================
            // RESET
            // ====================================================

            if (songList) {
                songList.innerHTML = "";
            }

            visibleCount = 0;
            isLoading = false;

            loadMoreSongs();

        } catch (err) {
            if (currentVersion !== loadVersion) {
                return;
            }

            console.error("[APPLE MUSIC ERROR]", err);

            if (songList) {
                songList.textContent =
                    `Error loading ${countryCode.toUpperCase()} data.`;
            }
        }
    }

    // ============================================================
    // LOAD MORE
    // ============================================================

    async function loadMoreSongs() {
        if (isLoading) return;

        if (visibleCount >= allSongs.length) {
            return;
        }

        isLoading = true;

        const currentVersion = loadVersion;

        const nextBatch = allSongs.slice(
            visibleCount,
            visibleCount + batchSize
        );

        for (const song of nextBatch) {
            if (currentVersion !== loadVersion) {
                return;
            }

            appendSong(song);
            await delay(5);
        }

        if (currentVersion !== loadVersion) {
            return;
        }

        visibleCount += nextBatch.length;

        console.log(
            `[APPLE MUSIC DISPLAY] ${visibleCount}/${allSongs.length}`
        );

        isLoading = false;

        // Load another batch if the page is still short.
        if (
            visibleCount < allSongs.length &&
            document.documentElement.scrollHeight <=
                window.innerHeight + 400
        ) {
            loadMoreSongs();
        }
    }

    // ============================================================
    // APPEND SONG
    // ============================================================

    function appendSong(song) {
        const songList = document.getElementById("songList");

        if (!songList) return;

        const li = document.createElement("li");

        // --------------------------------------------------------
        // RANK
        // --------------------------------------------------------

        const rank = document.createElement("div");
        rank.className = "song-rank";
        rank.textContent = `${song.Position}.`;

        // --------------------------------------------------------
        // COVER
        // --------------------------------------------------------

        const img = document.createElement("img");

        img.src = song.CoverImage || DEFAULT_COVER;
        img.alt = `${song.Title} Cover`;

        img.onerror = () => {
            img.onerror = null;
            img.src = DEFAULT_COVER;
        };

        // --------------------------------------------------------
        // INFO
        // --------------------------------------------------------

        const info = document.createElement("div");
        info.className = "song-info-list";

        // --------------------------------------------------------
        // TITLE
        // --------------------------------------------------------

        const title = document.createElement("span");
        title.className = "song-title";
        title.textContent = song.Title || "Unknown Title";

        // --------------------------------------------------------
        // ARTIST
        // --------------------------------------------------------

        const artistContainer = document.createElement("div");
        artistContainer.className = "song-artist";

        if (
            Array.isArray(song.ArtistNames) &&
            song.ArtistNames.length > 0
        ) {
            song.ArtistNames.forEach((artistObj, index) => {
                if (artistObj.url) {
                    const link = document.createElement("a");

                    link.href = artistObj.url;
                    link.textContent = artistObj.name;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";

                    // Preserve original styling.
                    link.style.color = "#3498db";
                    link.style.textDecoration = "underline";

                    link.addEventListener("click", event => {
                        event.stopPropagation();
                    });

                    artistContainer.appendChild(link);
                } else {
                    const span = document.createElement("span");
                    span.textContent = artistObj.name;

                    artistContainer.appendChild(span);
                }

                if (index < song.ArtistNames.length - 1) {
                    artistContainer.appendChild(
                        document.createTextNode(", ")
                    );
                }
            });
        } else {
            artistContainer.textContent =
                song.Artist || "Unknown Artist";
        }

        info.appendChild(title);
        info.appendChild(artistContainer);

        li.appendChild(rank);
        li.appendChild(img);
        li.appendChild(info);

        // --------------------------------------------------------
        // SELECT
        // --------------------------------------------------------

        li.addEventListener("click", () => {
            document.querySelectorAll(".song-list li")
                .forEach(el => {
                    el.classList.remove("selected");
                });

            li.classList.add("selected");
        });

        // --------------------------------------------------------
        // OPEN SPOTIFY
        // --------------------------------------------------------

        if (song.SpotifyURL) {
            img.style.cursor = "pointer";

            img.addEventListener("click", event => {
                event.stopPropagation();

                const isSelected =
                    li.classList.contains("selected");

                if (!isSelected) {
                    document.querySelectorAll(".song-list li")
                        .forEach(el => {
                            el.classList.remove("selected");
                        });

                    li.classList.add("selected");
                } else {
                    window.open(
                        song.SpotifyURL,
                        "_blank",
                        "noopener,noreferrer"
                    );
                }
            });
        }

        songList.appendChild(li);
    }

    // ============================================================
    // SCROLL
    // ============================================================

    window.addEventListener(
        "scroll",
        () => {
            const scrollTop = window.scrollY;
            const windowHeight = window.innerHeight;
            const docHeight =
                document.documentElement.scrollHeight;

            if (
                scrollTop + windowHeight >=
                docHeight - 400
            ) {
                if (visibleCount < allSongs.length) {
                    loadMoreSongs();
                }
            }
        },
        { passive: true }
    );

    // ============================================================
    // COUNTRY SELECT
    // ============================================================

    const countrySelect =
        document.getElementById("countrySelect");

    if (countrySelect) {
        countrySelect.addEventListener(
            "change",
            function () {
                loadCountryData(this.value);
            }
        );
    }

    // ============================================================
    // INITIAL LOAD
    // ============================================================

    const initialCountry =
        countrySelect?.value || "global";

    loadCountryData(initialCountry);
});
