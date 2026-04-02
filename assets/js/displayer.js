(() => {
	// ------- Utilidades -------
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
	const sleep = (ms) => new Promise(r => setTimeout(r, ms));

	const JSON_BASE_SONGS = "DATABASES/TOP_SONGS/";
	const JSON_BASE_ARTISTS = "DATABASES/TOP_ARTISTS/";
	const JSON_BASE_ALL = "DATABASES/ALL_JSON/";

	const DEFAULT_COVER = "images/backgroundlogo.png";

	const _cache = new Map();

	async function getJSON(url) {
		const cacheKey = url;
		if (_cache.has(cacheKey)) return _cache.get(cacheKey);

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
					console.warn(`[getJSON] ${urlWithBust} -> ${res.status} ${res.statusText}`);
					return [];
				}

				const contentType = res.headers.get("content-type") || "";
				if (!contentType.includes("application/json")) {
					console.warn(`[getJSON] ${urlWithBust} no devolvió JSON. Content-Type: ${contentType}`);
					return [];
				}

				return await res.json();
			} catch (err) {
				console.error(`[getJSON] error para ${urlWithBust}:`, err);
				return [];
			}
		})();

		_cache.set(cacheKey, p);
		return p;
	}

	async function getFirstAvailableJSON(basePath, candidates) {
		for (const name of candidates) {
			const url = basePath + name;
			const data = await getJSON(url);
			if (Array.isArray(data) && data.length > 0) {
				console.info(`[getFirstAvailableJSON] Usando ${url}`);
				return data;
			}
			console.warn(`[getFirstAvailableJSON] Sin datos en ${url}`);
		}
		console.error("[getFirstAvailableJSON] Ninguno de los archivos tuvo datos:", candidates);
		return [];
	}

	// ------- Metadatos compartidos -------
	let metaReady;
	const meta = {
		siMap: null,
		tsMap: null,
		spMap: null,
		artistURLMap: null,

		appleSiMap: null,
		appleTsMap: null,
		appleArtistURLMap: null
	};

	function indexBy(arr, key, mapValue = x => x) {
		const m = Object.create(null);
		for (const it of arr) {
			if (it && Object.prototype.hasOwnProperty.call(it, key)) {
				m[it[key]] = mapValue(it);
			}
		}
		return m;
	}

	function normalizeName(text) {
		return String(text || "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/\s+/g, " ")
			.trim();
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
				appleArtistFeatures
			] = await Promise.all([
				getJSON(`${JSON_BASE_ALL}SI.json`),
				getJSON(`${JSON_BASE_ALL}TS.json`),
				getJSON(`${JSON_BASE_ALL}SP.json`),
				getJSON(`${JSON_BASE_ALL}ARTIST_FEATURES.json`),

				getJSON(`${JSON_BASE_ALL}APPLEMUSIC_SI.json`),
				getJSON(`${JSON_BASE_ALL}APPLEMUSIC_TS.json`),
				getJSON(`${JSON_BASE_ALL}APPLEMUSIC_ARTIST_FEATURES.json`)
			]);

			meta.siMap = indexBy(Array.isArray(si) ? si : [], "SongID");
			meta.tsMap = indexBy(Array.isArray(ts) ? ts : [], "SongID");
			meta.spMap = indexBy(Array.isArray(sp) ? sp : [], "SongID", x => x.Spotify_URL);

			meta.artistURLMap = Object.create(null);
			if (Array.isArray(artistFeatures)) {
				for (const a of artistFeatures) {
					if (a && a.Artist) {
						meta.artistURLMap[normalizeName(a.Artist)] = a.SpotifyURL || null;
					}
				}
			}

			meta.appleSiMap = indexBy(Array.isArray(appleSi) ? appleSi : [], "SongID");
			meta.appleTsMap = indexBy(Array.isArray(appleTs) ? appleTs : [], "SongID");

			meta.appleArtistURLMap = Object.create(null);
			if (Array.isArray(appleArtistFeatures)) {
				for (const a of appleArtistFeatures) {
					if (a && a.Artist) {
						meta.appleArtistURLMap[normalizeName(a.Artist)] = a.SpotifyURL || null;

						if (!meta.artistURLMap[normalizeName(a.Artist)]) {
							meta.artistURLMap[normalizeName(a.Artist)] = a.SpotifyURL || null;
						}
					}
				}
			}

			console.log("[META] Cargados SI/TS/SP/ARTIST + APPLEMUSIC_SI/TS/ARTIST");
		})();

		return metaReady;
	}

	function getArtistUrlByName(name, platform = "spotify") {
		const key = normalizeName(name);
		if (!key) return null;

		if (platform === "apple_music") {
			return meta.appleArtistURLMap?.[key] || meta.artistURLMap?.[key] || null;
		}

		return meta.artistURLMap?.[key] || null;
	}

	// ======================================================
	// TOP SONGS
	// ======================================================
	(function initTopSongs() {
		const chartTabs = $$(".chart-tab");
		const container = $("#chartCardsContainer");
		const viewAllBtn = $("#viewAllButton");

		const chartFileCandidates = {
			week: ["top_15_weekly.json", "top_weekly.json"],
			month: ["top_15_monthly.json", "top_monthly.json"],
			general: ["top_15_general.json", "top_general.json"]
		};

		const keyMap = { week: "top_weekly", month: "top_monthly", general: "top_general" };
		const keys = ["week", "month", "general"];
		let current = 0;

		function setActiveTab(k) {
			chartTabs.forEach(t => t.classList.toggle("active", t.dataset.chart === k));
		}

		function setViewAll(k) {
			if (viewAllBtn) viewAllBtn.href = `topsongs.html?chart=${keyMap[k]}`;
		}

		function normalizeArtists(entry, platform = "spotify") {
			// Caso 1: Artists como array
			if (Array.isArray(entry.Artists) && entry.Artists.length > 0) {
				return entry.Artists.map(a => {
					const artistName = a?.Artist || a?.name || "Unknown Artist";
					return {
						name: artistName,
						url: getArtistUrlByName(artistName, platform)
					};
				});
			}

			// Caso 2: Artist como string
			if (typeof entry.Artist === "string" && entry.Artist.trim() !== "") {
				return entry.Artist
					.split(",")
					.map(x => x.trim())
					.filter(Boolean)
					.map(name => ({
						name,
						url: getArtistUrlByName(name, platform)
					}));
			}

			// Caso 3: Artists como string
			if (typeof entry.Artists === "string" && entry.Artists.trim() !== "") {
				return entry.Artists
					.split(",")
					.map(x => x.trim())
					.filter(Boolean)
					.map(name => ({
						name,
						url: getArtistUrlByName(name, platform)
					}));
			}

			return [{
				name: "Unknown Artist",
				url: null
			}];
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

			// Imagen -> TRACK
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
								style: "color:#3498db;text-decoration:underline"
						  })
						: Object.assign(document.createElement("span"), {
								textContent: a.name
						  });

					artistDiv.appendChild(node);

					if (i < song.artists.length - 1) {
						artistDiv.appendChild(document.createTextNode(", "));
					}
				});
			} else {
				artistDiv.textContent = "Unknown Artist";
			}

			card.append(img, rank, title, artistDiv);
			return card;
		}

		async function renderChart(key) {
			if (!container) return;

			try {
				await ensureMetaLoaded();

				setActiveTab(key);
				setViewAll(key);

				container.textContent = "Loading...";

				const files = chartFileCandidates[key] || chartFileCandidates.week;
				const data = await getFirstAvailableJSON(JSON_BASE_SONGS, files);

				container.textContent = "";

				if (!Array.isArray(data) || data.length === 0) {
					container.innerHTML = "<p>No data available.</p>";
					return;
				}

				const top5 = data
					.slice()
					.sort((a, b) => (a.Position ?? 9999) - (b.Position ?? 9999))
					.slice(0, 5)
					.map(entry => ({
						rank: entry.Position ?? "",
						title: entry.Title || "Unknown Title",
						artists: normalizeArtists(entry, "spotify"),
						image:
							entry.CoverImage && String(entry.CoverImage).trim() !== ""
								? entry.CoverImage
								: DEFAULT_COVER,
						spotifyURL: entry.SpotifyURL || null
					}));

				const frag = document.createDocumentFragment();
				for (const s of top5) frag.appendChild(makeSongCard(s));

				requestAnimationFrame(() => {
					container.textContent = "";
					container.appendChild(frag);
				});
			} catch (err) {
				console.error("[TopSongs] Error:", err);
				container.innerHTML = "<p>No data available.</p>";
			}
		}

		chartTabs.forEach(tab => {
			tab.addEventListener("click", () => {
				const k = tab.dataset.chart;
				current = keys.indexOf(k);
				renderChart(k);
			}, { passive: true });
		});

		renderChart("week");
	})();

	// ======================================================
	// TOP ARTISTS
	// ======================================================
	(function initTopArtists() {
		const chartTabs = $$(".chart-tab-artist");
		const container = $("#chartCardsContainerArtists");
		const viewAllBtn = $("#viewAllButtonArtists");

		const chartFileCandidates = {
			week: ["artists_top15_weekly.json", "artists_top15_daily.json", "artists_weekly.json"],
			month: ["artists_top15_monthly.json", "artist_top15_monthly.json", "artists_monthly.json"],
			general: ["artists_top15_general.json", "artist_top15_general.json", "artists_general.json"]
		};

		const keyMap = { week: "artists_weekly", month: "artists_monthly", general: "artists_general" };
		const keys = ["week", "month", "general"];
		let current = 0;

		function setActiveTab(k) {
			chartTabs.forEach(t => t.classList.toggle("active", t.dataset.chart === k));
		}

		function setViewAll(k) {
			if (viewAllBtn) viewAllBtn.href = `topartists.html?chart=${keyMap[k]}`;
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

		async function renderChart(key) {
			if (!container) return;

			try {
				setActiveTab(key);
				setViewAll(key);

				container.textContent = "Loading...";

				const files = chartFileCandidates[key] || chartFileCandidates.week;
				const rows = await getFirstAvailableJSON(JSON_BASE_ARTISTS, files);

				container.textContent = "";

				if (!Array.isArray(rows) || rows.length === 0) {
					container.innerHTML = "<p>No data available.</p>";
					return;
				}

				const top5 = rows
					.slice()
					.sort((a, b) => (a.Position ?? 9999) - (b.Position ?? 9999))
					.slice(0, 5)
					.map(r => ({
						rank: r.Position ?? "",
						name: r.Artist || "Unknown Artist",
						image: (typeof r.SpotifyImageURL === "string" && r.SpotifyImageURL.trim() !== "")
							? r.SpotifyImageURL
							: DEFAULT_COVER,
						url: r.SpotifyURL || null,
						hits: r["Number of hits"]
					}));

				const frag = document.createDocumentFragment();
				for (const a of top5) frag.appendChild(makeArtistCard(a));

				requestAnimationFrame(() => {
					container.textContent = "";
					container.appendChild(frag);
				});
			} catch (err) {
				console.error("[TopArtists] Error:", err);
				container.innerHTML = "<p>No data available.</p>";
			}
		}

		chartTabs.forEach(tab => {
			tab.addEventListener("click", () => {
				const k = tab.dataset.chart;
				current = keys.indexOf(k);
				renderChart(k);
			}, { passive: true });
		});

		renderChart("week");
	})();

	// ======================================================
	// STREAMING HIGHLIGHTS
	// ======================================================
	(function initStreamingHighlights() {
		const container = $("#chartCardsContainerStreaming");
		const toggleButtons = $$(".chart-tab-stream");
		const viewAllButton = $("#viewAllButtonStreaming");

		const chartGroups = {
			spotify: [["us", "gb", "es", "mx", "kr"]],
			apple_music: [["us", "uk", "es", "mx", "kr"]],
			youtubeInsights: [["us", "uk", "es", "mx", "kr"]],
			billboard: [["hot100", "global200"]]
		};

		let currentPlatform = "spotify";

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
						currentPlatform === "spotify" ? "spotifycharts.html" :
						currentPlatform === "apple_music" ? "applemusiccharts.html" :
						currentPlatform === "youtubeInsights" ? "youtubecharts.html" :
						"billboardcharts.html";
				}

				renderGroup(chartGroups[currentPlatform][0], currentPlatform);
			}, { passive: true });
		});

		function platformPrefixes(p) {
			if (p === "spotify") return ["SP", "SPOTIFY"];
			if (p === "apple_music") return ["am", "AM", "apple_music", "APPLE_MUSIC", "APPLE"];
			if (p === "youtubeInsights") return ["yt", "YT", "YOUTUBE"];
			return ["billboard", "BILLBOARD", "BB"];
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
				rank.textContent = (
					code === "hot100"
						? "HOT 100"
						: code === "global200"
							? "GLOBAL 200"
							: code.toUpperCase()
				);
			}

			const title = document.createElement("div");
			title.className = "chart-title";
			title.textContent = top.Title;

			const artist = document.createElement("div");
			artist.className = "chart-artist";
			const artistURL = getArtistUrlByName(top.Artist, platform);

			if (artistURL) {
				const link = Object.assign(document.createElement("a"), {
					href: artistURL,
					target: "_blank",
					rel: "noopener noreferrer",
					textContent: top.Artist,
					style: "text-decoration:underline"
				});
				artist.appendChild(link);
			} else {
				artist.textContent = top.Artist;
			}

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

			try {
				await ensureMetaLoaded();
				container.textContent = "Loading...";

				const frag = document.createDocumentFragment();
				const prefixes = platformPrefixes(platform);

				for (const code of codes) {
					let data = [];

					for (const prefix of prefixes) {
						const file = `${JSON_BASE_ALL}${prefix}_${code}.json`;
						data = await getJSON(file);

						if (Array.isArray(data) && data.length > 0) {
							console.info(`[Streaming] Usando ${file}`);
							break;
						}
						console.warn(`[Streaming] Sin datos en ${file}`);
					}

					if (!Array.isArray(data) || data.length === 0) {
						continue;
					}

					const top5 = data
						.slice()
						.sort((a, b) => (a.Position ?? 9999) - (b.Position ?? 9999))
						.slice(0, 5)
						.map(entry => {
							const id = Number(entry.SongID);

							let si = meta.siMap[id] || {};
							let ts = meta.tsMap[id] || {};

							if (platform === "apple_music") {
								if (meta.appleSiMap[id]) si = meta.appleSiMap[id];
								if (meta.appleTsMap[id]) ts = meta.appleTsMap[id];
							}

							const title = (si && si.Title) || entry.Title || "Unknown Title";
							const artist = (si && si.Artist) || entry.Artist || "Unknown";

							const coverCandidate = (ts && ts.CoverImage) || entry.CoverImage || "";
							const image =
								(typeof coverCandidate === "string" && coverCandidate.trim() !== "")
									? coverCandidate
									: DEFAULT_COVER;

							return {
								Position: entry.Position ?? "",
								Title: title,
								Artist: artist,
								Image: image,
								SpotifyURL: meta.spMap[id] || entry.SpotifyURL || null
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
			} catch (err) {
				console.error("[StreamingHighlights] Error:", err);
				container.innerHTML = "<p>No data available.</p>";
			}
		}

		ensureMetaLoaded().then(() => {
			renderGroup(chartGroups[currentPlatform][0], currentPlatform);
		});
	})();
})();