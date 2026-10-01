// src/renderer/components/video/TvMazeVideoPresentation.js - Provider-backed video-library display fragments.

class TvMazeVideoPresentation {
  constructor(uiManager) {
    this.ui = uiManager;
  }

  getSeriesMetadata(videos) {
    return videos.find((video) => video.tvMazeMatchStatus) || null;
  }

  seriesPoster(metadata, videos = []) {
    if (metadata?.tvMazePosterPath) {
      return `<img class="video-series-card-poster" src="${this.fileUrl(metadata.tvMazePosterPath)}" alt="">`;
    }
    const fallbackThumbnail = videos.find((video) => video.thumbnailPath)?.thumbnailPath;
    if (fallbackThumbnail) {
      return `<img class="video-series-card-poster video-series-card-poster-fallback" src="${this.fileUrl(fallbackThumbnail)}" alt="">`;
    }
    return '<div class="video-series-card-icon">TV</div>';
  }

  episodeArtwork(video) {
    if (video.tvMazeEpisodeImagePath) {
      return `<img src="${this.fileUrl(video.tvMazeEpisodeImagePath)}" alt="" class="video-card-artwork">`;
    }
    if (video.thumbnailPath) {
      return `<img src="${this.fileUrl(video.thumbnailPath)}" alt="" class="video-card-artwork video-card-artwork-fallback">`;
    }
    return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>`;
  }

  episodeSummary(video) {
    if (!video.tvMazeEpisodeSummary) return '';
    return `<p class="video-card-summary">${this.ui.escapeHtml(video.tvMazeEpisodeSummary)}</p>`;
  }

  seriesDetails(series) {
    const metadata = series.metadata;
    if (!metadata?.tvMazeMatchStatus) return '';

    if (metadata.tvMazeMatchStatus === 'needs_match') {
      return `<button type="button" class="btn btn-secondary btn-sm" data-video-action="choose-tvmaze-match" data-series-key="${this.ui.escapeHtml(series.key)}">Choose TVMaze Match</button>`;
    }
    if (metadata.tvMazeMatchStatus === 'matched') {
      const details = [
        metadata.tvMazePremiered ? metadata.tvMazePremiered.slice(0, 4) : '',
        metadata.tvMazeNetworkName || '',
        ...(metadata.tvMazeGenres || [])
      ].filter(Boolean).join(' · ');
      const summary = metadata.tvMazeShowSummary
        ? `<p class="tvmaze-show-summary">${this.ui.escapeHtml(metadata.tvMazeShowSummary)}</p>`
        : '';
      const sourceUrl = metadata.tvMazeShowUrl || 'https://www.tvmaze.com';
      const source = `<button type="button" class="btn btn-secondary btn-sm" data-video-action="open-tvmaze-source" data-url="${this.ui.escapeHtml(sourceUrl)}">Metadata and artwork: TVMaze</button>`;
      return `
        ${details ? `<p class="tvmaze-show-details">${this.ui.escapeHtml(details)}</p>` : ''}
        ${summary}
        <div class="tvmaze-series-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-video-action="refresh-tvmaze-series" data-series-key="${this.ui.escapeHtml(series.key)}">Refresh Metadata</button>
          <button type="button" class="btn btn-secondary btn-sm" data-video-action="change-tvmaze-match" data-series-key="${this.ui.escapeHtml(series.key)}">Change Match</button>
          ${source}
        </div>
      `;
    }

    const message = metadata.tvMazeMatchStatus === 'not_found'
      ? 'No TVMaze series was found for this local title.'
      : 'TVMaze metadata could not be loaded.';
    return `
      <p class="tvmaze-show-details">${message}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-video-action="refresh-tvmaze-series" data-series-key="${this.ui.escapeHtml(series.key)}">Retry Metadata</button>
    `;
  }

  fileUrl(filePath) {
    return `file://${encodeURI(filePath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  }
}
