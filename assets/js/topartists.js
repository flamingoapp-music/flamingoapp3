document.addEventListener("DOMContentLoaded", function () {
    const basePath = "DATABASES/TOP_ARTISTS/";

    const topListSelect =
        document.getElementById("topListSelect");
    const listName =
        document.getElementById("listName");
    const songList =
        document.getElementById("songList");
    const platformLogo =
        document.getElementById("platformLogo");

    const defaultImage =
        "images/default_cover.jpg";

    async function fetchJson(url, required = true) {
        try {
            const response = await fetch(
                url,
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${url}`
                );
            }

            return await response.json();
        } catch (error) {
            if (required) {
                throw error;
            }

            console.warn(
                "Optional artist JSON unavailable:",
                url,
                error.message
            );

            return [];
        }
    }

    function normalizeText(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(
                /[\u0300-\u036f]/g,
                ""
            )
            .replace(/\s+/g, " ");
    }

    function buildArtistMaps(artistFeatures) {
        const byID =
            new Map();
        const byName =
            new Map();

        (artistFeatures || []).forEach(
            artist => {
                if (
                    artist.ArtistID !== null &&
                    artist.ArtistID !== undefined &&
                    artist.ArtistID !== ""
                ) {
                    byID.set(
                        String(artist.ArtistID),
                        artist
                    );
                }

                const nameKey =
                    normalizeText(
                        artist.Artist
                    );

                if (nameKey) {
                    byName.set(
                        nameKey,
                        artist
                    );
                }
            }
        );

        return {
            byID,
            byName
        };
    }

    function getFeatureForEntry(
        entry,
        maps
    ) {
        const artistID =
            entry?.ArtistID;

        if (
            artistID !== null &&
            artistID !== undefined &&
            artistID !== ""
        ) {
            const byID =
                maps.byID.get(
                    String(artistID)
                );

            if (byID) {
                return byID;
            }
        }

        const nameKey =
            normalizeText(
                entry?.Artist
            );

        if (nameKey) {
            return (
                maps.byName.get(
                    nameKey
                ) ||
                {}
            );
        }

        return {};
    }

    async function loadArtistData(
        listFile
    ) {
        if (!songList) {
            return;
        }

        songList.innerHTML =
            "<li>Loading artist data...</li>";

        try {
            /*
             * SCORE_MASTER V4 now writes SpotifyImageURL/SpotifyURL
             * directly into EVERY ranking JSON.
             *
             * ARTIST_FEATURES.json remains an optional fallback for
             * compatibility with older generated files.
             */
            const [
                rankingData,
                artistFeatures
            ] = await Promise.all([
                fetchJson(
                    basePath +
                    listFile +
                    ".json",
                    true
                ),
                fetchJson(
                    basePath +
                    "ARTIST_FEATURES.json",
                    false
                )
            ]);

            if (
                !Array.isArray(rankingData)
            ) {
                throw new Error(
                    `${listFile}.json is not an array.`
                );
            }

            const maps =
                buildArtistMaps(
                    artistFeatures
                );

            const merged =
                rankingData.map(
                    (entry, index) => {
                        const fallback =
                            getFeatureForEntry(
                                entry,
                                maps
                            );

                        return {
                            Position:
                                Number(
                                    entry.Position
                                ) ||
                                index + 1,

                            Artist:
                                entry.Artist ||
                                fallback.Artist ||
                                "Unknown Artist",

                            Image:
                                entry.SpotifyImageURL ||
                                fallback.SpotifyImageURL ||
                                defaultImage,

                            URL:
                                entry.SpotifyURL ||
                                fallback.SpotifyURL ||
                                null,

                            Hits:
                                entry["Number of hits"] ??
                                entry.Hits ??
                                0
                        };
                    }
                );

            renderList(merged);

        } catch (error) {
            console.error(
                "Error loading artist data:",
                error
            );

            songList.innerHTML =
                "<li>Error loading artist data.</li>";
        }
    }

    function renderList(artists) {
        if (!songList) {
            return;
        }

        songList.innerHTML = "";

        if (
            !Array.isArray(artists) ||
            artists.length === 0
        ) {
            songList.innerHTML =
                "<li>No artist data available.</li>";
            return;
        }

        artists.forEach(artist => {
            const li =
                document.createElement("li");

            const rank =
                document.createElement("div");
            rank.className =
                "song-rank";
            rank.textContent =
                `${artist.Position}.`;

            const img =
                document.createElement("img");
            img.src =
                artist.Image ||
                defaultImage;
            img.alt =
                `${artist.Artist} Image`;

            img.addEventListener(
                "error",
                () => {
                    img.src =
                        defaultImage;
                },
                {
                    once: true
                }
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
                artist.Artist;

            const hits =
                document.createElement("div");
            hits.className =
                "song-artist";
            hits.textContent =
                `Hits: ${artist.Hits}`;

            info.appendChild(title);
            info.appendChild(hits);

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

            if (artist.URL) {
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
                                artist.URL,
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

    function setListTitle(value) {
        if (!listName) {
            return;
        }

        listName.textContent =
            `TOP ARTISTS - ${
                String(value || "")
                    .replace(
                        "artists_",
                        ""
                    )
                    .toUpperCase()
            }`;
    }

    if (topListSelect) {
        topListSelect.addEventListener(
            "change",
            function () {
                const selected =
                    this.value;

                setListTitle(
                    selected
                );

                if (platformLogo) {
                    platformLogo.src =
                        "images/logo.png";
                }

                loadArtistData(
                    selected
                );
            }
        );
    }

    const urlParams =
        new URLSearchParams(
            window.location.search
        );

    let chartParam =
        urlParams.get("chart") ||
        "artists_weekly";

    const validOptions =
        topListSelect
            ? Array.from(
                topListSelect.options
            ).map(
                option =>
                    option.value
            )
            : [];

    if (
        validOptions.length > 0 &&
        !validOptions.includes(
            chartParam
        )
    ) {
        chartParam =
            "artists_weekly";
    }

    if (topListSelect) {
        topListSelect.value =
            chartParam;
    }

    setListTitle(chartParam);

    if (platformLogo) {
        platformLogo.src =
            "images/logo.png";
    }

    loadArtistData(chartParam);
});
