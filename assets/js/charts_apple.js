document.addEventListener("DOMContentLoaded", function () {
	const selectedPlatform = "appleMusic";

	const platformOptions = {
		appleMusic: "DATABASES/ALL_JSON/apple_music_"
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
		appleMusic: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg'
	};

	const { si, ts, sp } = siTsFiles[selectedPlatform];

	function loadCountryData(countryCode) {
		const dataFile = `${platformOptions[selectedPlatform]}${countryCode}.json`;

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

		const fetches = [
			fetch(dataFile).then(r => r.json()),
			fetch(si).then(r => r.json()),
			fetch(ts).then(r => r.json()),
			fetch(sp).then(r => r.json()),
			fetch("DATABASES/ALL_JSON/ARTIST_FEATURES.json").then(r => r.json())
		];

		Promise.all(fetches)
			.then(([data, siData, tsData, spData, artistFeatures]) => {
				const spMap = Object.fromEntries(spData.map(d => [d.SongID, d.Spotify_URL]));
				const siMap = Object.fromEntries(siData.map(d => [d.SongID, d]));
				const tsMap = Object.fromEntries(tsData.map(d => [d.SongID, d]));

				const artistMapByID = Object.fromEntries(
					artistFeatures.map(a => [String(a.ArtistID), a])
				);

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
				console.error("Error loading data:", err);
				document.getElementById("songList").innerHTML = `<li>Error loading ${countryCode.toUpperCase()} data.</li>`;
			});
	}

	const countrySelect = document.getElementById("countrySelect");
	if (countrySelect) {
		countrySelect.addEventListener("change", function () {
			loadCountryData(this.value);
		});
	}

	loadCountryData("us");

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
