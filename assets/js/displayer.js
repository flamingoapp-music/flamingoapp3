document.addEventListener("DOMContentLoaded", function () {
	const chartTabs = document.querySelectorAll(".chart-tab");
	const container = document.getElementById("chartCardsContainer");
	const viewAllBtn = document.getElementById("viewAllButton");

	const chartMap = {
		week: "top_weekly.json",
		month: "top_monthly.json",
		general: "top_general.json"
	};

	const platformFolder = "DATABASES/TOP_SONGS/";
	const siFile = platformFolder + "SI.json";
	const tsFile = platformFolder + "TS.json";
	const spFile = platformFolder + "SP.json";
	const artistFeaturesFile = platformFolder + "ARTIST_FEATURES.json";

	let chartKeys = ["week", "month", "general"];
	let currentChartIndex = 0;

	function loadChart(chartKey) {
		const topFile = platformFolder + chartMap[chartKey];

		Promise.all([
			fetch(topFile).then(r => r.json()),
			fetch(siFile).then(r => r.json()),
			fetch(tsFile).then(r => r.json()),
			fetch(spFile).then(r => r.json()),
			fetch(artistFeaturesFile).then(r => r.json())
		])
			.then(([topData, siData, tsData, spData, artistData]) => {
				const siMap = Object.fromEntries(siData.map(d => [d.SongID, d]));
				const tsMap = Object.fromEntries(tsData.map(d => [d.SongID, d]));
				const spMap = Object.fromEntries(spData.map(d => [d.SongID, d.Spotify_URL]));
				const artistMap = Object.fromEntries(artistData.map(d => [String(d.ArtistID), d]));

				const top5 = topData
					.sort((a, b) => a.Position - b.Position)
					.slice(0, 5)
					.map(entry => {
						const songID = entry.SongID;
						const si = siMap[songID] || {};
						const ts = tsMap[songID] || {};
						const spotifyURL = spMap[songID] || null;
						const artistIDs = (si.ArtistID || "").split(",").map(a => a.trim());

						const artistLinks = artistIDs.map(id => {
							const artist = artistMap[id];
							if (artist) {
								return {
									name: artist.Artist,
									url: artist.SpotifyURL || null
								};
							}
							return {name: "Unknown", url: null};
						});

						return {
							rank: entry.Position,
							title: si.Title || "Unknown Title",
							artists: artistLinks,
							image: ts.CoverImage || "images/default_cover.jpg",
							spotifyURL: spotifyURL
						};
					});

				updateTabs(chartKey);
				updateViewAllButton(chartKey);
				renderCards(top5);
			})
			.catch(err => {
				console.error("Failed to load chart data:", err);
			});
	}

	function renderCards(songs) {
		container.innerHTML = "";
		songs.forEach(song => {
			const card = document.createElement("div");
			card.className = "chart-card";

			const img = document.createElement("img");
			img.src = song.image;
			img.alt = song.title;
			img.className = "chart-img";
			img.style.cursor = song.spotifyURL ? "pointer" : "default";
			if (song.spotifyURL) {
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

			song.artists.forEach((artist, i) => {
				if (artist.url) {
					const link = document.createElement("a");
					link.href = artist.url;
					link.target = "_blank";
					link.rel = "noopener noreferrer";
					link.textContent = artist.name;
					link.style.color = "#3498db";
					link.style.textDecoration = "underline";
					artistDiv.appendChild(link);
				} else {
					const span = document.createElement("span");
					span.textContent = artist.name;
					artistDiv.appendChild(span);
				}
				if (i < song.artists.length - 1) {
					artistDiv.appendChild(document.createTextNode(", "));
				}
			});

			card.appendChild(img);
			card.appendChild(rank);
			card.appendChild(title);
			card.appendChild(artistDiv);

			container.appendChild(card);
		});
	}

	function updateTabs(activeKey) {
		chartTabs.forEach(tab => {
			const key = tab.getAttribute("data-chart");
			if (key === activeKey) {
				tab.classList.add("active");
			} else {
				tab.classList.remove("active");
			}
		});
	}

	function updateViewAllButton(activeKey) {
		const keyMap = {
			week: "top_weekly",
			month: "top_monthly",
			general: "top_general"
		};
		if (viewAllBtn) {
			viewAllBtn.href = `topsongs.html?chart=${keyMap[activeKey]}`;
		}
	}


	// Setup manual switching
	chartTabs.forEach(tab => {
		tab.addEventListener("click", () => {
			const key = tab.getAttribute("data-chart");
			currentChartIndex = chartKeys.indexOf(key);
			loadChart(key);
		});
	});

	// Auto-scroll every 10 seconds
	setInterval(() => {
		currentChartIndex = (currentChartIndex + 1) % chartKeys.length;
		loadChart(chartKeys[currentChartIndex]);
	}, 10000);

	// Initial load
	loadChart("week");
});


document.addEventListener("DOMContentLoaded", function () {
	const chartTabs = document.querySelectorAll(".chart-tab-artist");
	const container = document.getElementById("chartCardsContainerArtists");
	const viewAllBtn = document.getElementById("viewAllButtonArtists");

	const chartMap = {
		week: "artists_weekly.json",
		month: "artists_monthly.json",
		general: "artists_general.json"
	};

	const basePath = "DATABASES/TOP_ARTISTS/";
	const artistFeaturesFile = basePath + "ARTIST_FEATURES_TOP.json";

	let chartKeys = ["week", "month", "general"];
	let currentChartIndex = 0;

	function loadChart(chartKey) {
		const dataFile = basePath + chartMap[chartKey];

		Promise.all([
			fetch(dataFile).then(r => r.json()),
			fetch(artistFeaturesFile).then(r => r.json())
		])
			.then(([rankingData, artistFeatures]) => {
				const artistMap = Object.fromEntries(artistFeatures.map(a => [String(a.ArtistID), a]));

				const top5 = rankingData
					.sort((a, b) => a.Position - b.Position)
					.slice(0, 5)
					.map(entry => {
						const artistObj = artistMap[String(entry.ArtistID)] || {};
						return {
							rank: entry.Position,
							name: entry.Artist,
							image: artistObj.SpotifyImageURL || "images/default_cover.jpg",
							url: artistObj.SpotifyURL || null,
							hits: entry["Number of hits"] || "?"
						};
					});

				updateTabs(chartKey);
				updateViewAllButton(chartKey);
				renderCards(top5);
			})
			.catch(err => {
				console.error("Error loading artist data:", err);
			});
	}

	function renderCards(artists) {
		container.innerHTML = "";
		artists.forEach(artist => {
			const card = document.createElement("div");
			card.className = "chart-card artist-card";

			const img = document.createElement("img");
			img.src = artist.image;
			img.alt = artist.name;
			img.className = "chart-img";
			img.style.cursor = artist.url ? "pointer" : "default";
			if (artist.url) {
				img.addEventListener("click", () => window.open(artist.url, "_blank"));
			}

			const rank = document.createElement("div");
			rank.className = "chart-rank";
			rank.textContent = artist.rank;

			const title = document.createElement("div");
			title.className = "chart-title";
			title.textContent = artist.name;

			const hits = document.createElement("div");
			hits.className = "chart-artist";
			hits.textContent = `Hits: ${artist.hits}`;

			card.appendChild(img);
			card.appendChild(rank);
			card.appendChild(title);
			card.appendChild(hits);

			container.appendChild(card);
		});
	}

	function updateTabs(activeKey) {
		chartTabs.forEach(tab => {
			const key = tab.getAttribute("data-chart");
			tab.classList.toggle("active", key === activeKey);
		});
	}

	function updateViewAllButton(activeKey) {
		const keyMap = {
			week: "artists_weekly",
			month: "artists_monthly",
			general: "artists_general"
		};
		if (viewAllBtn) {
			viewAllBtn.href = `topartists.html?chart=${keyMap[activeKey]}`;
		}
	}


	chartTabs.forEach(tab => {
		tab.addEventListener("click", () => {
			const key = tab.getAttribute("data-chart");
			currentChartIndex = chartKeys.indexOf(key);
			loadChart(key);
		});
	});

	setInterval(() => {
		currentChartIndex = (currentChartIndex + 1) % chartKeys.length;
		loadChart(chartKeys[currentChartIndex]);
	}, 10000);

	loadChart("week");
});

document.addEventListener("DOMContentLoaded", function () {
	const container = document.getElementById("chartCardsContainerStreaming");
	const leftBtn = document.querySelector(".spotify-nav.left");
	const rightBtn = document.querySelector(".spotify-nav.right");
	const toggleButtons = document.querySelectorAll(".chart-tab-stream");
	const viewAllButton = document.getElementById("viewAllButtonStreaming");

	const chartGroups = {
		spotify: [
			["us", "gb", "ca", "fr", "kr"],
			["mx", "es", "ar", "co", "cl"]
		],
		apple_music: [
			["us", "uk", "ca", "fr", "kr"],
			["mx", "es", "ar", "co", "cl"]
		],
		youtubeInsights: [
			["us", "uk", "ca", "fr", "kr"],
			["mx", "es", "ar", "co", "cl"]
		],
		billboard: [
			["hot100", "global200"]
		]
	};

	let currentPlatform = "spotify";
	let currentGroupIndex = 0;

	toggleButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			toggleButtons.forEach(b => b.classList.remove("active"));
			btn.classList.add("active");
			currentPlatform = btn.getAttribute("data-platform");
			currentGroupIndex = 0;

			document.body.classList.remove('apple_music-active', 'youtube-active', 'billboard-active');
			document.body.classList.toggle('apple_music-active', currentPlatform === 'apple_music');
			document.body.classList.toggle('youtube-active', currentPlatform === 'youtubeInsights');
			document.body.classList.toggle('billboard-active', currentPlatform === 'billboard');

			if (currentPlatform === 'spotify') {
				viewAllButton.href = "spotifycharts.html";
			} else if (currentPlatform === 'apple_music') {
				viewAllButton.href = "applemusicharts.html";
			} else if (currentPlatform === 'youtubeInsights') {
				viewAllButton.href = "youtubecharts.html";
			} else if (currentPlatform === 'billboard') {
				viewAllButton.href = "billboardcharts.html";
			}

			loadCharts(chartGroups[currentPlatform][currentGroupIndex], currentPlatform);
		});
	});

	async function loadCharts(codes, platform) {
		container.innerHTML = "";

		for (const code of codes) {
			try {
				let prefix = "";
				if (platform === "spotify") prefix = "SP";
				else if (platform === "apple_music") prefix = "apple_music";
				else if (platform === "youtubeInsights") prefix = "YT";
				else if (platform === "billboard") prefix = "billboard";

				const file = `DATABASES/ALL_JSON/${prefix}_${code}.json`;

				const [platformData, si, ts, sp, artistFeatures] = await Promise.all([
					fetch(file).then(r => r.json()),
					fetch("DATABASES/ALL_JSON/SI.json").then(r => r.json()),
					fetch("DATABASES/ALL_JSON/TS.json").then(r => r.json()),
					fetch("DATABASES/ALL_JSON/SP.json").then(r => r.json()),
					fetch("DATABASES/ALL_JSON/ARTIST_FEATURES.json").then(r => r.json())
				]);

				const siMap = Object.fromEntries(si.map(item => [item.SongID, item]));
				const tsMap = Object.fromEntries(ts.map(item => [item.SongID, item]));
				const spMap = Object.fromEntries(sp.map(item => [item.SongID, item.Spotify_URL]));
				const artistMap = Object.fromEntries(artistFeatures.map(a => [a.Artist, a.SpotifyURL]));

				const merged = platformData.map(entry => {
					const id = entry.SongID;
					return {
						Position: entry.Position,
						Title: siMap[id]?.Title || "Unknown",
						Artist: siMap[id]?.Artist || "Unknown",
						Image: tsMap[id]?.CoverImage || "images/default_cover.jpg",
						SpotifyURL: spMap[id] || null
					};
				}).sort((a, b) => a.Position - b.Position).slice(0, 5);

				const card = document.createElement("div");
				card.className = "chart-card stream-card";

				const img = document.createElement("img");
				img.className = "chart-img";
				img.src = merged[0].Image;
				img.alt = merged[0].Title;
				if (merged[0].SpotifyURL) {
					img.style.cursor = "pointer";
					img.addEventListener("click", () => window.open(merged[0].SpotifyURL, "_blank"));
				}

				const rank = document.createElement("div");
				rank.className = "chart-rank";
				if (platform !== "billboard") {
					const flagCode = code === "uk" ? "gb" : code;
					const flagImg = document.createElement("img");
					flagImg.src = `https://flagcdn.com/24x18/${flagCode}.png`;
					flagImg.alt = code;
					flagImg.className = "chart-flag";
					rank.appendChild(flagImg);
				} else {
					rank.textContent = code === "hot100" ? "100" : code === "global200" ? "200" : code.toUpperCase();
				}

				const title = document.createElement("div");
				title.className = "chart-title";
				title.textContent = merged[0].Title;

				const artist = document.createElement("div");
				artist.className = "chart-artist";
				const artistURL = artistMap[merged[0].Artist] || null;
				if (artistURL) {
					const link = document.createElement("a");
					link.href = artistURL;
					link.target = "_blank";
					link.rel = "noopener noreferrer";
					link.textContent = merged[0].Artist;
					link.style.color = "#f1c40f";
					link.style.textDecoration = "underline";
					artist.appendChild(link);
				} else {
					artist.textContent = merged[0].Artist;
				}

				const buttonList = document.createElement("div");
				buttonList.className = "chart-others";

				merged.slice(1, 5).forEach(song => {
					const button = document.createElement("button");
					button.className = "stream-button-green";
					button.innerHTML = `<strong>${song.Position}.</strong> <span style="color:#000000">${song.Title}</span>`;
					if (song.SpotifyURL) {
						button.style.cursor = "pointer";
						button.addEventListener("click", () => window.open(song.SpotifyURL, "_blank"));
					}
					buttonList.appendChild(button);
				});

				card.appendChild(img);
				card.appendChild(rank);
				card.appendChild(title);
				card.appendChild(artist);
				card.appendChild(buttonList);
				container.appendChild(card);
			} catch (err) {
				console.error(`Failed to load ${platform}_${code} chart:`, err);
			}
		}
	}

	function loadNextGroup() {
		const groupList = chartGroups[currentPlatform];
		currentGroupIndex = (currentGroupIndex + 1) % groupList.length;
		loadCharts(groupList[currentGroupIndex], currentPlatform);
	}

	function loadPrevGroup() {
		const groupList = chartGroups[currentPlatform];
		currentGroupIndex = (currentGroupIndex - 1 + groupList.length) % groupList.length;
		loadCharts(groupList[currentGroupIndex], currentPlatform);
	}

	leftBtn.addEventListener("click", loadPrevGroup);
	rightBtn.addEventListener("click", loadNextGroup);

	loadCharts(chartGroups[currentPlatform][currentGroupIndex], currentPlatform);
	setInterval(loadNextGroup, 30000);
});
