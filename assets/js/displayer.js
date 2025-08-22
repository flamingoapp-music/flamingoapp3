(() => {
	// ------- Utilidades -------
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
	const sleep = (ms) => new Promise(r => setTimeout(r, ms));

	const JSON_BASE_SONGS = "DATABASES/TOP_SONGS/";
	const JSON_BASE_ARTISTS = "DATABASES/TOP_ARTISTS/";
	const JSON_BASE_ALL = "DATABASES/ALL_JSON/";

	// Cache en memoria para no repetir fetch
	const _cache = new Map();
	async function getJSON(url) {
		if (_cache.has(url)) return _cache.get(url);
		const p = fetch(url, { cache: "force-cache" }).then(r => r.json());
		_cache.set(url, p);
		return p;
	}

	// Preload de metadatos compartidos (una sola vez)
	let metaReady;
	const meta = {
		siMap: null,
		tsMap: null,
		spMap: null,
		artistURLMap: null
	};

	function indexBy(arr, key, mapValue = x => x) {
		const m = Object.create(null);
		for (const it of arr) m[it[key]] = mapValue(it);
		return m;
	}

	function ensureMetaLoaded() {
		if (metaReady) return metaReady;
		metaReady = (async () => {
			const [si, ts, sp, artistFeatures] = await Promise.all([
				getJSON(`${JSON_BASE_ALL}SI.json`),
				getJSON(`${JSON_BASE_ALL}TS.json`),
				getJSON(`${JSON_BASE_ALL}SP.json`),
				getJSON(`${JSON_BASE_ALL}ARTIST_FEATURES.json`)
			]);
			meta.siMap = indexBy(si, "SongID");
			meta.tsMap = indexBy(ts, "SongID");
			meta.spMap = indexBy(sp, "SongID", x => x.Spotify_URL);
			meta.artistURLMap = Object.create(null);
			for (const a of artistFeatures) {
				if (a.Artist) meta.artistURLMap[a.Artist] = a.SpotifyURL || null;
			}
		})();
		return metaReady;
	}

	// ------- TOP SONGS (home: top 15 -> top 5) -------
	(function initTopSongs() {
		const chartTabs = $$(".chart-tab");
		const container = $("#chartCardsContainer");
		const viewAllBtn = $("#viewAllButton");

		const chartMap = {
			week: "top_15_weekly.json",
			month: "top_15_monthly.json",
			general: "top_15_general.json"
		};

		const keyMap = { week: "top_weekly", month: "top_monthly", general: "top_general" };
		const keys = ["week", "month", "general"];
		let current = 0, rotating = true;

		function setActiveTab(k) {
			chartTabs.forEach(t => t.classList.toggle("active", t.dataset.chart === k));
		}

		function setViewAll(k) {
			if (viewAllBtn) viewAllBtn.href = `topsongs.html?chart=${keyMap[k]}`;
		}

		function makeSongCard(song) {
			const card = document.createElement("div");
			card.className = "chart-card";

			const img = document.createElement("img");
			img.className = "chart-img";
			img.src = song.image;
			img.alt = song.title;
			img.loading = "lazy";
			img.decoding = "async";
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

			song.artists.forEach((a, i) => {
				const node = a.url ? Object.assign(document.createElement("a"), {
					href: a.url, target: "_blank", rel: "noopener noreferrer", textContent: a.name,
					style: "color:#3498db;text-decoration:underline"
				}) : Object.assign(document.createElement("span"), { textContent: a.name });
				artistDiv.appendChild(node);
				if (i < song.artists.length - 1) artistDiv.appendChild(document.createTextNode(", "));
			});

			card.append(img, rank, title, artistDiv);
			return card;
		}

		async function renderChart(key) {
			setActiveTab(key);
			setViewAll(key);

			const data = await getJSON(`${JSON_BASE_SONGS}${chartMap[key]}`);
			// Ya viene enriquecido; por si acaso, orden y top5
			const top5 = data
				.slice()
				.sort((a, b) => a.Position - b.Position)
				.slice(0, 5)
				.map(entry => ({
					rank: entry.Position,
					title: entry.Title || "Unknown Title",
					artists: (entry.Artists || []).map(a => ({ name: a.Artist || "Unknown", url: a.SpotifyURL || null })),
					image: entry.CoverImage || "images/default_cover.jpg",
					spotifyURL: entry.SpotifyURL || null
				}));

			const frag = document.createDocumentFragment();
			for (const s of top5) frag.appendChild(makeSongCard(s));

			// Evita layouts innecesarios
			requestAnimationFrame(() => {
				container.textContent = "";
				container.appendChild(frag);
			});
		}

		chartTabs.forEach(tab => {
			tab.addEventListener("click", () => {
				const k = tab.dataset.chart;
				current = keys.indexOf(k);
				rotating = false; // pausa rotación al interactuar
				renderChart(k);
			}, { passive: true });
		});

		// Rotación suave con pausa al cambiar de pestaña/visibilidad
		(async function rotate() {
			while (true) {
				await sleep(10000);
				if (document.hidden || !rotating) continue;
				current = (current + 1) % keys.length;
				renderChart(keys[current]);
			}
		})();

		// Primera carga
		renderChart("week");
	})();

	// ------- TOP ARTISTS (home) -------
	(function initTopArtists() {
		const chartTabs = $$(".chart-tab-artist");
		const container = $("#chartCardsContainerArtists");
		const viewAllBtn = $("#viewAllButtonArtists");

		const chartMap = {
			week: "artists_top15_daily.json",
			month: "artist_top15_monthly.json",
			general: "artist_top15_general.json"
		};
		const keyMap = { week: "artists_weekly", month: "artists_monthly", general: "artists_general" };
		const keys = ["week", "month", "general"];
		let current = 0, rotating = true;

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
			img.src = a.image;
			img.alt = a.name;
			img.loading = "lazy";
			img.decoding = "async";
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
			setActiveTab(key);
			setViewAll(key);

			const rows = await getJSON(`${JSON_BASE_ARTISTS}${chartMap[key]}`);
			const top5 = rows
				.slice()
				.sort((a, b) => a.Position - b.Position)
				.slice(0, 5)
				.map(r => ({
					rank: r.Position,
					name: r.Artist,
					image: r.SpotifyImageURL || "images/default_cover.jpg",
					url: r.SpotifyURL || null,
					hits: r["Number of hits"]
				}));

			const frag = document.createDocumentFragment();
			for (const a of top5) frag.appendChild(makeArtistCard(a));

			requestAnimationFrame(() => {
				container.textContent = "";
				container.appendChild(frag);
			});
		}

		chartTabs.forEach(tab => {
			tab.addEventListener("click", () => {
				const k = tab.dataset.chart;
				current = keys.indexOf(k);
				rotating = false;
				renderChart(k);
			}, { passive: true });
		});

		(async function rotate() {
			while (true) {
				await sleep(10000);
				if (document.hidden || !rotating) continue;
				current = (current + 1) % keys.length;
				renderChart(keys[current]);
			}
		})();

		renderChart("week");
	})();

	// ------- STREAMING HIGHLIGHTS (home) -------
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

				document.body.classList.toggle('apple_music-active', currentPlatform === 'apple_music');
				document.body.classList.toggle('youtube-active', currentPlatform === 'youtubeInsights');
				document.body.classList.toggle('billboard-active', currentPlatform === 'billboard');

				viewAllButton.href =
					currentPlatform === "spotify" ? "spotifycharts.html" :
						currentPlatform === "apple_music" ? "applemusicharts.html" :
							currentPlatform === "youtubeInsights" ? "youtubecharts.html" :
								"billboardcharts.html";

				renderGroup(chartGroups[currentPlatform][0], currentPlatform);
			}, { passive: true });
		});

		function platformPrefix(p) {
			if (p === "spotify") return "SP";
			if (p === "apple_music") return "apple_music";
			if (p === "youtubeInsights") return "YT";
			return "billboard";
		}

		function makeStreamCard(top5, code, platform) {
			const card = document.createElement("div");
			card.className = "chart-card stream-card";

			const top = top5[0];
			const img = document.createElement("img");
			img.className = "chart-img";
			img.src = top.Image;
			img.alt = top.Title;
			img.loading = "lazy";
			img.decoding = "async";
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
				rank.textContent = (code === "hot100" ? "100" : code === "global200" ? "200" : code.toUpperCase());
			}

			const title = document.createElement("div");
			title.className = "chart-title";
			title.textContent = top.Title;

			const artist = document.createElement("div");
			artist.className = "chart-artist";
			const artistURL = meta.artistURLMap[top.Artist] || null;
			if (artistURL) {
				const link = Object.assign(document.createElement("a"), {
					href: artistURL, target: "_blank", rel: "noopener noreferrer", textContent: top.Artist,
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
			await ensureMetaLoaded();
			container.textContent = "";

			const frag = document.createDocumentFragment();
			const prefix = platformPrefix(platform);

			// Pre-fetch en paralelo
			const files = codes.map(code => `${JSON_BASE_ALL}${prefix}_${code}.json`);
			const datasets = await Promise.all(files.map(getJSON));

			datasets.forEach((platformData, idx) => {
				const top5 = platformData
					.slice()
					.sort((a, b) => a.Position - b.Position)
					.slice(0, 5)
					.map(entry => {
						const id = entry.SongID;
						return {
							Position: entry.Position,
							Title: meta.siMap[id]?.Title || "Unknown",
							Artist: meta.siMap[id]?.Artist || "Unknown",
							Image: meta.tsMap[id]?.CoverImage || "images/default_cover.jpg",
							SpotifyURL: meta.spMap[id] || null
						};
					});

				frag.appendChild(makeStreamCard(top5, codes[idx], platform));
			});

			requestAnimationFrame(() => {
				container.appendChild(frag);
			});
		}

		// Carga inicial
		ensureMetaLoaded().then(() => {
			renderGroup(chartGroups[currentPlatform][0], currentPlatform);
		});
	})();
})();
