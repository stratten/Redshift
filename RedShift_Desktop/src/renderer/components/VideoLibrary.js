// src/renderer/components/VideoLibrary.js - Local desktop video library grid and import flow.

class VideoLibrary {
  constructor(uiManager) {
    this.ui = uiManager;
    this.videos = [];
    this.hasLoadedOnce = false;
    this.activeCategory = 'all';
    this.selectedSeriesKey = null;
    this.query = '';
    this.isLoading = false;
    this.searchDebounceTimer = null;
    this.searchDebounceMs = 300;
    this.viewMode = this.loadViewPreference();
    this.tvMazeRefreshTimer = null;
    this.thumbnailRefreshTimer = null;
    this.tvMazeArtworkRequested = new Set();
    this.tvMazePresentation = new TvMazeVideoPresentation(this.ui);
    this.setupEventListeners();
    this.setupIpcListeners();
  }

  setupEventListeners() {
    const rescanBtn = document.getElementById('rescanVideosBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        if (!this.isLoading) this.loadVideos();
      });
    }

    const grid = document.getElementById('videosGrid');
    if (grid) {
      this.createToolbar(grid);
      grid.addEventListener('click', (event) => this.handleGridInteraction(event));
      grid.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        if (!event.target.closest('.video-card, .video-series-card, .video-list-row, .video-series-row, [data-video-action]')) return;
        event.preventDefault();
        this.handleGridInteraction(event);
      });
    }

    this.setupDragAndDrop();
  }

  createToolbar(grid) {
    const library = grid.closest('.videos-library');
    if (!library || document.getElementById('videoLibraryToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'videoLibraryToolbar';
    toolbar.className = 'video-library-toolbar';
    library.insertBefore(toolbar, grid);
    toolbar.addEventListener('click', (event) => {
      const categoryButton = event.target.closest('[data-video-category]');
      if (!categoryButton) return;
      this.activeCategory = categoryButton.dataset.videoCategory;
      this.selectedSeriesKey = null;
      this.render();
    });
    toolbar.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-video-view]');
      if (!viewButton) return;
      this.viewMode = viewButton.dataset.videoView;
      this.saveViewPreference();
      this.render();
    });
    toolbar.addEventListener('input', (event) => {
      if (event.target.id !== 'videoLibrarySearch') return;
      this.query = event.target.value;
      this.scheduleSearchRefresh();
    });
  }

  scheduleSearchRefresh() {
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.render();
    }, this.searchDebounceMs);
  }

  handleGridInteraction(event) {
    const action = event.target.closest('[data-video-action]');
    if (action?.dataset.videoAction === 'back-to-library') {
      this.selectedSeriesKey = null;
      this.render();
      return;
    }
    if (action?.dataset.videoAction === 'open-tvmaze-source') {
      window.electronAPI.openExternal(action.dataset.url);
      return;
    }
    if (action?.dataset.videoAction === 'choose-tvmaze-match') {
      this.openTvMazeMatch(action.dataset.seriesKey);
      return;
    }
    if (action?.dataset.videoAction === 'change-tvmaze-match') {
      this.changeTvMazeMatch(action.dataset.seriesKey);
      return;
    }
    if (action?.dataset.videoAction === 'refresh-tvmaze-series') {
      this.refreshTvMazeSeries(action.dataset.seriesKey);
      return;
    }

    const seriesCard = event.target.closest('.video-series-card-open, .video-series-row-open');
    if (seriesCard) {
      this.selectedSeriesKey = seriesCard.dataset.seriesKey;
      this.render();
      return;
    }

    const videoItem = event.target.closest('.video-card, .video-list-row');
    if (!videoItem) return;
    const video = this.videos.find((item) => item.path === videoItem.dataset.path);
    if (video) this.openPlayer(video);
  }

  setupDragAndDrop() {
    const dropZone = document.getElementById('videosTab');
    if (!dropZone) return;

    const isVideosTabActive = () => dropZone.style.display !== 'none';
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    dropZone.addEventListener('dragenter', () => {
      if (isVideosTabActive()) dropZone.classList.add('videos-drop-active');
    });

    dropZone.addEventListener('dragleave', (event) => {
      if (event.target === dropZone) dropZone.classList.remove('videos-drop-active');
    });

    dropZone.addEventListener('drop', async (event) => {
      dropZone.classList.remove('videos-drop-active');
      if (!isVideosTabActive()) return;

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      this.ui.logBoth('info', `Dropped ${files.length} item(s) into video library`, '🎬');
      try {
        const paths = files.map((file) => file.path);
        const result = await window.electronAPI.invoke('add-videos-to-library', { paths });
        if (!result.success) {
          this.ui.logBoth('error', `Failed to add videos: ${result.error}`, '🎬');
          return;
        }

        this.ui.logBoth('success', `Added ${result.filesAdded} video file(s)`, '🎬');
        await this.loadVideos();
      } catch (error) {
        this.ui.logBoth('error', `Error adding videos: ${error.message}`, '🎬');
      }
    });
  }

  setupIpcListeners() {
    window.electronAPI.on('video-scan-progress', (progress) => {
      this.updateScanProgress(progress);
      if (progress.phase === 'metadata' && progress.filePath && Number.isFinite(progress.duration)) {
        this.applyDurationUpdate(progress.filePath, progress.duration);
      }
    });
    window.electronAPI.on('tvmaze-metadata-updated', () => this.scheduleTvMazeRefresh());
    window.electronAPI.on('video-thumbnail-ready', ({ filePath, thumbnailPath }) => {
      this.applyThumbnailUpdate(filePath, thumbnailPath);
    });
  }

  onTabActivated() {
    if (this.isLoading) return;
    if (!this.hasLoadedOnce) {
      this.loadVideos();
    } else {
      this.render();
    }
  }

  async loadVideos() {
    if (this.isLoading) return;

    this.isLoading = true;
    const progressBar = document.getElementById('videoScanProgressBar');
    if (progressBar) progressBar.style.display = 'flex';
    this.setRescanEnabled(false);
    this.updateScanProgress({ message: 'Discovering video files...' });

    try {
      this.videos = await window.electronAPI.invoke('scan-video-library');
      this.hasLoadedOnce = true;
      this.render();
    } catch (error) {
      this.ui.logBoth('error', `Failed to scan video library: ${error.message}`, '🎬');
      this.renderError(error.message);
    } finally {
      if (progressBar) progressBar.style.display = 'none';
      this.setRescanEnabled(true);
      this.isLoading = false;
    }
  }

  updateScanProgress(progress = {}) {
    const message = progress.message || (progress.phase === 'complete' ? 'Video library scan complete' : 'Scanning video library...');
    const messageEl = document.querySelector('#videoScanProgressBar .scan-progress-text span');
    if (messageEl) messageEl.textContent = message;
  }

  setRescanEnabled(enabled) {
    const rescanBtn = document.getElementById('rescanVideosBtn');
    if (!rescanBtn) return;
    rescanBtn.disabled = !enabled;
    rescanBtn.setAttribute('aria-busy', String(!enabled));
  }

  scheduleTvMazeRefresh() {
    clearTimeout(this.tvMazeRefreshTimer);
    this.tvMazeRefreshTimer = setTimeout(() => {
      this.refreshTvMazeMetadata();
    }, 100);
  }

  scheduleThumbnailRefresh() {
    clearTimeout(this.thumbnailRefreshTimer);
    this.thumbnailRefreshTimer = setTimeout(() => {
      if (document.getElementById('videosGrid')) this.render();
    }, 200);
  }

  async refreshTvMazeMetadata() {
    try {
      this.videos = await window.electronAPI.invoke('get-all-videos');
      if (document.getElementById('videosGrid')) this.render();
    } catch (error) {
      this.ui.logBoth('warning', `Couldn't refresh TV metadata: ${error.message}`, '🎬');
    }
  }

  async openTvMazeMatch(seriesKey) {
    try {
      const match = await window.electronAPI.invoke('get-tvmaze-match-candidates', { seriesKey });
      if (match.candidates.length === 0) {
        this.ui.logBoth('warning', 'No TVMaze match candidates are available for this series.', '🎬');
        return;
      }
      this.ui.tvMazeMatchModal?.open({ seriesKey, localTitle: match.localTitle, candidates: match.candidates });
    } catch (error) {
      this.ui.logBoth('error', `Couldn't load TVMaze matches: ${error.message}`, '🎬');
    }
  }

  async selectTvMazeMatch(seriesKey, showId) {
    await window.electronAPI.invoke('select-tvmaze-match', { seriesKey, showId });
    await this.refreshTvMazeMetadata();
  }

  async changeTvMazeMatch(seriesKey) {
    try {
      await window.electronAPI.invoke('refresh-tvmaze-series', { seriesKey, forcePicker: true });
      await this.refreshTvMazeMetadata();
      await this.openTvMazeMatch(seriesKey);
    } catch (error) {
      this.ui.logBoth('error', `Couldn't change TVMaze match: ${error.message}`, '🎬');
    }
  }

  async refreshTvMazeSeries(seriesKey) {
    try {
      await window.electronAPI.invoke('refresh-tvmaze-series', { seriesKey });
      await this.refreshTvMazeMetadata();
    } catch (error) {
      this.ui.logBoth('error', `Couldn't refresh TVMaze metadata: ${error.message}`, '🎬');
    }
  }

  ensureTvMazeArtwork(seriesKey) {
    if (this.tvMazeArtworkRequested.has(seriesKey)) return;
    this.tvMazeArtworkRequested.add(seriesKey);
    window.electronAPI.invoke('cache-tvmaze-series-artwork', { seriesKey }).catch((error) => {
      this.tvMazeArtworkRequested.delete(seriesKey);
      this.ui.logBoth('warning', `Couldn't cache TVMaze artwork: ${error.message}`, '🎬');
    });
  }

  applyProgressUpdate(filePath, updates) {
    const video = this.videos.find((item) => item.path === filePath);
    if (!video) return;

    if (updates.durationSeconds !== undefined && updates.durationSeconds !== null) {
      video.duration = Math.floor(updates.durationSeconds);
    }
    if (updates.playbackSupported !== undefined && updates.playbackSupported !== null) {
      video.playbackSupported = !!updates.playbackSupported;
    }
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      video.lastPositionSeconds = Math.floor(updates.positionSeconds);
      video.lastViewedAt = Math.floor(Date.now() / 1000);
    }
    this.render();
  }

  applyDurationUpdate(filePath, duration) {
    const video = this.videos.find((item) => item.path === filePath);
    if (!video) return;

    video.duration = duration;
    document.querySelectorAll('[data-video-duration]').forEach((durationEl) => {
      const videoItem = durationEl.closest('.video-card, .video-list-row');
      if (videoItem?.dataset.path === filePath) {
        durationEl.textContent = this.formatDuration(duration);
      }
    });
  }

  applyThumbnailUpdate(filePath, thumbnailPath) {
    const video = this.videos.find((item) => item.path === filePath);
    if (!video || !thumbnailPath) return;
    video.thumbnailPath = thumbnailPath;
    this.scheduleThumbnailRefresh();
  }

  openPlayer(video) {
    this.ui.videoPlayerModal?.open(video);
  }

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  render() {
    const grid = document.getElementById('videosGrid');
    const countEl = document.getElementById('videoCount');
    if (!grid) return;

    if (countEl) {
      countEl.textContent = `${this.videos.length} video${this.videos.length !== 1 ? 's' : ''}`;
    }
    this.renderToolbar();

    if (this.videos.length === 0) {
      grid.innerHTML = `
        <div class="empty-state videos-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="4" width="15" height="16" rx="2"></rect>
            <path d="M17 8l5-3v14l-5-3"></path>
          </svg>
          <h3>No videos yet</h3>
          <p>Drag video files here, or set a Video Library Path in Settings</p>
        </div>
      `;
      return;
    }

    const filteredVideos = this.getFilteredVideos();
    if (this.selectedSeriesKey) {
      this.renderSeries(grid, filteredVideos);
      return;
    }

    if (filteredVideos.length === 0) {
      grid.innerHTML = `
        <div class="empty-state videos-empty-state">
          <h3>No matching videos</h3>
          <p>Try another title, show, season, filename, or folder name.</p>
        </div>
      `;
      return;
    }

    try {
      grid.innerHTML = this.renderLibrarySections(filteredVideos);
    } catch (error) {
      this.ui.logBoth('error', `Failed to render video library: ${error.message}`, '🎬');
      console.error('Video library render failed:', error);
    }
  }

  renderToolbar() {
    const toolbar = document.getElementById('videoLibraryToolbar');
    if (!toolbar) return;
    const currentSearch = document.getElementById('videoLibrarySearch');
    const shouldRestoreSearchFocus = document.activeElement === currentSearch;
    const searchSelectionStart = currentSearch?.selectionStart;
    const searchSelectionEnd = currentSearch?.selectionEnd;

    const categories = [
      ['all', 'All'],
      ['tv', 'TV Shows'],
      ['movie', 'Movies'],
      ['other', 'Other Files']
    ];
    toolbar.innerHTML = `
      <input id="videoLibrarySearch" class="search-input video-library-search" type="search" value="${this.ui.escapeHtml(this.query)}" placeholder="Search shows, seasons, episodes, titles, or folders" aria-label="Search videos">
      <div class="video-library-filters" role="group" aria-label="Video library category">
        ${categories.map(([value, label]) => `<button type="button" class="${this.activeCategory === value ? 'is-active' : ''}" data-video-category="${value}">${label}</button>`).join('')}
      </div>
      <div class="video-view-toggle" role="group" aria-label="Video display">
        <button type="button" class="${this.viewMode === 'cards' ? 'is-active' : ''}" data-video-view="cards">Cards</button>
        <button type="button" class="${this.viewMode === 'list' ? 'is-active' : ''}" data-video-view="list">List</button>
      </div>
    `;
    if (shouldRestoreSearchFocus) {
      const nextSearch = document.getElementById('videoLibrarySearch');
      nextSearch?.focus({ preventScroll: true });
      if (Number.isInteger(searchSelectionStart) && Number.isInteger(searchSelectionEnd)) {
        nextSearch?.setSelectionRange(searchSelectionStart, searchSelectionEnd);
      }
    }
  }

  getFilteredVideos() {
    const normalizedQuery = this.query.trim().toLocaleLowerCase();
    return this.videos.filter((video) => {
      if (this.activeCategory !== 'all' && video.contentKind !== this.activeCategory) return false;
      if (!normalizedQuery) return true;
      return [
        video.title,
        video.seriesTitle,
        video.name,
        video.relativePath,
        video.seasonNumber ? `season ${video.seasonNumber}` : '',
        video.episodeStart ? `episode ${video.episodeStart}` : ''
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
    });
  }

  renderLibrarySections(videos) {
    const sections = [];
    if (this.activeCategory === 'all' && !this.query.trim()) {
      const continueWatching = this.continueWatchingVideos(videos);
      const recentlyAdded = this.recentlyAddedVideos(videos);
      if (continueWatching.length > 0 || recentlyAdded.length > 0) {
        sections.push(this.renderHomeRailsRow(continueWatching, recentlyAdded));
      }
    }
    const series = this.groupSeries(videos);
    const movies = this.sortVideos(videos.filter((video) => video.contentKind === 'movie'));
    const otherVideos = this.sortVideos(videos.filter((video) => video.contentKind === 'other' || (video.contentKind === 'tv' && !video.seriesKey)));

    if (series.length > 0) {
      const seriesClass = this.viewMode === 'list' ? 'video-series-list' : 'video-series-grid';
      const seriesContent = this.viewMode === 'list'
        ? series.map((seriesItem) => this.renderSeriesRow(seriesItem)).join('')
        : series.map((seriesItem) => this.renderSeriesCard(seriesItem)).join('');
      sections.push(this.renderSection('TV Shows', `<div class="${seriesClass}">${seriesContent}</div>`));
    }
    if (movies.length > 0) {
      sections.push(this.renderSection('Movies', this.renderVideos(movies)));
    }
    if (otherVideos.length > 0) {
      sections.push(this.renderSection('Other Files', this.renderVideos(otherVideos)));
    }

    return sections.join('');
  }

  continueWatchingVideos(videos) {
    return videos
      .filter((video) => !video.watched && video.lastPositionSeconds > 0 && Number.isFinite(video.lastViewedAt))
      .sort((left, right) => right.lastViewedAt - left.lastViewedAt)
      .slice(0, 12);
  }

  recentlyAddedVideos(videos) {
    return videos
      .filter((video) => Number.isFinite(video.addedAt))
      .sort((left, right) => right.addedAt - left.addedAt)
      .slice(0, 12);
  }

  renderHomeRailsRow(continueWatching, recentlyAdded) {
    const rails = [];
    if (continueWatching.length > 0) {
      rails.push(this.renderHomeRail('Continue Watching', continueWatching));
    }
    if (recentlyAdded.length > 0) {
      rails.push(this.renderHomeRail('Recently Added', recentlyAdded));
    }
    return `<div class="video-home-rails-row">${rails.join('')}</div>`;
  }

  renderHomeRail(title, videos) {
    const cards = videos.map((video) => this.renderCard(video)).join('');
    return `
      <section class="video-library-section video-home-rail">
        <h3>${title}</h3>
        <div class="video-home-rail-track">${cards}</div>
      </section>
    `;
  }

  renderSection(title, content) {
    return `<section class="video-library-section"><h3>${title}</h3>${content}</section>`;
  }

  groupSeries(videos) {
    const seriesByKey = new Map();
    for (const video of videos) {
      if (video.contentKind !== 'tv' || !video.seriesKey) continue;
      const existing = seriesByKey.get(video.seriesKey) || { key: video.seriesKey, title: video.seriesTitle, videos: [] };
      existing.videos.push(video);
      seriesByKey.set(video.seriesKey, existing);
    }

    return [...seriesByKey.values()]
      .map((series) => {
        const videosForSeries = this.sortVideos(series.videos);
        return { ...series, videos: videosForSeries, metadata: this.tvMazePresentation.getSeriesMetadata(videosForSeries) };
      })
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  }

  renderSeriesCard(series) {
    const seasonCount = new Set(series.videos.map((video) => video.seasonNumber).filter(Number.isInteger)).size;
    const seasonLabel = seasonCount === 1 ? '1 season' : `${seasonCount} seasons`;
    const officialTitle = series.metadata?.tvMazeShowName || series.title;
    const poster = this.tvMazePresentation.seriesPoster(series.metadata, series.videos);
    const source = this.renderTvMazeCardAttribution(series.metadata);
    return `
      <div class="video-series-card">
        <button type="button" class="video-series-card-open" data-series-key="${this.ui.escapeHtml(series.key)}">
          ${poster}
          <span class="video-series-card-info">
            <span class="video-series-card-title">${this.ui.escapeHtml(officialTitle)}</span>
            <span class="video-series-card-meta">${seasonLabel} · ${series.videos.length} episode${series.videos.length !== 1 ? 's' : ''}</span>
          </span>
        </button>
        ${source}
      </div>
    `;
  }

  renderSeriesRow(series) {
    const seasonCount = new Set(series.videos.map((video) => video.seasonNumber).filter(Number.isInteger)).size;
    const seasonLabel = seasonCount === 1 ? '1 season' : `${seasonCount} seasons`;
    const officialTitle = series.metadata?.tvMazeShowName || series.title;
    const source = this.renderTvMazeCardAttribution(series.metadata);
    return `
      <div class="video-series-row">
        <button type="button" class="video-series-row-open" data-series-key="${this.ui.escapeHtml(series.key)}">
          <span class="video-series-row-title">${this.ui.escapeHtml(officialTitle)}</span>
          <span class="video-series-row-meta">${seasonLabel} · ${series.videos.length} episode${series.videos.length !== 1 ? 's' : ''}</span>
        </button>
        ${source}
      </div>
    `;
  }

  renderTvMazeCardAttribution(metadata) {
    if (metadata?.tvMazeMatchStatus !== 'matched') return '';
    const sourceUrl = metadata.tvMazeShowUrl || 'https://www.tvmaze.com';
    return `<button type="button" class="tvmaze-card-attribution" data-video-action="open-tvmaze-source" data-url="${this.ui.escapeHtml(sourceUrl)}">TVMaze</button>`;
  }

  renderSeries(grid, filteredVideos) {
    const series = this.groupSeries(filteredVideos).find((item) => item.key === this.selectedSeriesKey);
    if (!series) {
      this.selectedSeriesKey = null;
      this.render();
      return;
    }
    if (series.metadata?.tvMazeMatchStatus === 'matched') {
      this.ensureTvMazeArtwork(series.key);
    }

    const seasons = new Map();
    for (const video of series.videos) {
      const key = Number.isInteger(video.seasonNumber) ? video.seasonNumber : null;
      const seasonVideos = seasons.get(key) || [];
      seasonVideos.push(video);
      seasons.set(key, seasonVideos);
    }

    const seasonSections = [...seasons.entries()]
      .sort(([left], [right]) => (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER))
      .map(([seasonNumber, seasonVideos]) => {
        const label = seasonNumber === null ? 'Episodes' : `Season ${seasonNumber}`;
        return this.renderSection(label, this.renderVideos(this.sortVideos(seasonVideos), { showEpisode: true }));
      })
      .join('');

    grid.innerHTML = `
      <div class="video-series-detail-header">
        <button type="button" class="btn btn-secondary btn-sm" data-video-action="back-to-library">All Videos</button>
        <div>
          <h3>${this.ui.escapeHtml(series.metadata?.tvMazeShowName || series.title)}</h3>
          <p>${series.videos.length} episode${series.videos.length !== 1 ? 's' : ''}</p>
          ${this.tvMazePresentation.seriesDetails(series)}
        </div>
      </div>
      ${seasonSections}
    `;
  }

  sortVideos(videos) {
    return [...videos].sort((left, right) => {
      const seasonDifference = (left.seasonNumber ?? Number.MAX_SAFE_INTEGER) - (right.seasonNumber ?? Number.MAX_SAFE_INTEGER);
      if (seasonDifference !== 0) return seasonDifference;
      const episodeDifference = (left.episodeStart ?? Number.MAX_SAFE_INTEGER) - (right.episodeStart ?? Number.MAX_SAFE_INTEGER);
      if (episodeDifference !== 0) return episodeDifference;
      return (left.title || left.name).localeCompare(right.title || right.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  episodeContextLabel(video) {
    if (video.contentKind !== 'tv' || !video.seriesTitle) return '';
    const episodeTag = Number.isInteger(video.episodeStart)
      ? ` · S${String(video.seasonNumber || 0).padStart(2, '0')}E${String(video.episodeStart).padStart(2, '0')}`
      : '';
    return `${video.seriesTitle}${episodeTag}`;
  }

  renderVideos(videos, options = {}) {
    if (this.viewMode === 'list') {
      return `<div class="videos-list">${videos.map((video) => this.renderVideoRow(video, options)).join('')}</div>`;
    }
    return `<div class="videos-grid-section">${videos.map((video) => this.renderCard(video, options)).join('')}</div>`;
  }

  renderCard(video, options = {}) {
    const title = this.ui.escapeHtml(video.tvMazeEpisodeTitle || video.title || video.name);
    const episodeLabel = options.showEpisode && Number.isInteger(video.episodeStart)
      ? `<span>S${String(video.seasonNumber || 0).padStart(2, '0')} · E${String(video.episodeStart).padStart(2, '0')}</span>`
      : '';
    const seriesLabel = !options.showEpisode && video.contentKind === 'tv' && video.seriesTitle
      ? `<span class="video-card-series">${this.ui.escapeHtml(this.episodeContextLabel(video))}</span>`
      : '';
    const airdate = video.tvMazeEpisodeAirdate ? `<span>${this.ui.escapeHtml(video.tvMazeEpisodeAirdate)}</span>` : '';
    const summary = this.tvMazePresentation.episodeSummary(video);
    const unsupportedBadge = video.playbackSupported === false
      ? '<span class="video-card-badge video-card-badge-unsupported">Format not supported for local playback yet</span>'
      : '';
    const progressPercent = video.duration && video.lastPositionSeconds
      ? Math.min(100, Math.round((video.lastPositionSeconds / video.duration) * 100))
      : 0;
    const progressBar = progressPercent > 2
      ? `<div class="video-card-progress"><div class="video-card-progress-fill" style="width: ${progressPercent}%;"></div></div>`
      : '';
    const thumbnail = this.tvMazePresentation.episodeArtwork(video);

    return `
      <div class="video-card" data-path="${this.ui.escapeHtml(video.path)}" role="button" tabindex="0" title="${title}">
        <div class="video-card-thumb">
          ${thumbnail}
          ${progressBar}
        </div>
        <div class="video-card-info">
          <div class="video-card-title">${title}</div>
          <div class="video-card-meta">
            ${seriesLabel}
            ${episodeLabel}
            ${airdate}
            <span data-video-duration>${this.formatDuration(video.duration)}</span>
            ${unsupportedBadge}
          </div>
          ${summary}
        </div>
      </div>
    `;
  }

  renderVideoRow(video, options = {}) {
    const title = this.ui.escapeHtml(video.tvMazeEpisodeTitle || video.title || video.name);
    const episodeLabel = options.showEpisode && Number.isInteger(video.episodeStart)
      ? `S${String(video.seasonNumber || 0).padStart(2, '0')} · E${String(video.episodeStart).padStart(2, '0')}`
      : this.episodeContextLabel(video);
    const airdate = video.tvMazeEpisodeAirdate ? ` · ${video.tvMazeEpisodeAirdate}` : '';
    const unsupportedLabel = video.playbackSupported === false ? 'Format not supported for local playback yet' : '';

    return `
      <div class="video-list-row" data-path="${this.ui.escapeHtml(video.path)}" role="button" tabindex="0" title="${title}">
        <div class="video-list-row-title">${title}</div>
        <div class="video-list-row-meta">${this.ui.escapeHtml(`${episodeLabel}${airdate}`)}</div>
        <div class="video-list-row-duration" data-video-duration>${this.formatDuration(video.duration)}</div>
        <div class="video-list-row-status">${unsupportedLabel}</div>
      </div>
    `;
  }

  loadViewPreference() {
    try {
      const value = localStorage.getItem('redshift-video-view-mode');
      return ['cards', 'list'].includes(value) ? value : 'cards';
    } catch (_) {
      return 'cards';
    }
  }

  saveViewPreference() {
    try {
      localStorage.setItem('redshift-video-view-mode', this.viewMode);
    } catch (_) {
      // The current selection remains active for this session if storage is unavailable.
    }
  }

  renderError(message) {
    const grid = document.getElementById('videosGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="empty-state videos-empty-state">
        <h3>Couldn't load videos</h3>
        <p>${this.ui.escapeHtml(message)}</p>
      </div>
    `;
  }
}
