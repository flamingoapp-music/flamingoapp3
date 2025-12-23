document.addEventListener("DOMContentLoaded", function () {
	const basePath = "DATABASES/TOP_ARTISTS/";
	const artistFeaturesFile = basePath + "ARTIST_FEATURES.json";

	// ✅ Fallback cover (ruta web relativa, NO ruta Windows)
	const DEFAULT_COVER = "images/backgroundlogo.png";

	const topListSelect = document.getElementById("topListSelect");
	const listName = document.getElementById("listName");
	const songList = document.getElementById("songList");
	const platformLogo = document.getElementById("platformLogo");

	function loadArtistData(listFile) {
		Promise.all([
			fetch(basePath + listFile + ".json").then(r => r.json()),
			fetch(artistFeaturesFile).then(r => r.json())
		])
			.then(([rankingData, artistFeatures]) => {
				const artistMap = Object.fromEntries(
					(Array.isArray(artistFeatures) ? artistFeatures : []).map(a => [String(a.ArtistID), a])
				);

				const merged = (Array.isArray(rankingData) ? rankingData : []).map(entry => {
					const artistObj = artistMap[String(entry.ArtistID)] || {};

					// ✅ imagen robusta: si falta/está vacía -> DEFAULT_COVER
					const imgCandidate = artistObj.SpotifyImageURL;
					const finalImg =
						typeof imgCandidate === "string" && imgCandidate.trim() !== ""
							? imgCandidate
							: DEFAULT_COVER;

					return {
						Position: entry.Position,
						Artist: entry.Artist,
						Image: finalImg,
						URL: artistObj.SpotifyURL || null,
						Hits: entry["Number of hits"]
					};
				});

				renderList(merged);
			})
			.catch(err => {
				console.error("Error loading artist data:", err);
				songList.innerHTML = `<li>Error loading artist data.</li>`;
			});
	}

	function renderList(artists) {
		songList.innerHTML = "";

		artists.forEach(artist => {
			const li = document.createElement("li");

			const rank = document.createElement("div");
			rank.className = "song-rank";
			rank.textContent = `${artist.Position}.`;

			const img = document.createElement("img");
			img.src = artist.Image || DEFAULT_COVER;
			img.alt = `${artist.Artist} Image`;

			// ✅ fallback si la imagen falla al cargar
			img.onerror = () => {
				img.src = DEFAULT_COVER;
			};

			const info = document.createElement("div");
			info.className = "song-info-list";

			const title = document.createElement("span");
			title.className = "song-title";
			title.textContent = artist.Artist;

			const hits = document.createElement("div");
			hits.className = "song-artist";
			hits.textContent = `Hits: ${artist.Hits}`;

			info.appendChild(title);
			info.appendChild(hits);

			li.appendChild(rank);
			li.appendChild(img);
			li.appendChild(info);

			li.addEventListener("click", () => {
				document.querySelectorAll(".song-list li").forEach(el => el.classList.remove("selected"));
				li.classList.add("selected");
			});

			if (artist.URL) {
				img.style.cursor = "pointer";
				img.addEventListener("click", () => {
					const isSelected = li.classList.contains("selected");
					if (!isSelected) {
						document.querySelectorAll(".song-list li").forEach(el => el.classList.remove("selected"));
						li.classList.add("selected");
					} else {
						window.open(artist.URL, "_blank");
					}
				});
			}

			songList.appendChild(li);
		});
	}

	// Dropdown listener
	if (topListSelect) {
		topListSelect.addEventListener("change", function () {
			const selected = this.value;
			listName.textContent = `TOP ARTISTS - ${selected.replace("artists_", "").toUpperCase()}`;
			platformLogo.src = "images/logo.png";
			loadArtistData(selected);
		});
	}

	// Get chart query parameter
	const urlParams = new URLSearchParams(window.location.search);
	const chartParam = urlParams.get("chart") || "artists_weekly";

	// Update list name title
	listName.textContent = `TOP ARTISTS - ${chartParam.replace("artists_", "").toUpperCase()}`;
	platformLogo.src = "images/logo.png";

	// Load chart
	loadArtistData(chartParam);
});
