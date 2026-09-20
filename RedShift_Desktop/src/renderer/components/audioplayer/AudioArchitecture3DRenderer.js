// Renders a track-seeded, spectrum-shaped architectural field with WebGL2.
class AudioArchitecture3DRenderer {
  constructor() {
    this.states = new Map();
    this.vertexSource = `#version 300 es\nin vec4 a_voxel;uniform float u_time,u_bass,u_mids,u_treble,u_energy,u_balance,u_flux,u_seed,u_aspect;out float v_band,v_alpha,v_depth;void main(){float band=a_voxel.x;float spectrum=mix(u_bass,u_treble,band);spectrum=mix(spectrum,u_mids,1.-abs(band-.5)*2.);float height=(.18+a_voxel.w*.72)*(.32+spectrum*1.2);if(a_voxel.y>height){gl_Position=vec4(3.,3.,0.,1.);gl_PointSize=0.;return;}float fracture=step(.78,a_voxel.w)*u_flux*sin(u_time*7.+a_voxel.z*31.+u_seed*19.)*.18;vec3 p=vec3((a_voxel.x-.5)*2.05+u_balance*.14+fracture,a_voxel.y*1.55-.78,(a_voxel.z-.5)*1.32);float yaw=-.78+sin(u_time*.16+u_seed)*.09;float c=cos(yaw),s=sin(yaw);p.xz=mat2(c,-s,s,c)*p.xz;float pitch=.54;c=cos(pitch);s=sin(pitch);p.yz=mat2(c,-s,s,c)*p.yz;p.z+=2.85;float perspective=1.55/p.z;gl_Position=vec4(p.x*perspective/u_aspect,p.y*perspective,0.,1.);gl_PointSize=(2.+u_energy*6.+u_treble*2.)*perspective;v_band=band;v_alpha=.2+spectrum*.7;v_depth=p.z;}`;
    this.fragmentSource = `#version 300 es\nprecision mediump float;in float v_band,v_alpha,v_depth;out vec4 outColor;void main(){vec2 p=gl_PointCoord*2.-1.;float edge=max(abs(p.x),abs(p.y));float voxel=smoothstep(1.,.7,edge);float bevel=.7+.3*(1.-p.y)*(1.+p.x)*.5;vec3 red=vec3(.94,.15,.1),orange=vec3(.98,.35,.06),yellow=vec3(.98,.82,.15);vec3 color=mix(red,orange,smoothstep(.18,.58,v_band));color=mix(color,yellow,smoothstep(.64,.98,v_band));outColor=vec4(color*bevel,voxel*v_alpha);}`;
  }

  draw(visualizer) {
    const state = this.stateFor(visualizer);
    if (!state) return false;
    const features = this.featuresFor(visualizer);
    const flux = Math.max(0, features.energy - state.energy);
    state.energy = state.energy * 0.8 + features.energy * 0.2;
    const { gl } = state;
    gl.viewport(0, 0, state.canvas.width, state.canvas.height);
    gl.clearColor(0.063, 0.059, 0.086, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(state.program);
    [['time', performance.now() / 1000], ['bass', features.bass], ['mids', features.mids], ['treble', features.treble], ['energy', features.energy], ['balance', features.balance], ['flux', flux], ['seed', this.trackSeed(visualizer.player.audioPlayerState.currentTrack)], ['aspect', state.width / state.height]].forEach(([name, value]) => gl.uniform1f(state.uniforms[name], value));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, state.count);
    return true;
  }

  setActive(active) {
    this.states.forEach((state) => { state.canvas.style.display = active ? 'block' : 'none'; });
  }

  stateFor(visualizer) {
    let state = this.states.get(visualizer.canvas);
    if (!state) {
      const canvas = document.createElement('canvas');
      canvas.className = 'audio-webgl-visualization';
      visualizer.canvas.parentElement.append(canvas);
      const gl = canvas.getContext('webgl2', { antialias: false });
      const program = gl && this.programFor(gl);
      if (!program) return null;
      state = { canvas, gl, program, count: 0, width: 0, height: 0, energy: 0 };
      state.uniforms = ['time', 'bass', 'mids', 'treble', 'energy', 'balance', 'flux', 'seed', 'aspect'].reduce((result, name) => ({ ...result, [name]: gl.getUniformLocation(program, `u_${name}`) }), {});
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
    const columns = Math.min(42, Math.max(18, Math.round(state.width / 22)));
    const rows = Math.min(18, Math.max(10, Math.round(state.height / 36)));
    const levels = 26;
    state.count = columns * rows * levels;
    const voxels = new Float32Array(state.count * 4);
    let index = 0;
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const variance = Math.abs(Math.sin((column + 1) * 17.17 + (row + 1) * 43.71));
        for (let level = 0; level < levels; level += 1) {
          voxels.set([column / (columns - 1), level / (levels - 1), row / (rows - 1), variance], index);
          index += 4;
        }
      }
    }
    if (state.buffer) gl.deleteBuffer(state.buffer);
    state.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, voxels, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(state.program, 'a_voxel');
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
    return { bass: this.bandEnergy(visualizer, 32, 280), mids: this.bandEnergy(visualizer, 280, 2400), treble: this.bandEnergy(visualizer, 2400, 16000), energy: energy / visualizer.leftData.length, balance: balance / visualizer.leftData.length };
  }

  bandEnergy(visualizer, startHz, endHz) {
    const width = visualizer.frequencyAnalyser.context.sampleRate / visualizer.frequencyAnalyser.fftSize;
    const first = Math.max(1, Math.floor(startHz / width));
    const last = Math.min(visualizer.frequencyData.length - 1, Math.ceil(endHz / width));
    let total = 0;
    for (let bin = first; bin <= last; bin += 1) total += Math.max(0, (visualizer.frequencyData[bin] + 90) / 80);
    return total / (last - first + 1);
  }

  trackSeed(track) {
    return [...(track?.path || track?.filePath || track?.name || '')].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0) / 2147483648;
  }
}
