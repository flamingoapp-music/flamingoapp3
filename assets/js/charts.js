document.addEventListener("DOMContentLoaded", function () {
	const selectedPlatform = "spotifyWeekly";

	const DEFAULT_COVER = "images/backgroundlogo.png";

	const platformOptions = {
		spotifyWeekly: "DATABASES/ALL_JSON//SP_"
	};

	const siTsFiles = {
		spotifyWeekly: {
			si: "DATABASES/ALL_JSON/SI.json",
			ts: "DATABASES/ALL_JSON/TS.json",
			sp: "DATABASES/ALL_JSON/SP.json"
		}
	};

	const platformNameMap = {
		spotifyWeekly: "Spotify Weekly"
	};

	const platformLogos = {
		spotifyWeekly: "https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png"
	};

	const { si, ts, sp } = siTsFiles[selectedPlatform];

	// 🔥 CONTROL GLOBAL
	let allSongs = [];
	let visibleCount = 0;
	const batchSize = 25;
	let isLoading = false;

	function delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function loadCountryData(countryCode) {
		const dataFile = `${platformOptions[selectedPlatform]}${countryCode}.json`;

		document.getElementById("countryName").textContent =
			`${platformNameMap[selectedPlatform].toUpperCase()} ${countryCode.toUpperCase()}`;
		document.getElementById("platformLogo").src = platformLogos[selectedPlatform];

		const icon = document.getElementById("countryIcon");
		if (countryCode.toLowerCase() === "global") {
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

				allSongs = data.map(entry => {
					const id = entry.SongID;

					const artistIDs = (siMap[id]?.ArtistID || "")
						.split(",")
						.map(x => x.trim())
						.filter(Boolean);

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

					const coverCandidate = tsMap[id]?.CoverImage;
					const finalCover =
						typeof coverCandidate === "string" && coverCandidate.trim() !== ""
							? coverCandidate
							: DEFAULT_COVER;

					return {
						SongID: id,
						Position: entry.Position,
						Title: siMap[id]?.Title || "Unknown Title",
						ArtistNames: artistLinks,
						CoverImage: finalCover,
						SpotifyURL: spMap[id] || null
					};
				}).sort((a, b) => a.Position - b.Position);

				const songList = document.getElementById("songList");
				songList.innerHTML = "";

				visibleCount = 0;

				loadMoreSongs(); // primera carga
			})
			.catch(err => console.error("Error:", err));
	}

	async function loadMoreSongs() {
		if (isLoading) return;

		isLoading = true;

		const nextBatch = allSongs.slice(visibleCount, visibleCount + batchSize);

		if (nextBatch.length === 0) {
			isLoading = false;
			return;
		}

		for (let song of nextBatch) {
			appendSong(song);
			await delay(5); // 🔥 efecto suave
		}

		visibleCount += batchSize;

		isLoading = false;

		// 🔥 delay visual sin bloquear
		setTimeout(() => {}, 500);
	}

	function appendSong(song) {
		const songList = document.getElementById("songList");

		const li = document.createElement("li");

		const rank = document.createElement("div");
		rank.className = "song-rank";
		rank.textContent = `${song.Position}.`;

		const img = document.createElement("img");
		img.src = song.CoverImage;
		img.alt = song.Title;

		img.onerror = () => img.src = DEFAULT_COVER;

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

				// ✅ TU ESTILO ORIGINAL
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
	}

	// 🔥 SCROLL INTELIGENTE
	window.addEventListener("scroll", () => {
		const scrollTop = window.scrollY;
		const windowHeight = window.innerHeight;
		const docHeight = document.body.offsetHeight;

		if (scrollTop + windowHeight >= docHeight - 400) {
			if (visibleCount < allSongs.length) {
				loadMoreSongs();
			}
		}
	});

	const countrySelect = document.getElementById("countrySelect");
	if (countrySelect) {
		countrySelect.addEventListener("change", function () {
			loadCountryData(this.value);
		});
	}

	loadCountryData("global");
});