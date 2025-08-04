document.addEventListener("DOMContentLoaded", function () {
	const selectedPlatform = "topsongs";

	const platformOptions = {
		topsongs: "DATABASES/TOP_SONGS/"
	};

	const siTsFiles = {
		topsongs: {
			si: "DATABASES/TOP_SONGS/SI.json",
			ts: "DATABASES/TOP_SONGS/TS.json",
			sp: "DATABASES/TOP_SONGS/SP.json"
		}
	};

	const platformNameMap = {
		topsongs: "Top Songs"
	};

	const platformLogos = {
		topsongs: "images/logo.png"
	};

	const { si, ts, sp } = siTsFiles[selectedPlatform];

	const urlParams = new URLSearchParams(window.location.search);
	const chartType = urlParams.get("chart") || "top_weekly";

	const topListSelect = document.getElementById("topListSelect");
	if (topListSelect) {
		topListSelect.value = chartType;
		topListSelect.addEventListener("change", function () {
			loadTopData(this.value);
		});
	}

	loadTopData(chartType);

	function loadTopData(topType) {
		const dataFile = `${platformOptions[selectedPlatform]}${topType}.json`;

		document.getElementById("listName").textContent = `${platformNameMap[selectedPlatform].toUpperCase()} - ${topType.replace("top_", "").toUpperCase()}`;
		document.getElementById("platformLogo").src = platformLogos[selectedPlatform];

		const fetches = [
			fetch(dataFile).then(r => r.json()),
			fetch(si).then(r => r.json()),
			fetch(ts).then(r => r.json()),
			fetch(sp).then(r => r.json()),
			fetch("DATABASES/TOP_SONGS/ARTIST_FEATURES.json").then(r => r.json())
		];

		Promise.all(fetches)
			.then(([data, siData, tsData, spData, artistFeatures]) => {
				const spMap = Object.fromEntries(spData.map(d => [d.SongID, d.Spotify_URL]));
				const siMap = Object.fromEntries(siData.map(d => [d.SongID, d]));
				const tsMap = Object.fromEntries(tsData.map(d => [d.SongID, d]));
				const artistMapByID = Object.fromEntries(artistFeatures.map(a => [String(a.ArtistID), a]));

				const merged = data.map(entry => {
					const id = entry.SongID;
					const artistIDs = (siMap[id]?.ArtistID || "").split(",").map(x => x.trim()).filter(Boolean);
					const artistLinks = [];

					artistIDs.forEach(aid => {
						const artistObj = artistMapByID[aid];
						if (artistObj) {
							artistLinks.push({
								name: artistObj.Artist,
								url: artistObj.SpotifyURL || null
							});
						}
					});

					return {
						SongID: id,
						Position: entry.Position,
						Title: siMap[id]?.Title || "Unknown Title",
						ArtistNames: artistLinks,
						CoverImage: tsMap[id]?.CoverImage || "images/default_cover.jpg",
						SpotifyURL: spMap[id] || null
					};
				});

				updateSongListUI(merged.sort((a, b) => a.Position - b.Position).slice(0, 100));
			})
			.catch(err => {
				console.error("Error loading top data:", err);
				document.getElementById("songList").innerHTML = `<li>Error loading top data.</li>`;
			});
	}

	function updateSongListUI(songs) {
		const songList = document.getElementById("songList");
		songList.innerHTML = "";

		songs.forEach(song => {
			const li = document.createElement("li");

			const rank = document.createElement("div");
			rank.className = "song-rank";
			rank.textContent = `${song.Position}.`;

			const img = document.createElement("img");
			img.src = song.CoverImage;
			img.alt = `${song.Title} Cover`;

			const info = document.createElement("div");
			info.className = "song-info-list";

			const title = document.createElement("span");
			title.className = "song-title";
			title.textContent = song.Title;

			const artistContainer = document.createElement("div");
			artistContainer.className = "song-artist";

			song.ArtistNames.forEach((artistObj, index) => {
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
				document.querySelectorAll(".song-list li").forEach(el => el.classList.remove("selected"));
				li.classList.add("selected");
			});

			if (song.SpotifyURL) {
				img.style.cursor = "pointer";
				img.addEventListener("click", () => {
					const isSelected = li.classList.contains("selected");
					if (!isSelected) {
						document.querySelectorAll(".song-list li").forEach(el => el.classList.remove("selected"));
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
