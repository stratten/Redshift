// Renders selectable live audio visualizations beside desktop transport controls.
class AudioPlayerVisualization {
  constructor(audioPlayer) {
    this.player = audioPlayer;
    this.headerContainer = document.querySelector('.header-audio-visualization');
    this.container = document.getElementById('audioVisualization');
    this.canvas = document.getElementById('audioVisualizationCanvas');
    this.context = this.canvas.getContext('2d');
    this.modal = document.getElementById('audioVisualizationModal');
    this.modalCanvas = document.getElementById('audioVisualizationModalCanvas');
    this.modalContext = this.modalCanvas.getContext('2d');
    this.modalOpen = false;
    this.frequencyAnalyser = null;
    this.leftAnalyser = null;
    this.rightAnalyser = null;
    this.frequencyData = null;
    this.leftData = null;
    this.rightData = null;
    this.connectedGainNodes = new WeakSet();
    this.splitters = [];
    this.spectrogramState = new WeakMap();
    this.rafId = null;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.bindSettings();
    this.bindModal();
    this.resize();
  }

  bindSettings() {
    this.enabledInput = document.getElementById('audioVisualizationEnabled');
    this.modeInput = document.getElementById('audioVisualizationMode');
    this.modalModeInput = document.getElementById('modalAudioVisualizationMode');
    this.headerModeInput = document.getElementById('headerAudioVisualizationMode');
    this.headerModeMenu = document.getElementById('audioVisualizationModeMenu');
    this.headerModeOptions = [...this.headerModeMenu.querySelectorAll('[data-visualization-mode]')];
    const enabled = localStorage.getItem('audio-visualization-enabled') !== 'false';
    const mode = localStorage.getItem('audio-visualization-mode') || 'spectrogram';
    this.enabledInput.checked = enabled;
    this.modeInput.value = mode;
    this.modalModeInput.value = mode;
    this.updateHeaderModeSelection(mode);
    this.applySettings();
    this.enabledInput.addEventListener('change', () => {
      localStorage.setItem('audio-visualization-enabled', String(this.enabledInput.checked));
      this.applySettings();
    });
    this.modeInput.addEventListener('change', () => this.setMode(this.modeInput.value));
    this.headerModeInput.addEventListener('click', (event) => {
      event.stopPropagation();
      this.headerModeMenu.hidden = !this.headerModeMenu.hidden;
      this.headerModeInput.setAttribute('aria-expanded', String(!this.headerModeMenu.hidden));
    });
    this.headerModeOptions.forEach((option) => {
      option.addEventListener('click', () => this.setMode(option.dataset.visualizationMode));
    });
    document.addEventListener('click', () => this.closeHeaderModeMenu());
  }

  setMode(mode) {
    this.modeInput.value = mode;
    this.modalModeInput.value = mode;
    this.updateHeaderModeSelection(mode);
    localStorage.setItem('audio-visualization-mode', mode);
    this.spectrogramState.delete(this.canvas);
    this.spectrogramState.delete(this.modalCanvas);
    this.clear();
    this.drawFrame();
    this.closeHeaderModeMenu();
  }

  updateHeaderModeSelection(mode) {
    this.headerModeOptions.forEach((option) => {
      const selected = option.dataset.visualizationMode === mode;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-checked', String(selected));
    });
  }

  closeHeaderModeMenu() {
    this.headerModeMenu.hidden = true;
    this.headerModeInput.setAttribute('aria-expanded', 'false');
  }

  get isEnabled() {
    return this.enabledInput.checked;
  }

  applySettings() {
    this.container.hidden = !this.isEnabled;
    this.headerContainer.hidden = !this.isEnabled;
    if (!this.isEnabled) {
      this.stop();
      this.hideModal();
    }
    if (this.isEnabled && this.player.audioPlayerState.isPlaying) this.start();
  }

  bindModal() {
    const closeButton = document.getElementById('closeAudioVisualization');
    this.container.addEventListener('click', () => this.showModal());
    this.container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.showModal();
      }
    });
    this.modalModeInput.addEventListener('change', () => this.setMode(this.modalModeInput.value));
    closeButton.addEventListener('click', () => this.hideModal());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.hideModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modalOpen) this.hideModal();
    });
  }

  showModal() {
    if (!this.isEnabled) return;
    this.closeHeaderModeMenu();
    this.modalOpen = true;
    this.modal.style.display = 'flex';
    window.requestAnimationFrame(() => {
      this.resizeModal();
      this.drawFrame();
    });
  }

  hideModal() {
    this.modalOpen = false;
    this.modal.style.display = 'none';
  }

  ensureAnalysers() {
    const equalizer = this.player.equalizer;
    if (!equalizer?.audioContext) return false;
    if (!this.frequencyAnalyser) {
      const context = equalizer.audioContext;
      this.frequencyAnalyser = context.createAnalyser();
      this.frequencyAnalyser.fftSize = 2048;
      this.frequencyAnalyser.minDecibels = -90;
      this.frequencyAnalyser.maxDecibels = -10;
      this.frequencyAnalyser.smoothingTimeConstant = 0.72;
      this.leftAnalyser = context.createAnalyser();
      this.rightAnalyser = context.createAnalyser();
      this.leftAnalyser.fftSize = this.rightAnalyser.fftSize = 512;
      this.leftAnalyser.smoothingTimeConstant = this.rightAnalyser.smoothingTimeConstant = 0.5;
      this.frequencyData = new Float32Array(this.frequencyAnalyser.frequencyBinCount);
      this.leftData = new Uint8Array(this.leftAnalyser.fftSize);
      this.rightData = new Uint8Array(this.rightAnalyser.fftSize);
    }
    equalizer.chains.forEach((chain) => {
      if (!chain.gainNode || this.connectedGainNodes.has(chain.gainNode)) return;
      const splitter = equalizer.audioContext.createChannelSplitter(2);
      chain.gainNode.connect(this.frequencyAnalyser);
      chain.gainNode.connect(splitter);
      splitter.connect(this.leftAnalyser, 0);
      splitter.connect(this.rightAnalyser, 1);
      this.splitters.push(splitter);
      this.connectedGainNodes.add(chain.gainNode);
    });
    return true;
  }

  start() {
    if (!this.isEnabled || !this.ensureAnalysers() || this.rafId) return;
    const tick = () => {
      this.drawFrame();
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId) window.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.clear();
  }

  resize() {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.resizeSurface(this.canvas, this.context, this.width, this.height);
  }

  resizeModal() {
    this.modalCanvas.style.width = '';
    this.modalCanvas.style.height = '';
    this.modalWidth = Math.max(1, this.modalCanvas.clientWidth);
    this.modalHeight = Math.max(1, this.modalCanvas.clientHeight);
    this.resizeSurface(this.modalCanvas, this.modalContext, this.modalWidth, this.modalHeight);
  }

  resizeSurface(canvas, context, width, height) {
    canvas.width = Math.ceil(width * this.pixelRatio);
    canvas.height = Math.ceil(height * this.pixelRatio);
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.clearSurface(context, width, height);
  }

  clear() {
    this.clearSurface(this.context, this.width, this.height);
    if (this.modalWidth && this.modalHeight) {
      this.clearSurface(this.modalContext, this.modalWidth, this.modalHeight);
    }
  }

  clearSurface(context, width, height) {
    context.fillStyle = '#100f16';
    context.fillRect(0, 0, width, height);
  }

  drawFrame() {
    if (!this.frequencyAnalyser || !this.isEnabled) return;
    this.frequencyAnalyser.getFloatFrequencyData(this.frequencyData);
    this.drawSurface(this.canvas, this.context, this.width, this.height);
    if (this.modalOpen) {
      this.drawSurface(this.modalCanvas, this.modalContext, this.modalWidth, this.modalHeight);
    }
  }

  drawSurface(canvas, context, width, height) {
    const previousSurface = {
      canvas: this.canvas,
      context: this.context,
      width: this.width,
      height: this.height
    };
    this.canvas = canvas;
    this.context = context;
    this.width = width;
    this.height = height;
    if (this.modeInput.value === 'oscilloscope') this.drawOscilloscope();
    else if (this.modeInput.value === 'vectorscope') this.drawVectorscope();
    else this.drawSpectrogram();
    Object.assign(this, previousSurface);
  }

  drawSpectrogram() {
    const columnWidth = this.width >= 300 ? 4 : 2;
    const shift = Math.max(1, Math.round(columnWidth * this.pixelRatio));
    const pixels = this.context.getImageData(shift, 0, this.canvas.width - shift, this.canvas.height);
    this.context.putImageData(pixels, 0, 0);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    const state = this.spectrumStateForCurrentCanvas();
    const minFrequency = 32;
    const maxFrequency = Math.min(18000, this.frequencyAnalyser.context.sampleRate / 2);
    const ratio = maxFrequency / minFrequency;
    let framePeak = -90;

    for (let y = 0; y < this.height; y += 1) {
      const position = (this.height - 1 - y) / Math.max(1, this.height - 1);
      const startHz = minFrequency * Math.pow(ratio, position);
      const endHz = minFrequency * Math.pow(ratio, Math.min(1, position + 1 / this.height));
      const energy = this.logBandEnergy(startHz, endHz);
      const response = energy > state.levels[y] ? 0.55 : 0.12;
      const level = state.levels[y] + (energy - state.levels[y]) * response;
      state.levels[y] = level;
      framePeak = Math.max(framePeak, level);
    }

    state.peak = Math.max(framePeak, state.peak - 0.025);
    const floor = Math.max(-100, state.peak - 48);
    const dynamicRange = Math.max(12, state.peak - floor);
    for (let y = 0; y < this.height; y += 1) {
      const normalized = Math.max(0, Math.min(1, (state.levels[y] - floor) / dynamicRange));
      const intensity = Math.pow(normalized, 1.7);
      const highlight = Math.pow(normalized, 7);
      const hue = 352 + highlight * 56;
      const lightness = 4 + intensity * 43 + highlight * 17;
      this.context.fillStyle = `hsl(${hue} 100% ${lightness}%)`;
      this.context.fillRect(this.width - columnWidth, y, columnWidth, 1);
    }

    if (this.height >= 150) this.drawSpectrogramGrid();
  }

  spectrumStateForCurrentCanvas() {
    let state = this.spectrogramState.get(this.canvas);
    if (!state || state.levels.length !== this.height) {
      state = { levels: new Float32Array(this.height).fill(-90), peak: -45 };
      this.spectrogramState.set(this.canvas, state);
    }
    return state;
  }

  logBandEnergy(startHz, endHz) {
    const binWidth = this.frequencyAnalyser.context.sampleRate / this.frequencyAnalyser.fftSize;
    const firstBin = Math.max(1, Math.floor(startHz / binWidth));
    const lastBin = Math.min(this.frequencyData.length - 1, Math.ceil(endHz / binWidth));
    let sumOfPowers = 0;
    for (let bin = firstBin; bin <= lastBin; bin += 1) {
      const decibels = Math.max(-100, this.frequencyData[bin]);
      sumOfPowers += Math.pow(10, decibels / 10);
    }
    return 10 * Math.log10(sumOfPowers / (lastBin - firstBin + 1));
  }

  drawSpectrogramGrid() {
    this.context.strokeStyle = 'rgba(250, 204, 21, 0.12)';
    this.context.lineWidth = 1;
    for (let division = 1; division < 5; division += 1) {
      const y = (this.height / 5) * division;
      this.context.beginPath();
      this.context.moveTo(0, y);
      this.context.lineTo(this.width, y);
      this.context.stroke();
    }
  }

  drawOscilloscope() {
    this.clearSurface(this.context, this.width, this.height);
    this.frequencyAnalyser.getByteTimeDomainData(this.leftData);
    this.context.strokeStyle = 'rgba(250, 204, 21, 0.16)';
    this.context.beginPath();
    this.context.moveTo(0, this.height / 2);
    this.context.lineTo(this.width, this.height / 2);
    this.context.stroke();
    this.context.strokeStyle = '#facc15';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.leftData.forEach((value, index) => {
      const x = (index / (this.leftData.length - 1)) * this.width;
      const y = (value / 255) * this.height;
      index ? this.context.lineTo(x, y) : this.context.moveTo(x, y);
    });
    this.context.stroke();
  }

  drawVectorscope() {
    this.context.fillStyle = 'rgba(16, 15, 22, 0.2)';
    this.context.fillRect(0, 0, this.width, this.height);
    this.leftAnalyser.getByteTimeDomainData(this.leftData);
    this.rightAnalyser.getByteTimeDomainData(this.rightData);
    this.context.fillStyle = 'rgba(239, 68, 68, 0.28)';
    for (let index = 0; index < this.leftData.length; index += 2) {
      const x = (this.leftData[index] / 255) * this.width;
      const y = this.height - (this.rightData[index] / 255) * this.height;
      this.context.fillRect(x, y, 1.5, 1.5);
    }
  }
}
