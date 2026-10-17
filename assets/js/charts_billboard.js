document.addEventListener("DOMContentLoaded", function () {
    const JSON_BASE = "DATABASES/ALL_JSON/";

    /*
     * MASTER V4:
     * JSON_UPDATE_MASTER.py currently exports Billboard charts as:
     *   billboard_us.json      -> Billboard Hot 100
     *   billboard_global.json  -> Billboard Global 200
     *
     * Keep the legacy names as fallbacks so older exports still work.
     */
    const chartOptions = {
        hot100: [
            JSON_BASE + "billboard_us.json",
            JSON_BASE + "billboard_hot100.json",
            JSON_BASE + "BILLBOARD_hot100.json"
        ],
        global200: [
            JSON_BASE + "billboard_global.json",
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

    // Load both catalogs: platform-specific rows can be incomplete.
    async function fetchAllAvailable(urls, label) {
        const results = await Promise.all(urls.map(async url => {
            try {
                const rows = await fetchJson(url);
                return Array.isArray(rows) ? rows : [];
            } catch (error) {
                console.warn(`[Billboard] Optional ${label}: ${url}`, error.message);
                return [];
            }
        }));
        return results.flat();
    }

    function artistKey(value) {
        return String(value || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    }

    function artistURL(row) {
        const url = String(row?.SpotifyURL || row?.Spotify_URL || "").trim();
        return /^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]+(?:[/?#].*)?$/i.test(url)
            ? url : null;
    }

    function buildArtistIndex(rows) {
        const byID = new Map();
        const byName = new Map();
        for (const row of rows || []) {
            if (!row) continue;
            const id = String(row.ArtistID ?? "").trim();
            const name = String(row.Artist || row.Name || "").trim();
            if (!name) continue;
            const key = artistKey(name);
            const better = (old) => !old || (!artistURL(old) && !!artistURL(row));
            if (id && better(byID.get(id))) byID.set(id, row);
            if (key && better(byName.get(key))) byName.set(key, row);
        }
        return { byID, byName };
    }

    // Match known artist names before splitting punctuation. This preserves
    // Tyler, The Creator and Earth, Wind & Fire, but splits Drake&Don Toliver.
    function resolveBillboardArtists(rawText, rawIDs, index, structuredLinks) {
        const text = String(rawText || "").trim();
        if (!text) return [];
        const ids = normalizeArtistIDs(rawIDs);
        const byID = index.byID, byName = index.byName;
        const norm = artistKey;
        const isSep = (part) => /^(?:\s|,|&|\+|\/|\b(?:feat\.?|ft\.?|featuring|with|and|x)\b)+$/i.test(part);
        const candidates = [...byName.values()]
            .filter(a => artistURL(a))
            .map(a => ({ row:a, name:String(a.Artist || a.Name || '').trim() }))
            .filter(a => a.name)
            .sort((a,b) => b.name.length - a.name.length);

        function matchesAt(pos) {
            const rest = text.slice(pos);
            const matches = [];
            for (const item of candidates) {
                // A punctuation-insensitive comparison of a bounded prefix,
                // while allowing spacing and accents to differ.
                const chars = Array.from(rest);
                const min = Math.max(1, item.name.length - 4);
                const max = Math.min(chars.length, item.name.length + 8);
                for (let len=min; len<=max; len++) {
                    const part = chars.slice(0,len).join('');
                    if (norm(part) !== norm(item.name)) continue;
                    const next = rest.slice(part.length);
                    if (next && !/^[\s,&+\/]/.test(next)
                        && !/^X(?=[A-ZÀ-ÖØ-Þ])/u.test(next)
                        && !/^(?:featuring|feat\.?|ft\.?|with|and)(?=[A-ZÀ-ÖØ-Þ]|\s|$)/i.test(next)) continue;
                    matches.push({ length:part.length, row:item.row, name:part.trim() });
                    break;
                }
            }
            return matches;
        }
        const memo = new Map();
        function solve(pos) {
            if (memo.has(pos)) return memo.get(pos);
            if (pos === text.length) return [];
            const tail = text.slice(pos);
            const sep = tail.match(/^(?:[\s,&+\/]+|X(?=[A-ZÀ-ÖØ-Þ])|(?:featuring|feat\.?|ft\.?|with|and)(?=[A-ZÀ-ÖØ-Þ]|\s|$)\s*)/i);
            if (sep) {
                const result = solve(pos + sep[0].length);
                if (result) { memo.set(pos,result); return result; }
            }
            for (const match of matchesAt(pos)) {
                const rest = solve(pos + match.length);
                if (rest) {
                    const result = [{name:match.name, url:artistURL(match.row), artistId:match.row.ArtistID}, ...rest];
                    memo.set(pos,result);
                    return result;
                }
            }
            memo.set(pos,null);
            return null;
        }
        const parsed = solve(0);
        if (parsed?.length) return parsed;

        // Structured links are only safe when their identities match the raw
        // display; never assign links by array index alone.
        if (Array.isArray(structuredLinks) && structuredLinks.length) {
            const cleaned = structuredLinks.map(a => {
                const name = String(a?.name || a?.Artist || '').trim();
                const known = byID.get(String(a?.artistId ?? a?.ArtistID ?? '')) || byName.get(norm(name));
                const verified = known && norm(known.Artist || known.Name) === norm(name) ? known : byName.get(norm(name));
                return {name, url:artistURL(verified)};
            }).filter(a => a.name);
            if (cleaned.length && norm(cleaned.map(a=>a.name).join('')) === norm(text)) return cleaned;
        }

        // Conservative fallback: retain unrecognized raw artist text rather
        // than invent a link or split a real band's name incorrectly.
        const exact = byName.get(norm(text));
        if (exact && artistURL(exact)) return [{name:text,url:artistURL(exact),artistId:exact.ArtistID}];
        console.warn('[Billboard] Unresolved artist:', {text, ids});
        return [{name:text,url:null}];
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
                fetchAllAvailable(
                    supportFiles.artist,
                    "ARTIST_FEATURES"
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
            const artistIndex = buildArtistIndex(artistFeatures);

            const merged = data.map((entry, index) => {
                const id = String(entry?.SongID ?? "");
                const si = siMap.get(id) || {};
                const ts = tsMap.get(id) || {};
                const sp = spMap.get(id) || {};

                const title =
                    entry.Title ||
                    si.Title ||
                    "Unknown Title";

                const artistText =
                    entry.Artist ||
                    si.Artist ||
                    "Unknown Artist";

                const finalArtistLinks = resolveBillboardArtists(
                    artistText,
                    entry.ArtistID || si.ArtistID,
                    artistIndex,
                    entry.ArtistLinks || si.ArtistLinks
                );

                return {
                    SongID: id,
                    Position:
                        Number(entry.Position) ||
                        index + 1,
                    Title: title,
                    ArtistNames: finalArtistLinks,
                    CoverImage:
                        entry.CoverImage ||
                        ts.CoverImage ||
                        "images/default_cover.jpg",
                    SpotifyURL:
                        entry.Spotify_URL ||
                        entry.SpotifyURL ||
                        sp.Spotify_URL ||
                        sp.SpotifyURL ||
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
