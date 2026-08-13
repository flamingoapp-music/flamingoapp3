(() => {
	// ======================================================
	// FLAMINGO DISPLAY / DISPLAYER.JS - MASTER COMPATIBLE
	// ======================================================

	const $  = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

	const JSON_BASE_SONGS   = "DATABASES/TOP_SONGS/";
	const JSON_BASE_ARTISTS = "DATABASES/TOP_ARTISTS/";
	const JSON_BASE_ALL     = "DATABASES/ALL_JSON/";
	const DEFAULT_COVER = "images/backgroundlogo.png";

	const _cache = new Map();

	function normalizeText(value) {
		return String(value ?? "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/\s+/g, " ")
			.trim();
	}

	function firstNonEmpty(...values) {
		for (const v of values) {
			if (typeof v === "string" && v.trim() !== "") return v.trim();
			if (v !== null && v !== undefined && v !== "") return v;
		}
		return "";
	}

	function safeSongID(value) {
		const n = Number(value);
		return Number.isFinite(n) ? String(Math.trunc(n)) : String(value ?? "").trim();
	}

	async function getJSON(url) {
		if (_cache.has(url)) return _cache.get(url);

		const bust = "cb=" + Date.now();
		const urlWithBust = url + (url.includes("?") ? "&" : "?") + bust;

		const p = (async () => {
			try {
				const res = await fetch(urlWithBust, {
					cache: "no-store",
					headers: {
						"Cache-Control": "no-cache, no-store, must-revalidate",
						"Pragma": "no-cache",
						"Expires": "0",
					},
				});

				if (!res.ok) {
					console.warn(`[getJSON] ${urlWithBust} -> ${res.status}`);
					return [];
				}

				return await res.json();
			} catch (err) {
				console.error(`[getJSON] error para ${urlWithBust}:`, err);
				return [];
			}
		})();

		_cache.set(url, p);
		return p;
	}

	async function getFirstAvailableJSON(basePath, candidates) {
		for (const name of candidates) {
			const data = await getJSON(basePath + name);
			if (Array.isArray(data) && data.length > 0) {
				console.info(`[JSON] Usando ${basePath + name}`);
				return data;
			}
		}
		console.warn("[JSON] Ningún archivo disponible:", candidates);
		return [];
	}

	function indexBy(arr, key, mapValue = x => x) {
		const m = Object.create(null);
		for (const it of Array.isArray(arr) ? arr : []) {
			if (!it || !Object.prototype.hasOwnProperty.call(it, key)) continue;
			const rawKey = it[key];
			const stringKey = safeSongID(rawKey);
			m[stringKey] = mapValue(it);
			m[rawKey] = mapValue(it);
		}
		return m;
	}

	let metaReady;
	const meta = {
		siMap: Object.create(null),
		tsMap: Object.create(null),
		spMap: Object.create(null),
		artistByID: Object.create(null),
		artistByName: Object.create(null),
		appleSiMap: Object.create(null),
		appleTsMap: Object.create(null),
		appleSpMap: Object.create(null),
		billboardSiMap: Object.create(null),
		billboardTsMap: Object.create(null),
		billboardSpMap: Object.create(null),
	};

	function registerArtistFeature(a) {
		if (!a || !a.Artist) return;

		const artistID = firstNonEmpty(a.ArtistID, a.ArtistId, a.id);
		const name = String(a.Artist).trim();
		const key = normalizeText(name);

		const normalized = {
			ArtistID: artistID,
			Artist: name,
			SpotifyURL: firstNonEmpty(a.SpotifyURL, a.Spotify_URL),
			SpotifyImageURL: firstNonEmpty(a.SpotifyImageURL, a.Image, a.image, a.CoverImage),
		};

		if (artistID !== "") meta.artistByID[String(artistID)] = normalized;
		if (key) meta.artistByName[key] = normalized;

		if (a.Alias) {
			String(a.Alias)
				.split(/[,;|]/)
				.map(x => normalizeText(x))
				.filter(Boolean)
				.forEach(aliasKey => {
					if (!meta.artistByName[aliasKey]) meta.artistByName[aliasKey] = normalized;
				});
		}
	}

	function getArtistFeatureByName(name) {
		return meta.artistByName[normalizeText(name)] || null;
	}

	function getArtistFeatureByID(id) {
		if (id === null || id === undefined || id === "") return null;
		return meta.artistByID[String(id)] || null;
	}

	function getArtistImage(row) {
		const byID = getArtistFeatureByID(row?.ArtistID);
		const byName = getArtistFeatureByName(row?.Artist);

		return firstNonEmpty(
			row?.SpotifyImageURL,
			row?.Image,
			row?.image,
			byID?.SpotifyImageURL,
			byName?.SpotifyImageURL,
			DEFAULT_COVER
		);
	}

	function getArtistURL(row) {
		const byID = getArtistFeatureByID(row?.ArtistID);
		const byName = getArtistFeatureByName(row?.Artist);

		return firstNonEmpty(
			row?.SpotifyURL,
			row?.Spotify_URL,
			byID?.SpotifyURL,
			byName?.SpotifyURL,
			null
		);
	}

	function getSongURL(songID, entry = {}) {
		const id = safeSongID(songID);
		return firstNonEmpty(
			entry.SpotifyURL,
			entry.Spotify_URL,
			meta.spMap[id],
			meta.appleSpMap[id],
			meta.billboardSpMap[id],
			null
		);
	}

	function getSongImage(songID, entry = {}, platform = "") {
		const id = safeSongID(songID);
		let ts = meta.tsMap[id] || {};

		if (platform === "apple_music" && meta.appleTsMap[id]) ts = meta.appleTsMap[id];
		if (platform === "billboard" && meta.billboardTsMap[id]) ts = meta.billboardTsMap[id];

		return firstNonEmpty(entry.CoverImage, entry.Image, entry.image, ts.CoverImage, DEFAULT_COVER);
	}

	function getSongSI(songID, entry = {}, platform = "") {
		const id = safeSongID(songID);
		let si = meta.siMap[id] || {};

		if (platform === "apple_music" && meta.appleSiMap[id]) si = meta.appleSiMap[id];
		if (platform === "billboard" && meta.billboardSiMap[id]) si = meta.billboardSiMap[id];

		return {
			Title: firstNonEmpty(si.Title, entry.Title, "Unknown Title"),
			Artist: firstNonEmpty(si.Artist, entry.Artist, "Unknown Artist"),
			ArtistID: firstNonEmpty(si.ArtistID, entry.ArtistID, ""),
		};
	}

	function splitArtistNames(artistText) {
		return String(artistText || "")
			.split(",")
			.map(x => x.trim())
			.filter(Boolean);
	}

	function normalizeArtists(entry) {
		if (Array.isArray(entry.Artists) && entry.Artists.length > 0) {
			return entry.Artists.map(a => {
				const name = firstNonEmpty(a?.Artist, a?.name, "Unknown Artist");
				const feature = getArtistFeatureByName(name);
				return {
					name,
					url: firstNonEmpty(a?.SpotifyURL, feature?.SpotifyURL, null),
				};
			});
		}

		const artistText = firstNonEmpty(entry.Artist, entry.Artists, "Unknown Artist");

		return splitArtistNames(artistText).map(name => {
			const feature = getArtistFeatureByName(name);
			return {
				name,
				url: firstNonEmpty(feature?.SpotifyURL, null),
			};
		});
	}

	function ensureMetaLoaded() {
		if (metaReady) return metaReady;

		metaReady = (async () => {
			const [
				si,
				ts,
				sp,
				artistFeatures,
				appleSi,
				appleTs,
				appleSp,
				appleArtistFeatures,
				billboardSi,
				billboardTs,
				billboardSp,
				billboardArtistFeatures,
			] = await Promise.all([
				getJSON(`${JSON_BASE_ALL}SI.json`),
				getJSON(`${JSON_BASE_ALL}TS.json`),
				getJSON(`${JSON_BASE_ALL}SP.json`),
				getJSON(`${JSON_BASE_ALL}ARTIST_FEATURES.json`),

				getFirstAvailableJSON(JSON_BASE_ALL, ["APPLE_SI.json", "APPLEMUSIC_SI.json", "APPLE_MUSIC_SI.json"]),
				getFirstAvailableJSON(JSON_BASE_ALL, ["APPLE_TS.json", "APPLEMUSIC_TS.json", "APPLE_MUSIC_TS.json"]),
				getFirstAvailableJSON(JSON_BASE_ALL, ["APPLE_SP.json", "APPLEMUSIC_SP.json", "APPLE_MUSIC_SP.json"]),
				getFirstAvailableJSON(JSON_BASE_ALL, ["APPLE_ARTIST_FEATURES.json", "APPLEMUSIC_ARTIST_FEATURES.json", "APPLE_MUSIC_ARTIST_FEATURES.json"]),

				getFirstAvailableJSON(JSON_BASE_ALL, ["BILLBOARD_SI.json", "BB_SI.json"]),
				getFirstAvailableJSON(JSON_BASE_ALL, ["BILLBOARD_TS.json", "BB_TS.json"]),
				getFirstAvailableJSON(JSON_BASE_ALL, ["BILLBOARD_SP.json", "BB_SP.json"]),
				getFirstAvailableJSON(JSON_BASE_ALL, ["BILLBOARD_ARTIST_FEATURES.json", "BB_ARTIST_FEATURES.json"]),
			]);

			meta.siMap = indexBy(si, "SongID");
			meta.tsMap = indexBy(ts, "SongID");
			meta.spMap = indexBy(sp, "SongID", x => firstNonEmpty(x.Spotify_URL, x.SpotifyURL));

			meta.appleSiMap = indexBy(appleSi, "SongID");
			meta.appleTsMap = indexBy(appleTs, "SongID");
			meta.appleSpMap = indexBy(appleSp, "SongID", x => firstNonEmpty(x.Spotify_URL, x.SpotifyURL));

			meta.billboardSiMap = indexBy(billboardSi, "SongID");
			meta.billboardTsMap = indexBy(billboardTs, "SongID");
			meta.billboardSpMap = indexBy(billboardSp, "SongID", x => firstNonEmpty(x.Spotify_URL, x.SpotifyURL));

			[
				...(Array.isArray(artistFeatures) ? artistFeatures : []),
				...(Array.isArray(appleArtistFeatures) ? appleArtistFeatures : []),
				...(Array.isArray(billboardArtistFeatures) ? billboardArtistFeatures : []),
			].forEach(registerArtistFeature);

			console.log("[META] Metadata cargada correctamente");
		})();

		return metaReady;
	}

	function normalizeChartKey(k) {
		k = String(k || "").toLowerCase();
		if (["week", "weekly", "top_weekly"].includes(k)) return "week";
		if (["month", "monthly", "top_monthly"].includes(k)) return "month";
		if (["general", "all", "top_general"].includes(k)) return "general";
		return k;
	}

	// ======================================================
	// TOP SONGS
	// ======================================================
	(function initTopSongs() {
		const chartTabs  = $$(".chart-tab");
		const container  = $("#chartCardsContainer");
		const viewAllBtn = $("#viewAllButton");

		const chartFileCandidates = {
			week:    ["top_15_weekly.json", "top_weekly.json"],
			month:   ["top_15_monthly.json", "top_monthly.json"],
			general: ["top_15_general.json", "top_general.json"],
		};

		const keyMap = { week: "top_weekly", month: "top_monthly", general: "top_general" };

		function setActiveTab(k) {
			chartTabs.forEach(t => {
				const tk = normalizeChartKey(t.dataset.chart);
				t.classList.toggle("active", tk === k);
			});
		}

		function setViewAll(k) {
			if (viewAllBtn) viewAllBtn.href = `topsongs.html?chart=${keyMap[k] || "top_weekly"}`;
		}

		function makeSongCard(song) {
			const card = document.createElement("div");
			card.className = "chart-card";

			const img = document.createElement("img");
			img.className = "chart-img";
			img.src = song.image || DEFAULT_COVER;
			img.alt = song.title;
			img.loading = "lazy";
			img.decoding = "async";
			img.onerror = () => { img.src = DEFAULT_COVER; };

			if (song.spotifyURL) {
				img.style.cursor = "pointer";
				img.addEventListener("click", () => window.open(song.spotifyURL, "_blank"));
			}

			const rank = document.createElement("div");
			rank.className = "chart-rank";
			rank.textContent = song.rank;

			const title = document.createElement("div");
			title.className = "chart-title";
			title.textContent = song.title;

			const artistDiv = document.createElement("div");
			artistDiv.className = "chart-artist";

			if (Array.isArray(song.artists) && song.artists.length > 0) {
				song.artists.forEach((a, i) => {
					const node = a.url
						? Object.assign(document.createElement("a"), {
							href: a.url,
							target: "_blank",
							rel: "noopener noreferrer",
							textContent: a.name,
							style: "color:#3498db;text-decoration:underline",
						})
						: Object.assign(document.createElement("span"), { textContent: a.name });

					artistDiv.appendChild(node);
					if (i < song.artists.length - 1) artistDiv.appendChild(document.createTextNode(", "));
				});
			} else {
				artistDiv.textContent = "Unknown Artist";
			}

			card.append(img, rank, title, artistDiv);
			return card;
		}

		async function renderChart(rawKey) {
			if (!container) return;

			await ensureMetaLoaded();

			const key = normalizeChartKey(rawKey);
			setActiveTab(key);
			setViewAll(key);

			container.textContent = "Loading...";

			const data = await getFirstAvailableJSON(JSON_BASE_SONGS, chartFileCandidates[key] || chartFileCandidates.week);
			container.textContent = "";

			if (!Array.isArray(data) || data.length === 0) {
				container.innerHTML = "<p>No data available.</p>";
				return;
			}

			const top5 = data
				.slice()
				.sort((a, b) => (a.Position ?? 9999) - (b.Position ?? 9999))
				.slice(0, 5)
				.map(entry => {
					const id = safeSongID(entry.SongID);
					const si = getSongSI(id, entry);
					return {
						rank: entry.Position ?? "",
						title: firstNonEmpty(entry.Title, si.Title),
						artists: normalizeArtists({ ...entry, Artist: firstNonEmpty(entry.Artist, si.Artist) }),
						image: getSongImage(id, entry),
						spotifyURL: getSongURL(id, entry),
					};
				});

			const frag = document.createDocumentFragment();
			for (const s of top5) frag.appendChild(makeSongCard(s));

			requestAnimationFrame(() => {
				container.textContent = "";
				container.appendChild(frag);
			});
		}

		chartTabs.forEach(tab => {
			tab.addEventListener("click", () => renderChart(tab.dataset.chart), { passive: true });
		});

		renderChart("week");
	})();

	// ======================================================
	// TOP ARTISTS
	// ======================================================
	(function initTopArtists() {
		const chartTabs  = $$(".chart-tab-artist");
		const container  = $("#chartCardsContainerArtists");
		const viewAllBtn = $("#viewAllButtonArtists");

		const chartFileCandidates = {
			week:    ["artists_top15_weekly.json", "artists_weekly.json", "artists_top15_daily.json"],
			month:   ["artists_top15_monthly.json", "artist_top15_monthly.json", "artists_monthly.json"],
			general: ["artists_top15_general.json", "artist_top15_general.json", "artists_general.json"],
		};

		const keyMap = { week: "artists_weekly", month: "artists_monthly", general: "artists_general" };

		function setActiveTab(k) {
			chartTabs.forEach(t => {
				const tk = normalizeChartKey(t.dataset.chart);
				t.classList.toggle("active", tk === k);
			});
		}

		function setViewAll(k) {
			if (viewAllBtn) viewAllBtn.href = `topartists.html?chart=${keyMap[k] || "artists_weekly"}`;
		}

		function makeArtistCard(a) {
			const card = document.createElement("div");
			card.className = "chart-card artist-card";

			const img = document.createElement("img");
			img.className = "chart-img";
			img.src = a.image || DEFAULT_COVER;
			img.alt = a.name;
			img.loading = "lazy";
			img.decoding = "async";
			img.onerror = () => { img.src = DEFAULT_COVER; };

			if (a.url) {
				img.style.cursor = "pointer";
				img.addEventListener("click", () => window.open(a.url, "_blank"));
			}

			const rank = document.createElement("div");
			rank.className = "chart-rank";
			rank.textContent = a.rank;

			const title = document.createElement("div");
			title.className = "chart-title";
			title.textContent = a.name;

			const hits = document.createElement("div");
			hits.className = "chart-artist";
			hits.textContent = `Hits: ${a.hits ?? "?"}`;

			card.append(img, rank, title, hits);
			return card;
		}

		async function renderChart(rawKey) {
			if (!container) return;

			await ensureMetaLoaded();

			const key = normalizeChartKey(rawKey);
			setActiveTab(key);
			setViewAll(key);

			container.textContent = "Loading...";

			const rows = await getFirstAvailableJSON(JSON_BASE_ARTISTS, chartFileCandidates[key] || chartFileCandidates.week);
			container.textContent = "";

			if (!Array.isArray(rows) || rows.length === 0) {
				container.innerHTML = "<p>No data available.</p>";
				return;
			}

			const top5 = rows
				.slice()
				.sort((a, b) => (a.Position ?? 9999) - (b.Position ?? 9999))
				.slice(0, 5)
				.map(r => {
					const byID = getArtistFeatureByID(r.ArtistID);
					const byName = getArtistFeatureByName(r.Artist);
					return {
						rank: r.Position ?? "",
						name: firstNonEmpty(r.Artist, byID?.Artist, byName?.Artist, "Unknown Artist"),
						image: getArtistImage(r),
						url: getArtistURL(r),
						hits: firstNonEmpty(r["Number of hits"], r.Hits, r.hit_count, "?"),
					};
				});

			const frag = document.createDocumentFragment();
			for (const a of top5) frag.appendChild(makeArtistCard(a));

			requestAnimationFrame(() => {
				container.textContent = "";
				container.appendChild(frag);
			});
		}

		chartTabs.forEach(tab => {
			tab.addEventListener("click", () => renderChart(tab.dataset.chart), { passive: true });
		});

		renderChart("week");
	})();

	// ======================================================
	// STREAMING HIGHLIGHTS
	// ======================================================
	(function initStreamingHighlights() {
		const container      = $("#chartCardsContainerStreaming");
		const toggleButtons  = $$(".chart-tab-stream");
		const viewAllButton  = $("#viewAllButtonStreaming");

		const chartGroups = {
			spotify:         [["us", "gb", "es", "mx", "kr"]],
			apple_music:     [["us", "uk", "gb", "es", "mx", "kr"]],
			youtubeInsights: [["us", "uk", "es", "mx", "kr"]],
			billboard:       [["hot100", "global200"]],
		};

		let currentPlatform = "spotify";

		function platformFiles(platform, code) {
			if (platform === "spotify") {
				return [`SP_${code}.json`, `SPOTIFY_${code}.json`, `sp_${code}.json`];
			}

			if (platform === "apple_music") {
				return [
					`am_${code}.json`,
					`AM_${code}.json`,
					`APPLE_${code}.json`,
					`APPLE_MUSIC_${code}.json`,
					`apple_music_${code}.json`,
					`APPLEMUSIC_${code}.json`,
				];
			}

			if (platform === "youtubeInsights") {
				return [`yt_${code}.json`, `YT_${code}.json`, `YOUTUBE_${code}.json`, `youtube_${code}.json`];
			}

			if (platform === "billboard") {
				if (code === "hot100") {
					return [
						"billboard_hot100.json",
						"billboard_hot_100.json",
						"billboard_hot-100.json",
						"BILLBOARD_HOT100.json",
						"BB_hot100.json",
					];
				}

				if (code === "global200") {
					return [
						"billboard_global200.json",
						"billboard_global_200.json",
						"billboard_global-200.json",
						"BILLBOARD_GLOBAL200.json",
						"BB_global200.json",
					];
				}
			}

			return [];
		}

		function makeArtistInline(artistText) {
			const wrapper = document.createElement("div");
			wrapper.className = "chart-artist";

			const names = splitArtistNames(artistText);
			if (!names.length) {
				wrapper.textContent = artistText || "Unknown Artist";
				return wrapper;
			}

			names.forEach((name, i) => {
				const feature = getArtistFeatureByName(name);
				const url = feature?.SpotifyURL || null;

				const node = url
					? Object.assign(document.createElement("a"), {
						href: url,
						target: "_blank",
						rel: "noopener noreferrer",
						textContent: name,
						style: "text-decoration:underline",
					})
					: Object.assign(document.createElement("span"), { textContent: name });

				wrapper.appendChild(node);
				if (i < names.length - 1) wrapper.appendChild(document.createTextNode(", "));
			});

			return wrapper;
		}

		function makeStreamCard(top5, code, platform) {
			if (!top5.length) return null;

			const card = document.createElement("div");
			card.className = "chart-card stream-card";

			const top = top5[0];

			const img = document.createElement("img");
			img.className = "chart-img";
			img.src = top.Image || DEFAULT_COVER;
			img.alt = top.Title;
			img.loading = "lazy";
			img.decoding = "async";
			img.onerror = () => { img.src = DEFAULT_COVER; };

			if (top.SpotifyURL) {
				img.style.cursor = "pointer";
				img.addEventListener("click", () => window.open(top.SpotifyURL, "_blank"));
			}

			const rank = document.createElement("div");
			rank.className = "chart-rank";

			if (platform !== "billboard") {
				const flagCode = code === "uk" ? "gb" : code;
				const flagImg = document.createElement("img");
				flagImg.src = `https://flagcdn.com/24x18/${flagCode}.png`;
				flagImg.alt = code;
				flagImg.className = "chart-flag";
				flagImg.loading = "lazy";
				flagImg.decoding = "async";
				rank.appendChild(flagImg);
			} else {
				rank.textContent = code === "hot100" ? "HOT 100" : code === "global200" ? "GLOBAL 200" : code.toUpperCase();
			}

			const title = document.createElement("div");
			title.className = "chart-title";
			title.textContent = top.Title;

			const artist = makeArtistInline(top.Artist);

			const buttonList = document.createElement("div");
			buttonList.className = "chart-others";

			for (const row of top5.slice(1, 5)) {
				const button = document.createElement("button");
				button.className = "stream-button-green";
				button.innerHTML = `<strong>${row.Position}.</strong> <span style="color:#000000">${row.Title}</span>`;

				if (row.SpotifyURL) {
					button.style.cursor = "pointer";
					button.addEventListener("click", () => window.open(row.SpotifyURL, "_blank"));
				}

				buttonList.appendChild(button);
			}

			card.append(img, rank, title, artist, buttonList);
			return card;
		}

		async function renderGroup(codes, platform) {
			if (!container) return;

			await ensureMetaLoaded();
			container.textContent = "Loading...";

			const frag = document.createDocumentFragment();

			for (const code of codes) {
				const data = await getFirstAvailableJSON(JSON_BASE_ALL, platformFiles(platform, code));

				if (!Array.isArray(data) || data.length === 0) {
					console.warn(`[Streaming] Sin datos para ${platform}/${code}`);
					continue;
				}

				const top5 = data
					.slice()
					.sort((a, b) => (a.Position ?? 9999) - (b.Position ?? 9999))
					.slice(0, 5)
					.map(entry => {
						const id = safeSongID(entry.SongID);
						const platformKey = platform === "youtubeInsights" ? "youtube" : platform;
						const si = getSongSI(id, entry, platformKey);

						return {
							Position: entry.Position ?? "",
							Title: firstNonEmpty(si.Title, entry.Title, "Unknown Title"),
							Artist: firstNonEmpty(si.Artist, entry.Artist, "Unknown Artist"),
							Image: getSongImage(id, entry, platformKey),
							SpotifyURL: getSongURL(id, entry),
						};
					});

				const card = makeStreamCard(top5, code, platform);
				if (card) frag.appendChild(card);
			}

			requestAnimationFrame(() => {
				container.textContent = "";
				if (!frag.childNodes.length) {
					container.innerHTML = "<p>No data available.</p>";
				} else {
					container.appendChild(frag);
				}
			});
		}

		toggleButtons.forEach(btn => {
			btn.addEventListener("click", () => {
				toggleButtons.forEach(b => b.classList.remove("active"));
				btn.classList.add("active");

				currentPlatform = btn.dataset.platform;

				document.body.classList.toggle("apple_music-active", currentPlatform === "apple_music");
				document.body.classList.toggle("youtube-active", currentPlatform === "youtubeInsights");
				document.body.classList.toggle("billboard-active", currentPlatform === "billboard");

				if (viewAllButton) {
					viewAllButton.href =
						currentPlatform === "spotify"         ? "spotifycharts.html" :
						currentPlatform === "apple_music"     ? "applemusiccharts.html" :
						currentPlatform === "youtubeInsights" ? "youtubecharts.html" :
						                                         "billboardcharts.html";
				}

				renderGroup(chartGroups[currentPlatform][0], currentPlatform);
			}, { passive: true });
		});

		ensureMetaLoaded().then(() => {
			renderGroup(chartGroups[currentPlatform][0], currentPlatform);
		});
	})();
})();
