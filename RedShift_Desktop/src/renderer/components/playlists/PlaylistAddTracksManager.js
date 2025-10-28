/**
 * PlaylistAddTracksManager
 * Data processing for Add Tracks modal
 */

function populateAddBrowser(musicLibrary) {
  const all = musicLibrary || [];
  const genres = new Set();
  const artists = new Set();
  const albums = new Set();
  all.forEach(track => {
    genres.add(track.metadata?.common?.genre || 'Unknown Genre');
    artists.add(track.metadata?.common?.artist || 'Unknown Artist');
    albums.add(track.metadata?.common?.album || 'Unknown Album');
  });
  populateAddColumn('addGenresList', genres, 'All Genres');
  populateAddColumn('addArtistsList', artists, 'All Artists');
  populateAddColumn('addAlbumsList', albums, 'All Albums');
}

function populateAddColumn(id, items, allLabel) {
  const el = document.getElementById(id);
  el.innerHTML = `<div class="list-item selected" data-value="">${allLabel}</div>`;
  [...items].sort().forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.dataset.value = item;
    div.textContent = item;
    el.appendChild(div);
  });
}

function updateAddColumnSelection(id, value) {
  const el = document.getElementById(id);
  el.querySelectorAll('.list-item').forEach(n => n.classList.toggle('selected', n.dataset.value === value));
}

function populateAddArtists(musicLibrary, genreFilter) {
  const all = musicLibrary || [];
  const set = new Set();
  all.forEach(t => {
    const genre = t.metadata?.common?.genre || 'Unknown Genre';
    const artist = t.metadata?.common?.artist || 'Unknown Artist';
    if (!genreFilter || genre === genreFilter) set.add(artist);
  });
  populateAddColumn('addArtistsList', set, 'All Artists');
}

function populateAddAlbums(musicLibrary, genreFilter, artistFilter) {
  const all = musicLibrary || [];
  const set = new Set();
  all.forEach(t => {
    const genre = t.metadata?.common?.genre || 'Unknown Genre';
    const artist = t.metadata?.common?.artist || 'Unknown Artist';
    const album = t.metadata?.common?.album || 'Unknown Album';
    const gm = !genreFilter || genre === genreFilter;
    const am = !artistFilter || artist === artistFilter;
    if (gm && am) set.add(album);
  });
  populateAddColumn('addAlbumsList', set, 'All Albums');
}

function applyAddFilters(musicLibrary, filters) {
  const all = musicLibrary || [];
  const global = filters.global;
  const filteredTracks = all.filter(track => {
    let name = track.metadata?.common?.title || track.name || '';
    name = name.replace(/\.[^/.]+$/, '');
    name = name.replace(/^(\d{1,3}\.?\s*[-–—]?\s*)/, '');
    const genre = track.metadata?.common?.genre || 'Unknown Genre';
    const artist = track.metadata?.common?.artist || 'Unknown Artist';
    const album = track.metadata?.common?.album || 'Unknown Album';
    const gm = !filters.genre || genre === filters.genre;
    const am = !filters.artist || artist === filters.artist;
    const albm = !filters.album || album === filters.album;
    const glob = !global || name.toLowerCase().includes(global) || artist.toLowerCase().includes(global) || album.toLowerCase().includes(global) || genre.toLowerCase().includes(global);
    return gm && am && albm && glob;
  });
  return filteredTracks;
}

function updateAddSelectAllCheckbox(filteredTracks, selectedPaths) {
  const selectAll = document.getElementById('addSelectAll');
  if (selectAll) {
    const allSelected = filteredTracks.length > 0 && filteredTracks.every(t => selectedPaths.has(t.path));
    selectAll.checked = allSelected;
  }
}

