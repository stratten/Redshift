// Generates a stereo-aware particle field from live audio features.
class AudioConstellationRenderer {
  constructor() {
    this.states = new WeakMap();
  }

  draw(visualizer) {
    const { context, canvas, width, height } = visualizer;
    const state = this.stateFor(canvas, width, height);
    const features = this.featuresFor(visualizer);
    const flux = Math.max(0, features.energy - state.energy);
    state.energy = state.energy * 0.82 + features.energy * 0.18;
    context.fillStyle = 'rgba(16, 15, 22, 0.16)';
    context.fillRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = 'lighter';
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * (0.1 + features.bass * 0.3);

    state.particles.forEach((particle) => {
      particle.angle += (0.012 + features.treble * 0.05) * particle.direction;
      const orbit = radius * (0.45 + particle.seed * 0.9);
      const targetX = centerX + Math.cos(particle.angle) * orbit + features.balance * width * 0.18;
      const targetY = centerY + Math.sin(particle.angle * 1.37) * orbit * 0.62;
      particle.vx = (particle.vx + (targetX - particle.x) * 0.018 + (Math.random() - 0.5) * flux * width * 0.22) * 0.88;
      particle.vy = (particle.vy + (targetY - particle.y) * 0.018 + (Math.random() - 0.5) * flux * height * 0.22) * 0.88;
      particle.x += particle.vx;
      particle.y += particle.vy;
      const color = particle.band === 0 ? '239, 68, 68' : particle.band === 1 ? '249, 115, 22' : '250, 204, 21';
      const alpha = 0.12 + features.energy * 0.35;
      context.fillStyle = `rgba(${color}, ${alpha})`;
      context.fillRect(particle.x - 1, particle.y - 1, 2, 2);
    });
    context.restore();
  }

  stateFor(canvas, width, height) {
    let state = this.states.get(canvas);
    const count = Math.min(160, Math.max(42, Math.round((width * height) / 3000)));
    if (!state || state.width !== width || state.height !== height) {
      state = {
        width,
        height,
        energy: 0,
        particles: Array.from({ length: count }, (_, index) => ({
          x: width / 2,
          y: height / 2,
          vx: 0,
          vy: 0,
          angle: Math.random() * Math.PI * 2,
          direction: index % 2 ? 1 : -1,
          seed: Math.random(),
          band: index % 3
        }))
      };
      this.states.set(canvas, state);
    }
    return state;
  }

  featuresFor(visualizer) {
    visualizer.leftAnalyser.getByteTimeDomainData(visualizer.leftData);
    visualizer.rightAnalyser.getByteTimeDomainData(visualizer.rightData);
    let mid = 0;
    let balance = 0;
    for (let index = 0; index < visualizer.leftData.length; index += 1) {
      const left = (visualizer.leftData[index] - 128) / 128;
      const right = (visualizer.rightData[index] - 128) / 128;
      mid += Math.abs((left + right) / 2);
      balance += right - left;
    }
    const sampleCount = visualizer.leftData.length;
    const bass = this.bandEnergy(visualizer, 32, 280);
    const treble = this.bandEnergy(visualizer, 2400, 16000);
    return { bass, treble, energy: (mid / sampleCount + bass + treble) / 3, balance: balance / sampleCount };
  }

  bandEnergy(visualizer, startHz, endHz) {
    const binWidth = visualizer.frequencyAnalyser.context.sampleRate / visualizer.frequencyAnalyser.fftSize;
    const first = Math.max(1, Math.floor(startHz / binWidth));
    const last = Math.min(visualizer.frequencyData.length - 1, Math.ceil(endHz / binWidth));
    let total = 0;
    for (let bin = first; bin <= last; bin += 1) total += Math.max(0, (visualizer.frequencyData[bin] + 90) / 80);
    return total / (last - first + 1);
  }
}
