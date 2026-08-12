document.addEventListener("DOMContentLoaded", function () {
    const JSON_BASE = "DATABASES/ALL_JSON/";

    /*
     * MASTER V4:
     * JSON_UPDATE_MASTER.py exports lowercase chart filenames:
     *
     * billboard_hot100.json
     * billboard_global200.json
     *
     * GitHub Pages is case-sensitive, so do not use
     * BILLBOARD_hot100.json / BILLBOARD_global200.json here.
     */
    const chartOptions = {
        hot100: [
            JSON_BASE + "billboard_hot100.json",
            JSON_BASE + "BILLBOARD_hot100.json"
        ],
        global200: [
            JSON_BASE + "billboard_global200.json",
            JSON_BASE + "BILLBOARD_global200.json"
        ]
    };

    const supportFiles = {
        si: [
            JSON_BASE + "BILLBOARD_SI.json",
            JSON_BASE + "SI.json"
        ],
        ts: [
            JSON_BASE + "BILLBOARD_TS.json",
            JSON_BASE + "TS.json"
        ],
        sp: [
            JSON_BASE + "BILLBOARD_SP.json",
            JSON_BASE + "SP.json"
        ],
        artist: [
            JSON_BASE + "BILLBOARD_ARTIST_FEATURES.json",
            JSON_BASE + "ARTIST_FEATURES.json"
        ]
    };

    const chartNameMap = {
        hot100: "Billboard Hot 100",
        global200: "Billboard Global 200"
    };

    const platformLogoUrl =
        "https://upload.wikimedia.org/wikipedia/commons/4/40/Billboard_logo.svg";

    async function fetchJson(url) {
        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${url}`);
        }

        return response.json();
    }

    async function fetchFirstAvailable(urls, label, required = true) {
        let lastError = null;

        for (const url of urls) {
            try {
                const data = await fetchJson(url);

                console.log(
                    `[Billboard] ${label} loaded:`,
                    url,
                    Array.isArray(data) ? `${data.length} rows` : "object"
                );

                return data;
            } catch (error) {
                lastError = error;
                console.warn(
                    `[Billboard] ${label} failed:`,
                    url,
                    error.message
                );
            }
        }

        if (required) {
            throw lastError || new Error(
                `No ${label} JSON could be loaded.`
            );
        }

        console.warn(
            `[Billboard] Optional ${label} unavailable. Continuing with chart data.`
        );

        return [];
    }

    function makeMap(rows, keyName) {
        const map = new Map();

        (rows || []).forEach(row => {
            const key = row?.[keyName];

            if (key === null || key === undefined || key === "") {
                return;
            }

            map.set(String(key), row);
        });

        return map;
    }

    function normalizeArtistIDs(value) {
        if (Array.isArray(value)) {
            return value
                .map(String)
                .map(x => x.trim())
                .filter(Boolean);
        }

        return String(value || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);
    }

    function fallbackArtistLinks(artistText) {
        const name = String(artistText || "").trim();

        if (!name) {
            return [];
        }

        return [{
            name,
            url: null
        }];
    }

    async function loadChartData(chartCode) {
        const chartFiles = chartOptions[chartCode];

        if (!chartFiles) {
            console.error("Chart code no reconocido:", chartCode);
            return;
        }

        const titleEl = document.getElementById("countryName");
        const logoEl = document.getElementById("platformLogo");
        const icon = document.getElementById("countryIcon");
        const songList = document.getElementById("songList");

        if (titleEl) {
            titleEl.textContent =
                chartNameMap[chartCode] || chartCode;
        }

        if (logoEl) {
            logoEl.src = platformLogoUrl;
            logoEl.alt = "Billboard";
        }

        if (icon) {
            icon.style.display = "none";
        }

        if (songList) {
            songList.innerHTML =
                "<li>Loading Billboard data...</li>";
        }

        try {
            /*
             * Only the chart JSON is mandatory.
             *
             * SI / TS / SP / ARTIST_FEATURES are optional enrichment.
             * A missing support file must NOT blank the whole Billboard page.
             */
            const [
                data,
                siData,
                tsData,
                spData,
                artistFeatures
            ] = await Promise.all([
                fetchFirstAvailable(
                    chartFiles,
                    "chart",
                    true
                ),
                fetchFirstAvailable(
                    supportFiles.si,
                    "SI",
                    false
                ),
                fetchFirstAvailable(
                    supportFiles.ts,
                    "TS",
                    false
                ),
                fetchFirstAvailable(
                    supportFiles.sp,
                    "SP",
                    false
                ),
                fetchFirstAvailable(
                    supportFiles.artist,
                    "ARTIST_FEATURES",
                    false
                )
            ]);

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error(
                    `Billboard ${chartCode} JSON is empty.`
                );
            }

            const siMap = makeMap(siData, "SongID");
            const tsMap = makeMap(tsData, "SongID");
            const spMap = makeMap(spData, "SongID");
            const artistMapByID =
                makeMap(artistFeatures, "ArtistID");

            const merged = data.map((entry, index) => {
                const id = String(entry?.SongID ?? "");
                const si = siMap.get(id) || {};
                const ts = tsMap.get(id) || {};
                const sp = spMap.get(id) || {};

                const title =
                    si.Title ||
                    entry.Title ||
                    "Unknown Title";

                const artistText =
                    si.Artist ||
                    entry.Artist ||
                    "Unknown Artist";

                const artistIDs =
                    normalizeArtistIDs(si.ArtistID);

                const artistLinks = [];

                artistIDs.forEach(aid => {
                    const artistObj =
                        artistMapByID.get(String(aid));

                    if (!artistObj) {
                        return;
                    }

                    artistLinks.push({
                        name:
                            artistObj.Artist ||
                            artistText,
                        url:
                            artistObj.SpotifyURL ||
                            null
                    });
                });

                const finalArtistLinks =
                    artistLinks.length > 0
                        ? artistLinks
                        : fallbackArtistLinks(artistText);

                return {
                    SongID: id,
                    Position:
                        Number(entry.Position) ||
                        index + 1,
                    Title: title,
                    ArtistNames: finalArtistLinks,
                    CoverImage:
                        ts.CoverImage ||
                        entry.CoverImage ||
                        "images/default_cover.jpg",
                    SpotifyURL:
                        sp.Spotify_URL ||
                        sp.SpotifyURL ||
                        entry.Spotify_URL ||
                        entry.SpotifyURL ||
                        null
                };
            });

            const limit =
                chartCode === "global200"
                    ? 200
                    : 100;

            const current = merged
                .filter(song =>
                    Number.isFinite(Number(song.Position))
                )
                .sort(
                    (a, b) =>
                        Number(a.Position) -
                        Number(b.Position)
                )
                .slice(0, limit);

            if (current.length === 0) {
                throw new Error(
                    `Billboard ${chartCode} has no valid rows after merge.`
                );
            }

            updateSongListUI(current);

        } catch (error) {
            console.error(
                "Error loading Billboard data:",
                error
            );

            if (songList) {
                songList.innerHTML =
                    `<li>Error loading ${chartCode.toUpperCase()} data.</li>`;
            }
        }
    }

    const chartSelect =
        document.getElementById("chartSelect");

    if (chartSelect) {
        chartSelect.addEventListener(
            "change",
            function () {
                loadChartData(this.value);
            }
        );
    }

    loadChartData(
        chartSelect?.value || "hot100"
    );

    function updateSongListUI(songs) {
        const songList =
            document.getElementById("songList");

        if (!songList) {
            return;
        }

        songList.innerHTML = "";

        songs.forEach(song => {
            const li =
                document.createElement("li");

            const rank =
                document.createElement("div");
            rank.className = "song-rank";
            rank.textContent =
                `${song.Position}.`;

            const img =
                document.createElement("img");
            img.src =
                song.CoverImage ||
                "images/default_cover.jpg";
            img.alt =
                `${song.Title} Cover`;

            img.addEventListener(
                "error",
                () => {
                    img.src =
                        "images/default_cover.jpg";
                },
                { once: true }
            );

            const info =
                document.createElement("div");
            info.className =
                "song-info-list";

            const title =
                document.createElement("span");
            title.className =
                "song-title";
            title.textContent =
                song.Title;

            const artistContainer =
                document.createElement("div");
            artistContainer.className =
                "song-artist";

            song.ArtistNames.forEach(
                (artistObj, index) => {
                    if (artistObj.url) {
                        const link =
                            document.createElement("a");

                        link.href =
                            artistObj.url;
                        link.textContent =
                            artistObj.name;
                        link.target =
                            "_blank";
                        link.rel =
                            "noopener noreferrer";
                        link.style.color =
                            "#3498db";
                        link.style.textDecoration =
                            "underline";

                        artistContainer.appendChild(
                            link
                        );
                    } else {
                        const span =
                            document.createElement("span");

                        span.textContent =
                            artistObj.name;

                        artistContainer.appendChild(
                            span
                        );
                    }

                    if (
                        index <
                        song.ArtistNames.length - 1
                    ) {
                        artistContainer.appendChild(
                            document.createTextNode(", ")
                        );
                    }
                }
            );

            info.appendChild(title);
            info.appendChild(
                artistContainer
            );

            li.appendChild(rank);
            li.appendChild(img);
            li.appendChild(info);

            li.addEventListener(
                "click",
                () => {
                    document
                        .querySelectorAll(
                            ".song-list li"
                        )
                        .forEach(el =>
                            el.classList.remove(
                                "selected"
                            )
                        );

                    li.classList.add(
                        "selected"
                    );
                }
            );

            if (song.SpotifyURL) {
                img.style.cursor =
                    "pointer";

                img.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();

                        const isSelected =
                            li.classList.contains(
                                "selected"
                            );

                        if (!isSelected) {
                            document
                                .querySelectorAll(
                                    ".song-list li"
                                )
                                .forEach(el =>
                                    el.classList.remove(
                                        "selected"
                                    )
                                );

                            li.classList.add(
                                "selected"
                            );
                        } else {
                            window.open(
                                song.SpotifyURL,
                                "_blank",
                                "noopener"
                            );
                        }
                    }
                );
            }

            songList.appendChild(li);
        });
    }
});
