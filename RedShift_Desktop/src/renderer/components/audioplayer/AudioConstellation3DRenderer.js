// Renders a track-seeded, audio-reactive particle field with WebGL2.
class AudioConstellation3DRenderer {
  constructor() {
    this.states = new Map();
    this.vertexSource = `#version 300 es\nin vec4 a_particle;uniform float u_time,u_bass,u_treble,u_energy,u_balance,u_seed,u_aspect;out float v_band,v_alpha;void main(){float phase=a_particle.w*6.28318+u_seed*5.;float spin=(.16+u_treble*.75)*(a_particle.z*2.-1.);float radius=.08+a_particle.z*(.48+u_bass*.4);float angle=phase+u_time*spin;vec2 p=vec2(cos(angle),sin(angle)*.7)*radius;p.x+=u_balance*(.08+a_particle.z*.24);p+=vec2(sin(u_time*.7+phase*3.)*.025,cos(u_time*.5+phase*2.)*.025)*(u_energy+.15);p.x/=u_aspect;gl_Position=vec4(p,1.-a_particle.z*1.8,1.);gl_PointSize=(2.+u_energy*8.)*(1.2-a_particle.z*.55);v_band=fract(a_particle.w*3.);v_alpha=.22+u_energy*.7;}`;
    this.fragmentSource = `#version 300 es\nprecision mediump float;in float v_band,v_alpha;out vec4 outColor;void main(){float d=length(gl_PointCoord-.5)*2.;float glow=smoothstep(1.,0.,d);vec3 red=vec3(.94,.18,.12),orange=vec3(.98,.38,.08),yellow=vec3(.98,.82,.15);vec3 color=mix(red,orange,smoothstep(.18,.55,v_band));color=mix(color,yellow,smoothstep(.68,.98,v_band));outColor=vec4(color,glow*glow*v_alpha);}`;
  }

  draw(visualizer) {
    const state = this.stateFor(visualizer);
    if (!state) return false;
    const { bass, treble, energy, balance } = this.featuresFor(visualizer);
    const gl = state.gl;
    gl.viewport(0, 0, state.canvas.width, state.canvas.height);
    gl.clearColor(0.063, 0.059, 0.086, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(state.program);
    gl.uniform1f(state.uniforms.time, performance.now() / 1000);
    gl.uniform1f(state.uniforms.bass, bass);
    gl.uniform1f(state.uniforms.treble, treble);
    gl.uniform1f(state.uniforms.energy, energy);
    gl.uniform1f(state.uniforms.balance, balance);
    gl.uniform1f(state.uniforms.seed, this.trackSeed(visualizer.player.audioPlayerState.currentTrack));
    gl.uniform1f(state.uniforms.aspect, state.width / state.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, state.count);
    return true;
  }

  setActive(active) {
    this.states.forEach((state) => {
      state.canvas.style.display = active ? 'block' : 'none';
    });
  }

  stateFor(visualizer) {
    let state = this.states.get(visualizer.canvas);
    if (!state) {
      const canvas = document.createElement('canvas');
      canvas.className = 'audio-webgl-visualization';
      visualizer.canvas.parentElement.append(canvas);
      const gl = canvas.getContext('webgl2', { antialias: false });
      if (!gl) return null;
      const program = this.programFor(gl);
      if (!program) return null;
      state = { canvas, gl, program, count: 0, width: 0, height: 0 };
      state.uniforms = ['time', 'bass', 'treble', 'energy', 'balance', 'seed', 'aspect'].reduce((result, name) => {
        result[name] = gl.getUniformLocation(program, `u_${name}`);
        return result;
      }, {});
      this.states.set(visualizer.canvas, state);
    }
    state.canvas.style.display = 'block';
    if (state.width !== visualizer.width || state.height !== visualizer.height) this.resizeState(state, visualizer);
    return state;
  }

  resizeState(state, visualizer) {
    const { gl } = state;
    state.width = visualizer.width;
    state.height = visualizer.height;
    state.canvas.width = Math.ceil(state.width * visualizer.pixelRatio);
    state.canvas.height = Math.ceil(state.height * visualizer.pixelRatio);
    state.count = Math.min(12000, Math.max(360, Math.round((state.width * state.height) / 38)));
    const particles = new Float32Array(state.count * 4);
    particles.forEach((_, index) => { particles[index] = Math.random(); });
    if (state.buffer) gl.deleteBuffer(state.buffer);
    state.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, particles, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(state.program, 'a_particle');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
  }

  programFor(gl) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, this.vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, this.fragmentSource);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
  }

  featuresFor(visualizer) {
    visualizer.leftAnalyser.getByteTimeDomainData(visualizer.leftData);
    visualizer.rightAnalyser.getByteTimeDomainData(visualizer.rightData);
    let energy = 0;
    let balance = 0;
    for (let index = 0; index < visualizer.leftData.length; index += 1) {
      const left = (visualizer.leftData[index] - 128) / 128;
      const right = (visualizer.rightData[index] - 128) / 128;
      energy += Math.abs((left + right) / 2);
      balance += right - left;
    }
    return { bass: this.bandEnergy(visualizer, 32, 280), treble: this.bandEnergy(visualizer, 2400, 16000), energy: energy / visualizer.leftData.length, balance: balance / visualizer.leftData.length };
  }

  bandEnergy(visualizer, startHz, endHz) {
    const binWidth = visualizer.frequencyAnalyser.context.sampleRate / visualizer.frequencyAnalyser.fftSize;
    const first = Math.max(1, Math.floor(startHz / binWidth));
    const last = Math.min(visualizer.frequencyData.length - 1, Math.ceil(endHz / binWidth));
    let total = 0;
    for (let bin = first; bin <= last; bin += 1) total += Math.max(0, (visualizer.frequencyData[bin] + 90) / 80);
    return total / (last - first + 1);
  }

  trackSeed(track) {
    return [...(track?.path || track?.filePath || track?.name || '')].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0) / 2147483648;
  }
}
