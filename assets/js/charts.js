document.addEventListener("DOMContentLoaded", function () {
	const selectedPlatform = "spotifyWeekly";

	const DEFAULT_COVER = "images/backgroundlogo.png";

	const platformOptions = {
		spotifyWeekly: "DATABASES/ALL_JSON/SP_"
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
		spotifyWeekly:
			"https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png"
	};

	const { si, ts, sp } = siTsFiles[selectedPlatform];

	// ============================================================
	// GLOBAL CONTROL
	// ============================================================

	let allSongs = [];
	let visibleCount = 0;

	const batchSize = 25;

	let isLoading = false;


	// ============================================================
	// HELPERS
	// ============================================================

	function delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}


	function normalizeText(value) {
		return String(value || "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/\s+/g, " ")
			.trim();
	}


	function firstNonEmpty(...values) {
		for (const value of values) {
			if (
				value !== null &&
				value !== undefined &&
				String(value).trim() !== ""
			) {
				return String(value).trim();
			}
		}

		return "";
	}


	function getSongID(value) {
		if (
			value === null ||
			value === undefined ||
			value === ""
		) {
			return "";
		}

		return String(value);
	}


	// Artist resolver: prefer explicit per-song ArtistLinks, then longest known
	// individual artist names. Never align ArtistID arrays by index.
	function artistKey(value) {
		return normalizeText(value).replace(/[^\p{L}\p{N}]/gu, "");
	}
	function validArtistURL(row) {
		const url = firstNonEmpty(row?.SpotifyURL, row?.Spotify_URL);
		return /^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]+(?:[/?#]|$)/.test(url) ? url : null;
	}
	function resolveArtistNames(displayText, structured, artistIDs, byID, byName) {
		const text = firstNonEmpty(displayText);
		const candidates = (artistIDs || []).map(id => byID[String(id)]).filter(Boolean);
		const lookup = name => {
			const key = artistKey(name);
			const direct = candidates.find(a => artistKey(firstNonEmpty(a.Artist, a.Name)) === key && validArtistURL(a));
			return direct || byName[key] || null;
		};
		// Structured links are authoritative only if they represent the visible
		// contributor names; stale composite/duplicate metadata is ignored.
		if (Array.isArray(structured) && structured.length) {
			const parts = structured.map(item => ({
				name: firstNonEmpty(item.Artist, item.name, item.Name),
				id: firstNonEmpty(item.ArtistID, item.artistId),
				url: firstNonEmpty(item.SpotifyURL, item.url)
			})).filter(x => x.name);
			const visible = artistKey(text);
			if (parts.length && artistKey(parts.map(x => x.name).join('')) === visible) {
				return parts.map(p => {
					const row = byID[p.id] || lookup(p.name);
					return {name: p.name, url: validArtistURL(row) || (/^https:\/\/open\.spotify\.com\/artist\//.test(p.url) ? p.url : null)};
				});
			}
		}
		// Longest-match segmentation: a comma inside 'Tyler, The Creator'
		// is part of the artist, while the following comma separates Kali Uchis.
		const known = Object.values(byName)
			.filter(a => validArtistURL(a))
			.map(a => firstNonEmpty(a.Artist, a.Name))
			.filter(Boolean)
			.sort((a,b) => b.length - a.length);
		const names = [];
		let remaining = text.trim();
		let safety = 0;
		while (remaining && safety++ < 40) {
			let match = null;
			for (const name of known) {
				if (normalizeText(remaining.slice(0, name.length)) !== normalizeText(name)) continue;
				const tail = remaining.slice(name.length);
				if (tail && !/^(?:\s*,\s*|\s+&\s+|\s+and\s+|\s+feat\.?\s+|\s+ft\.?\s+)/i.test(tail)) continue;
				match = {name: remaining.slice(0,name.length), tail};
				break;
			}
			if (match) {
				names.push(match.name);
				remaining = match.tail.replace(/^(?:\s*,\s*|\s+&\s+|\s+and\s+|\s+feat\.?\s+|\s+ft\.?\s+)/i, '').trim();
				continue;
			}
			const separator = remaining.match(/\s*,\s*|\s+&\s+|\s+and\s+/i);
			if (!separator) {names.push(remaining); break;}
			const part = remaining.slice(0,separator.index).trim();
			if (part) names.push(part);
			remaining = remaining.slice(separator.index + separator[0].length).trim();
		}
		return names.map(name => ({name, url: validArtistURL(lookup(name))}));
	}

	// ============================================================
	// LOAD COUNTRY
	// ============================================================

	function loadCountryData(countryCode) {

		const dataFile =
			`${platformOptions[selectedPlatform]}${countryCode}.json`;


		// --------------------------------------------------------
		// HEADER
		// --------------------------------------------------------

		const countryName =
			document.getElementById("countryName");

		if (countryName) {
			countryName.textContent =
				`${platformNameMap[selectedPlatform].toUpperCase()} ${countryCode.toUpperCase()}`;
		}


		const platformLogo =
			document.getElementById("platformLogo");

		if (platformLogo) {
			platformLogo.src =
				platformLogos[selectedPlatform];
		}


		const icon =
			document.getElementById("countryIcon");

		if (icon) {

			if (
				countryCode.toLowerCase() ===
				"global"
			) {

				icon.style.display = "none";

			} else {

				icon.src =
					`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;

				icon.style.display = "inline";
			}
		}


		console.log(
			`[SPOTIFY WEEKLY] Loading ${dataFile}`
		);


		// --------------------------------------------------------
		// LOAD JSON FILES
		// --------------------------------------------------------

		const fetches = [

			fetch(dataFile, {
				cache: "no-store"
			}).then(r => {

				if (!r.ok) {
					throw new Error(
						`Could not load ${dataFile}: HTTP ${r.status}`
					);
				}

				return r.json();
			}),


			fetch(si, {
				cache: "no-store"
			}).then(r => r.json()),


			fetch(ts, {
				cache: "no-store"
			}).then(r => r.json()),


			fetch(sp, {
				cache: "no-store"
			}).then(r => r.json()),


			fetch(
				"DATABASES/ALL_JSON/ARTIST_FEATURES.json",
				{
					cache: "no-store"
				}
			).then(r => r.json())
		];


		Promise.all(fetches)

			.then(([
				data,
				siData,
				tsData,
				spData,
				artistFeatures
			]) => {


				// =================================================
				// CREATE LOOKUP MAPS
				// =================================================

				const spMap =
					Object.create(null);

				const siMap =
					Object.create(null);

				const tsMap =
					Object.create(null);

				const artistMapByID =
					Object.create(null);

				const artistMapByName =
					Object.create(null);


				// -------------------------------------------------
				// SPOTIFY LINKS
				// -------------------------------------------------

				for (const row of spData || []) {

					const id =
						getSongID(row.SongID);

					if (!id) continue;

					spMap[id] =
						firstNonEmpty(
							row.Spotify_URL,
							row.SpotifyURL
						);
				}


				// -------------------------------------------------
				// SI
				// -------------------------------------------------

				for (const row of siData || []) {

					const id =
						getSongID(row.SongID);

					if (!id) continue;

					siMap[id] = row;
				}


				// -------------------------------------------------
				// TS
				// -------------------------------------------------

				for (const row of tsData || []) {

					const id =
						getSongID(row.SongID);

					if (!id) continue;

					tsMap[id] = row;
				}


				// -------------------------------------------------
				// ARTISTS
				// -------------------------------------------------

				for (const artist of artistFeatures || []) {
					if (!artist) continue;
					const id = firstNonEmpty(artist.ArtistID);
					if (id) artistMapByID[id] = artist;
					const name = firstNonEmpty(artist.Artist, artist.Name);
					const key = artistKey(name);
					if (key && (!artistMapByName[key] || (!validArtistURL(artistMapByName[key]) && validArtistURL(artist)))) {
						artistMapByName[key] = artist;
					}
				}
				// A verified alias; never treat unrelated lookalike names as aliases.
				if (artistMapByID["48811"]) {
					artistMapByName[artistKey("HUNTRX")] = artistMapByID["48811"];
					artistMapByName[artistKey("HUNTR/X")] = artistMapByID["48811"];
				}

				// =================================================
				// BUILD SONG LIST
				//
				// IMPORTANT:
				//
				// SP_global.json is authoritative for:
				//
				// Title
				// Artist
				// Position
				// chart statistics
				//
				// MASTER JSONs are enrichment/fallback only.
				// =================================================

				allSongs = data.map(entry => {

					const id =
						getSongID(entry.SongID);


					const siEntry =
						siMap[id] || {};


					// =============================================
					// TITLE
					//
					// 1. CHART JSON
					// 2. SI fallback
					// 3. Unknown
					// =============================================

					const finalTitle =
						firstNonEmpty(
							entry.Title,
							siEntry.Title,
							"Unknown Title"
						);


					// =============================================
					// ARTIST
					//
					// 1. CHART JSON
					// 2. SI fallback
					// 3. Unknown
					// =============================================

					const finalArtist =
						firstNonEmpty(
							entry.Artist,
							siEntry.Artist,
							"Unknown Artist"
						);


					// =============================================
					// ARTIST IDs
					//
					// ONLY FOR ENRICHMENT.
					// =============================================

					const artistIDs =
						String(
							firstNonEmpty(
								entry.ArtistID,
								siEntry.ArtistID
							)
						)

							.split(",")

							.map(x => x.trim())

							.filter(Boolean);


					// =============================================
					// ARTIST NAMES
					//
					// IMPORTANT:
					// Names come from chart JSON.
					// =============================================

					const artistLinks = resolveArtistNames(
						finalArtist,
						entry.ArtistLinks || siEntry.ArtistLinks || siEntry.ArtistNames,
						artistIDs,
						artistMapByID,
						artistMapByName
					);

					// =============================================
					// COVER
					// =============================================

					const coverCandidate =
						firstNonEmpty(
							entry.CoverImage,
							tsMap[id]?.CoverImage
						);


					const finalCover =
						coverCandidate ||
						DEFAULT_COVER;


					// =============================================
					// SPOTIFY URL
					//
					// Chart JSON first.
					// SP.json fallback.
					// =============================================

					const spotifyURL =
						firstNonEmpty(
							entry.Spotify_URL,
							entry.SpotifyURL,
							spMap[id]
						) || null;


					// =============================================
					// FINAL SONG
					// =============================================

					return {

						SongID:
							entry.SongID,

						Position:
							entry.Position,

						Title:
							finalTitle,

						Artist:
							finalArtist,

						ArtistNames:
							artistLinks,

						CoverImage:
							finalCover,

						SpotifyURL:
							spotifyURL
					};

				}).sort(
					(a, b) =>
						(Number(a.Position) || 999999) -
						(Number(b.Position) || 999999)
				);


				// =================================================
				// DEBUG
				// =================================================

				console.log(
					`[SPOTIFY WEEKLY] ${allSongs.length} songs prepared`
				);


				const patientZero =
					allSongs.find(
						s =>
							s.Title ===
							"Patient Zero"
					);


				if (patientZero) {

					console.log(
						"[DEBUG PATIENT ZERO]",
						patientZero
					);
				}


				// =================================================
				// RESET
				// =================================================

				const songList =
					document.getElementById(
						"songList"
					);


				if (songList) {
					songList.innerHTML = "";
				}


				visibleCount = 0;

				isLoading = false;


				loadMoreSongs();
			})


			.catch(err => {

				console.error(
					"[SPOTIFY WEEKLY ERROR]",
					err
				);
			});
	}


	// ============================================================
	// LOAD MORE
	// ============================================================

	async function loadMoreSongs() {

		if (isLoading) return;

		if (
			visibleCount >=
			allSongs.length
		) {
			return;
		}


		isLoading = true;


		const nextBatch =
			allSongs.slice(
				visibleCount,
				visibleCount + batchSize
			);


		if (
			nextBatch.length === 0
		) {

			isLoading = false;

			return;
		}


		for (
			const song of nextBatch
		) {

			appendSong(song);

			await delay(5);
		}


		visibleCount +=
			nextBatch.length;


		console.log(
			`[DISPLAY] ${visibleCount}/${allSongs.length}`
		);


		isLoading = false;
	}


	// ============================================================
	// APPEND SONG
	// ============================================================

	function appendSong(song) {

		const songList =
			document.getElementById(
				"songList"
			);


		if (!songList) return;


		const li =
			document.createElement("li");


		// --------------------------------------------------------
		// RANK
		// --------------------------------------------------------

		const rank =
			document.createElement("div");

		rank.className =
			"song-rank";

		rank.textContent =
			`${song.Position}.`;


		// --------------------------------------------------------
		// COVER
		// --------------------------------------------------------

		const img =
			document.createElement("img");

		img.src =
			song.CoverImage ||
			DEFAULT_COVER;

		img.alt =
			song.Title;


		img.onerror = () => {

			img.onerror = null;

			img.src =
				DEFAULT_COVER;
		};


		// --------------------------------------------------------
		// INFO
		// --------------------------------------------------------

		const info =
			document.createElement("div");

		info.className =
			"song-info-list";


		// --------------------------------------------------------
		// TITLE
		// --------------------------------------------------------

		const title =
			document.createElement("span");

		title.className =
			"song-title";

		title.textContent =
			song.Title ||
			"Unknown Title";


		// --------------------------------------------------------
		// ARTIST
		// --------------------------------------------------------

		const artistContainer =
			document.createElement("div");

		artistContainer.className =
			"song-artist";


		if (
			Array.isArray(
				song.ArtistNames
			) &&
			song.ArtistNames.length > 0
		) {

			song.ArtistNames.forEach(
				(artistObj, index) => {

					if (artistObj.url) {

						const link =
							document.createElement(
								"a"
							);


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


						link.addEventListener(
							"click",
							event => {

								event.stopPropagation();
							}
						);


						artistContainer.appendChild(
							link
						);

					} else {

						const span =
							document.createElement(
								"span"
							);

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
							document.createTextNode(
								", "
							)
						);
					}
				}
			);

		} else {

			// This should almost never happen now.
			artistContainer.textContent =
				song.Artist ||
				"Unknown Artist";
		}


		// --------------------------------------------------------
		// BUILD
		// --------------------------------------------------------

		info.appendChild(
			title
		);

		info.appendChild(
			artistContainer
		);


		li.appendChild(
			rank
		);

		li.appendChild(
			img
		);

		li.appendChild(
			info
		);


		// --------------------------------------------------------
		// SELECT
		// --------------------------------------------------------

		li.addEventListener(
			"click",
			() => {

				document
					.querySelectorAll(
						".song-list li"
					)
					.forEach(
						el =>
							el.classList.remove(
								"selected"
							)
					);


				li.classList.add(
					"selected"
				);
			}
		);


		// --------------------------------------------------------
		// OPEN SPOTIFY
		// --------------------------------------------------------

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
							.forEach(
								el =>
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
							"_blank"
						);
					}
				}
			);
		}


		songList.appendChild(
			li
		);
	}


	// ============================================================
	// SCROLL
	// ============================================================

	window.addEventListener(
		"scroll",
		() => {

			const scrollTop =
				window.scrollY;

			const windowHeight =
				window.innerHeight;

			const docHeight =
				document.documentElement
					.scrollHeight;


			if (
				scrollTop +
				windowHeight >=
				docHeight - 400
			) {

				if (
					visibleCount <
					allSongs.length
				) {

					loadMoreSongs();
				}
			}
		},
		{
			passive: true
		}
	);


	// ============================================================
	// COUNTRY SELECT
	// ============================================================

	const countrySelect =
		document.getElementById(
			"countrySelect"
		);


	if (countrySelect) {

		countrySelect.addEventListener(
			"change",
			function () {

				loadCountryData(
					this.value
				);
			}
		);
	}


	// ============================================================
	// INITIAL
	// ============================================================

	loadCountryData(
		"global"
	);
});