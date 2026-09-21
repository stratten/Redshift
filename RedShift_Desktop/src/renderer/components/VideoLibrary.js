// src/renderer/components/VideoLibrary.js - Local desktop video library grid and import flow.

class VideoLibrary {
  constructor(uiManager) {
    this.ui = uiManager;
    this.videos = [];
    this.hasLoadedOnce = false;
    this.activeCategory = 'all';
    this.selectedSeriesKey = null;
    this.query = '';
    this.setupEventListeners();
    this.setupIpcListeners();
  }

  setupEventListeners() {
    const rescanBtn = document.getElementById('rescanVideosBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => this.loadVideos());
    }

    const grid = document.getElementById('videosGrid');
    if (grid) {
      this.createToolbar(grid);
      grid.addEventListener('click', (event) => this.handleGridInteraction(event));
      grid.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        if (!event.target.closest('.video-card, .video-series-card, [data-video-action]')) return;
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
    toolbar.addEventListener('input', (event) => {
      if (event.target.id !== 'videoLibrarySearch') return;
      this.query = event.target.value;
      this.selectedSeriesKey = null;
      this.render();
      document.getElementById('videoLibrarySearch')?.focus();
    });
  }

  handleGridInteraction(event) {
    const action = event.target.closest('[data-video-action]');
    if (action?.dataset.videoAction === 'back-to-library') {
      this.selectedSeriesKey = null;
      this.render();
      return;
    }

    const seriesCard = event.target.closest('.video-series-card');
    if (seriesCard) {
      this.selectedSeriesKey = seriesCard.dataset.seriesKey;
      this.render();
      return;
    }

    const card = event.target.closest('.video-card');
    if (!card) return;
    const video = this.videos.find((item) => item.path === card.dataset.path);
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
    window.electronAPI.on('video-scan-progress', () => {
      // The current scan has no per-file phase; loadVideos owns the visible busy state.
    });
  }

  onTabActivated() {
    if (!this.hasLoadedOnce) {
      this.loadVideos();
    } else {
      this.render();
    }
  }

  async loadVideos() {
    const progressBar = document.getElementById('videoScanProgressBar');
    if (progressBar) progressBar.style.display = 'flex';

    try {
      this.videos = await window.electronAPI.invoke('scan-video-library');
      this.hasLoadedOnce = true;
      this.render();
    } catch (error) {
      this.ui.logBoth('error', `Failed to scan video library: ${error.message}`, '🎬');
      this.renderError(error.message);
    } finally {
      if (progressBar) progressBar.style.display = 'none';
    }
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
    }
    this.render();
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

    grid.innerHTML = this.renderLibrarySections(filteredVideos);
  }

  renderToolbar() {
    const toolbar = document.getElementById('videoLibraryToolbar');
    if (!toolbar) return;

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
    `;
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
    const series = this.groupSeries(videos);
    const movies = this.sortVideos(videos.filter((video) => video.contentKind === 'movie'));
    const otherVideos = this.sortVideos(videos.filter((video) => video.contentKind === 'other' || (video.contentKind === 'tv' && !video.seriesKey)));

    if (series.length > 0) {
      sections.push(this.renderSection('TV Shows', `<div class="video-series-grid">${series.map((seriesItem) => this.renderSeriesCard(seriesItem)).join('')}</div>`));
    }
    if (movies.length > 0) {
      sections.push(this.renderSection('Movies', `<div class="videos-grid-section">${movies.map((video) => this.renderCard(video)).join('')}</div>`));
    }
    if (otherVideos.length > 0) {
      sections.push(this.renderSection('Other Files', `<div class="videos-grid-section">${otherVideos.map((video) => this.renderCard(video)).join('')}</div>`));
    }

    return sections.join('');
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
      .map((series) => ({ ...series, videos: this.sortVideos(series.videos) }))
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  }

  renderSeriesCard(series) {
    const seasonCount = new Set(series.videos.map((video) => video.seasonNumber).filter(Number.isInteger)).size;
    const seasonLabel = seasonCount === 1 ? '1 season' : `${seasonCount} seasons`;
    return `
      <button type="button" class="video-series-card" data-series-key="${this.ui.escapeHtml(series.key)}">
        <div class="video-series-card-icon">TV</div>
        <div class="video-series-card-info">
          <div class="video-series-card-title">${this.ui.escapeHtml(series.title)}</div>
          <div class="video-series-card-meta">${seasonLabel} · ${series.videos.length} episode${series.videos.length !== 1 ? 's' : ''}</div>
        </div>
      </button>
    `;
  }

  renderSeries(grid, filteredVideos) {
    const series = this.groupSeries(filteredVideos).find((item) => item.key === this.selectedSeriesKey);
    if (!series) {
      this.selectedSeriesKey = null;
      this.render();
      return;
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
        return this.renderSection(label, `<div class="videos-grid-section">${this.sortVideos(seasonVideos).map((video) => this.renderCard(video, { showEpisode: true })).join('')}</div>`);
      })
      .join('');

    grid.innerHTML = `
      <div class="video-series-detail-header">
        <button type="button" class="btn btn-secondary btn-sm" data-video-action="back-to-library">All Videos</button>
        <div>
          <h3>${this.ui.escapeHtml(series.title)}</h3>
          <p>${series.videos.length} episode${series.videos.length !== 1 ? 's' : ''}</p>
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

  renderCard(video, options = {}) {
    const title = this.ui.escapeHtml(video.title || video.name);
    const episodeLabel = options.showEpisode && Number.isInteger(video.episodeStart)
      ? `<span>S${String(video.seasonNumber || 0).padStart(2, '0')} · E${String(video.episodeStart).padStart(2, '0')}</span>`
      : '';
    const unsupportedBadge = video.playbackSupported === false
      ? '<span class="video-card-badge video-card-badge-unsupported">Format not supported for local playback yet</span>'
      : '';
    const progressPercent = video.duration && video.lastPositionSeconds
      ? Math.min(100, Math.round((video.lastPositionSeconds / video.duration) * 100))
      : 0;
    const progressBar = progressPercent > 2
      ? `<div class="video-card-progress"><div class="video-card-progress-fill" style="width: ${progressPercent}%;"></div></div>`
      : '';

    return `
      <div class="video-card" data-path="${this.ui.escapeHtml(video.path)}" role="button" tabindex="0" title="${title}">
        <div class="video-card-thumb">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          ${progressBar}
        </div>
        <div class="video-card-info">
          <div class="video-card-title">${title}</div>
          <div class="video-card-meta">
            ${episodeLabel}
            <span>${this.formatDuration(video.duration)}</span>
            ${unsupportedBadge}
          </div>
        </div>
      </div>
    `;
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
