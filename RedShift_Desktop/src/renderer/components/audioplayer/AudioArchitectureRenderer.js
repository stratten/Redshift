// Builds a receding wireframe lattice whose geometry follows the spectrum.
class AudioArchitectureRenderer {
  constructor() {
    this.states = new WeakMap();
  }

  draw(visualizer) {
    const { context, canvas, width, height } = visualizer;
    const state = this.stateFor(canvas, width, height);
    const bands = this.spectrumBands(visualizer, 18);
    const average = bands.reduce((sum, level) => sum + level, 0) / bands.length;
    const flux = Math.max(0, average - state.energy);
    state.energy = state.energy * 0.84 + average * 0.16;
    state.phase += 0.01 + bands[0] * 0.035;
    context.fillStyle = 'rgba(16, 15, 22, 0.2)';
    context.fillRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = 'lighter';
    const layers = 7;
    const columns = bands.length;
    let previousLayer = null;

    for (let layer = 0; layer < layers; layer += 1) {
      const depth = layer / (layers - 1);
      const scale = 1 - depth * 0.72;
      const baseline = height * (0.83 - depth * 0.54);
      const points = [];
      for (let column = 0; column < columns; column += 1) {
        const position = column / (columns - 1) - 0.5;
        const energy = bands[(column + layer * 2) % columns];
        const fracture = (Math.random() - 0.5) * flux * width * 0.028;
        const x = width / 2 + position * width * 0.92 * scale + fracture;
        const y = baseline - energy * height * 0.38 * scale + Math.sin(state.phase + column * 0.7) * energy * 7;
        points.push({ x, y, energy });
      }
      context.strokeStyle = `rgba(250, ${90 + Math.round(state.energy * 114)}, 24, ${0.2 + (1 - depth) * 0.42})`;
      context.lineWidth = Math.max(0.6, 1.8 * scale);
      context.beginPath();
      points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();

      points.forEach((point, index) => {
        const floorY = baseline + height * 0.08 * scale;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x, floorY);
        context.stroke();
        if (previousLayer) {
          context.beginPath();
          context.moveTo(previousLayer[index].x, previousLayer[index].y);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
      });
      previousLayer = points;
    }
    context.restore();
  }

  stateFor(canvas, width, height) {
    let state = this.states.get(canvas);
    if (!state || state.width !== width || state.height !== height) {
      state = { width, height, energy: 0, phase: Math.random() * Math.PI * 2 };
      this.states.set(canvas, state);
    }
    return state;
  }

  spectrumBands(visualizer, count) {
    const minFrequency = 32;
    const maxFrequency = Math.min(16000, visualizer.frequencyAnalyser.context.sampleRate / 2);
    const ratio = maxFrequency / minFrequency;
    const binWidth = visualizer.frequencyAnalyser.context.sampleRate / visualizer.frequencyAnalyser.fftSize;
    return Array.from({ length: count }, (_, index) => {
      const start = minFrequency * Math.pow(ratio, index / count);
      const end = minFrequency * Math.pow(ratio, (index + 1) / count);
      const first = Math.max(1, Math.floor(start / binWidth));
      const last = Math.min(visualizer.frequencyData.length - 1, Math.ceil(end / binWidth));
      let total = 0;
      for (let bin = first; bin <= last; bin += 1) total += Math.max(0, (visualizer.frequencyData[bin] + 90) / 80);
      return total / (last - first + 1);
    });
  }
}
