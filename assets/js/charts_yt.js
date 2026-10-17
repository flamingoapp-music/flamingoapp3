document.addEventListener('DOMContentLoaded', () => {
  const BASE = 'DATABASES/ALL_JSON/';
  const DEFAULT_COVER = 'images/backgroundlogo.png';
  const cfg = {
    si: ['YOUTUBE_SI.json', 'SI.json'],
    ts: ['YOUTUBE_TS.json', 'TS.json'],
    sp: ['YOUTUBE_SP.json', 'SP.json'],
    artist: ['YOUTUBE_ARTIST_FEATURES.json', 'ARTIST_FEATURES.json']
  };
  let songs = [], visible = 0, loading = false, version = 0;
  const batchSize = 25;
  const first = (...v) => v.find(x => x !== null && x !== undefined && String(x).trim() !== '')?.toString().trim() || '';
  const norm = x => first(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const key = x => norm(x).replace(/[^\p{L}\p{N}]/gu, '');
  const idOf = x => first(x);
  const urlOf = a => first(a?.SpotifyURL, a?.Spotify_URL);
  const validUrl = u => /^https:\/\/open\.spotify\.com\/artist\/[a-zA-Z0-9]+(?:\?.*)?$/.test(u || '');
  async function fetchJson(path) {
    const r = await fetch(BASE + path, { cache: 'no-store' });
    if (!r.ok) throw Error(`${path}: HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data)) throw Error(`${path}: expected array`);
    return data;
  }
  async function optional(paths) {
    for (const path of paths) {
      try { return await fetchJson(path); }
      catch (e) { console.warn('[YouTube fallback]', e.message); }
    }
    return [];
  }
  async function loadAllArtistCatalogs(paths) {
    const results = await Promise.all(paths.map(async path => {
      try { return await fetchJson(path); }
      catch (e) { console.warn('[YouTube artist catalog]', e.message); return []; }
    }));
    return results.flat();
  }
  const mapBy = (rows, field) => new Map(rows.filter(r => r && idOf(r[field])).map(r => [idOf(r[field]), r]));

  function buildArtistMaps(rows) {
    const byID = new Map(), byName = new Map();
    const better = (a, b) => validUrl(urlOf(a)) && !validUrl(urlOf(b));
    for (const a of rows) {
      if (!a) continue;
      const id = idOf(a.ArtistID), name = first(a.Artist, a.Name);
      if (id && (!byID.has(id) || better(a, byID.get(id)))) byID.set(id, a);
      if (name) {
        const k = key(name);
        if (k && (!byName.has(k) || better(a, byName.get(k)))) byName.set(k, a);
      }
    }
    // Alias explícitos verificados; no sustituir un registro que ya tenga URL válida.
    const aliases = [['HUNTRX', 'HUNTR/X']];
    for (const [alias, canonical] of aliases) {
      const row = byName.get(key(canonical));
      if (row && validUrl(urlOf(row)) && !validUrl(urlOf(byName.get(key(alias))))) byName.set(key(alias), row);
    }
    return { byID, byName };
  }

  function splitArtists(text, byName) {
    const source = first(text);
    if (!source) return [];
    // Dynamic programming: prefer a verified full artist name over splitting its comma or ampersand.
    // A compound catalog entry with no URL is not treated as a protected solo artist.
    const memo = new Map();
    function solve(rest) {
      rest = rest.trim().replace(/^[,&]\s*/, '');
      if (!rest) return { score: 0, parts: [] };
      if (memo.has(rest)) return memo.get(rest);
      const options = [];
      const exact = byName.get(key(rest));
      if (exact && validUrl(urlOf(exact))) options.push({ score: 1000 + rest.length, parts: [rest] });
      const sep = /\s*,\s*|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+/gi;
      let match;
      while ((match = sep.exec(rest)) !== null) {
        const left = rest.slice(0, match.index).trim();
        const right = rest.slice(match.index + match[0].length).trim();
        if (!left || !right) continue;
        const resolved = byName.get(key(left));
        const tail = solve(right);
        const known = resolved && validUrl(urlOf(resolved));
        options.push({ score: (known ? 1000 + left.length : -100) + tail.score, parts: [left, ...tail.parts] });
      }
      if (!options.length) options.push({ score: -100, parts: [rest] });
      options.sort((a, b) => b.score - a.score || a.parts.length - b.parts.length);
      const result = options[0];
      memo.set(rest, result);
      return result;
    }
    return solve(source).parts;
  }

  function resolveLinks(entry, siRow, afMaps) {
    const artist = first(entry.Artist, siRow.Artist, 'Unknown Artist');
    const ids = first(entry.ArtistID, siRow.ArtistID).split(',').map(s => s.trim()).filter(Boolean);
    const structured = Array.isArray(entry.ArtistLinks) ? entry.ArtistLinks :
      Array.isArray(siRow.ArtistLinks) ? siRow.ArtistLinks : [];
    const names = splitArtists(artist, afMaps.byName);
    const used = new Set();
    return names.map(name => {
      const k = key(name);
      const possible = [];
      for (const item of structured) {
        if (key(first(item.Artist, item.Name, item.name)) === k) {
          const a = afMaps.byID.get(idOf(item.ArtistID)) || item;
          possible.push(a);
        }
      }
      for (const id of ids) {
        const a = afMaps.byID.get(id);
        if (a && key(first(a.Artist, a.Name)) === k) possible.push(a);
      }
      const byName = afMaps.byName.get(k);
      if (byName) possible.push(byName);
      const chosen = possible.find(a => validUrl(urlOf(a)) && !used.has(idOf(a.ArtistID))) || null;
      if (chosen) used.add(idOf(chosen.ArtistID));
      return { name, url: chosen ? urlOf(chosen) : null };
    });
  }

  function render(song) {
    const list = document.getElementById('songList'); if (!list) return;
    const li = document.createElement('li');
    const rank = document.createElement('div'); rank.className = 'song-rank'; rank.textContent = `${song.Position}.`;
    const img = document.createElement('img'); img.src = song.CoverImage; img.alt = `${song.Title} Cover`;
    img.onerror = () => { img.onerror = null; img.src = DEFAULT_COVER; };
    const info = document.createElement('div'); info.className = 'song-info-list';
    const title = document.createElement('span'); title.className = 'song-title'; title.textContent = song.Title;
    const artist = document.createElement('div'); artist.className = 'song-artist';
    song.ArtistNames.forEach((a, i) => {
      if (i) artist.appendChild(document.createTextNode(', '));
      const node = document.createElement(a.url ? 'a' : 'span'); node.textContent = a.name;
      if (a.url) { node.href = a.url; node.target = '_blank'; node.rel = 'noopener noreferrer'; node.style.color = '#3498db'; node.style.textDecoration = 'underline'; node.addEventListener('click', e => e.stopPropagation()); }
      artist.appendChild(node);
    });
    info.append(title, artist); li.append(rank, img, info);
    li.addEventListener('click', () => { document.querySelectorAll('.song-list li').forEach(x => x.classList.remove('selected')); li.classList.add('selected'); });
    if (song.SpotifyURL) { img.style.cursor = 'pointer'; img.addEventListener('click', e => { e.stopPropagation(); if (li.classList.contains('selected')) window.open(song.SpotifyURL, '_blank', 'noopener,noreferrer'); else li.click(); }); }
    list.appendChild(li);
  }
  async function more() {
    if (loading || visible >= songs.length) return;
    loading = true; const v = version; const batch = songs.slice(visible, visible + batchSize);
    for (const song of batch) { if (v !== version) { loading = false; return; } render(song); await new Promise(r => setTimeout(r, 5)); }
    if (v !== version) { loading = false; return; }
    visible += batch.length; loading = false;
    if (visible < songs.length && document.documentElement.scrollHeight <= innerHeight + 400) more();
  }
  async function loadCountry(code) {
    const v = ++version; songs = []; visible = 0; loading = false;
    const list = document.getElementById('songList'); if (list) list.textContent = 'Loading YouTube Insights...';
    const name = document.getElementById('countryName'); if (name) name.textContent = `YOUTUBE INSIGHTS ${code.toUpperCase()}`;
    const logo = document.getElementById('platformLogo'); if (logo) { logo.src = 'https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg'; logo.alt = 'YouTube Insights'; }
    const icon = document.getElementById('countryIcon'); if (icon) { if (['global', 'us'].includes(code.toLowerCase())) icon.style.display = 'none'; else { icon.src = `https://flagcdn.com/w40/${code.toLowerCase()}.png`; icon.style.display = 'inline'; } }
    try {
      const [data, si, ts, sp, af] = await Promise.all([
        fetchJson(`yt_${code}.json`), optional(cfg.si), optional(cfg.ts), optional(cfg.sp), loadAllArtistCatalogs(cfg.artist)
      ]);
      if (v !== version) return;
      const siMap = mapBy(si, 'SongID'), tsMap = mapBy(ts, 'SongID'), spMap = mapBy(sp, 'SongID');
      const maps = buildArtistMaps(af);
      songs = data.map((entry, i) => {
        const id = idOf(entry.SongID), siRow = siMap.get(id) || {}, tsRow = tsMap.get(id) || {}, spRow = spMap.get(id) || {};
        const title = first(entry.Title, siRow.Title, 'Unknown Title');
        const artist = first(entry.Artist, siRow.Artist, 'Unknown Artist');
        const links = resolveLinks(entry, siRow, maps);
        return { SongID: id, Position: Number(entry.Position) || i + 1, Title: title, Artist: artist,
          ArtistNames: links.length ? links : [{ name: artist, url: null }],
          CoverImage: first(entry.CoverImage, tsRow.CoverImage, DEFAULT_COVER),
          SpotifyURL: first(entry.Spotify_URL, entry.SpotifyURL, spRow.Spotify_URL, spRow.SpotifyURL) || null };
      }).sort((a, b) => a.Position - b.Position);
      if (list) list.innerHTML = '';
      more();
      console.log('[YouTube] Loaded', songs.length, 'songs; artist records', af.length);
      console.table(songs.filter(s => s.ArtistNames.some(a => !a.url)).slice(0, 25).map(s => ({ Title: s.Title, Artist: s.Artist, Missing: s.ArtistNames.filter(a => !a.url).map(a => a.name).join(', ') })));
    } catch (e) { if (v !== version) return; console.error('[YouTube]', e); if (list) list.textContent = `Error loading ${code.toUpperCase()} data.`; }
  }
  window.addEventListener('scroll', () => { if (scrollY + innerHeight >= document.documentElement.scrollHeight - 400) more(); }, { passive: true });
  const select = document.getElementById('countrySelect'); if (select) select.addEventListener('change', () => loadCountry(select.value));
  loadCountry(select?.value || 'us');
});
