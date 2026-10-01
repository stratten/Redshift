// src/renderer/components/video/TvMazeMatchModal.js - Select a TVMaze match for ambiguous local series.

class TvMazeMatchModal {
  constructor(uiManager) {
    this.ui = uiManager;
    this.seriesKey = null;
    this.modal = document.getElementById('tvMazeMatchModal');
    this.descriptionEl = document.getElementById('tvMazeMatchDescription');
    this.candidatesEl = document.getElementById('tvMazeMatchCandidates');
    this.errorEl = document.getElementById('tvMazeMatchError');
    this.closeBtn = document.getElementById('closeTvMazeMatchModal');
    this.sourceBtn = document.getElementById('openTvMazeSource');

    if (this.modal && this.closeBtn) this.bind();
  }

  bind() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.sourceBtn?.addEventListener('click', () => window.electronAPI.openExternal('https://www.tvmaze.com'));
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.close();
    });
    this.candidatesEl?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tvmaze-show-id]');
      if (!button || !this.seriesKey) return;
      this.select(Number(button.dataset.tvmazeShowId));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  isOpen() {
    return this.modal?.style.display === 'flex';
  }

  open({ seriesKey, localTitle, candidates }) {
    if (!this.modal || !this.candidatesEl) return;

    this.seriesKey = seriesKey;
    this.hideError();
    if (this.descriptionEl) {
      this.descriptionEl.textContent = `Choose the series that matches “${localTitle}”.`;
    }
    this.candidatesEl.innerHTML = candidates.map((candidate) => this.renderCandidate(candidate)).join('');
    this.modal.style.display = 'flex';
  }

  renderCandidate(candidate) {
    const year = candidate.premiered ? candidate.premiered.slice(0, 4) : 'Unknown year';
    const country = candidate.country || 'Unknown country';
    return `
      <button type="button" class="tvmaze-match-candidate" data-tvmaze-show-id="${candidate.id}">
        <div class="tvmaze-match-poster tvmaze-match-poster-placeholder">TV</div>
        <span class="tvmaze-match-candidate-info">
          <strong>${this.ui.escapeHtml(candidate.name)}</strong>
          <span>${this.ui.escapeHtml(`${year} · ${country}`)}</span>
        </span>
      </button>
    `;
  }

  async select(showId) {
    try {
      this.hideError();
      this.setBusy(true);
      await this.ui.videoLibrary.selectTvMazeMatch(this.seriesKey, showId);
      this.close();
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  setBusy(busy) {
    this.candidatesEl?.querySelectorAll('button').forEach((button) => {
      button.disabled = busy;
    });
  }

  showError(message) {
    if (!this.errorEl) return;
    this.errorEl.textContent = message;
    this.errorEl.style.display = 'block';
  }

  hideError() {
    if (!this.errorEl) return;
    this.errorEl.style.display = 'none';
  }

  close() {
    if (this.modal) this.modal.style.display = 'none';
    this.seriesKey = null;
  }
}
