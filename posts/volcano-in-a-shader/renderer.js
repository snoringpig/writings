// Minimal WebGL2 host for full-screen fragment shaders.
// One shared GL context renders any shader in horizontal tiles (so a heavy shader never
// blocks the GPU long enough to trip a watchdog), then copies the result to a 2D canvas.
class ShaderRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.programs = new Map();
    this.vs = this._compile(gl.VERTEX_SHADER,
      '#version 300 es\n' +
      'void main() {\n' +
      '  // one triangle that covers the whole screen: (-1,-1), (3,-1), (-1,3)\n' +
      '  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n' +
      '  gl_Position = vec4(2.0 * p - 1.0, 0.0, 1.0);\n' +
      '}\n');
    this.busy = Promise.resolve();
  }

  _compile(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile error:\n' + log);
    }
    return s;
  }

  program(fsSource) {
    if (this.programs.has(fsSource)) return this.programs.get(fsSource);
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this.vs);
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error:\n' + gl.getProgramInfoLog(p));
    this.programs.set(fsSource, p);
    return p;
  }

  // Queue renders so only one uses the shared context at a time.
  render(fsSource, target, opts) {
    const job = this.busy.then(() => this._render(fsSource, target, opts));
    this.busy = job.catch(() => {});
    return job;
  }

  async _render(fsSource, target, { width, height, spp = 1, uniforms = {}, onProgress, msPerTile = 35 }) {
    const gl = this.gl;
    this.canvas.width = width; this.canvas.height = height;
    target.width = width; target.height = height;
    const ctx = target.getContext('2d');
    const prog = this.program(fsSource);
    gl.useProgram(prog);
    gl.viewport(0, 0, width, height);
    const loc = n => gl.getUniformLocation(prog, n);
    gl.uniform2f(loc('uRes'), width, height);
    gl.uniform1i(loc('uSpp'), spp);
    for (const [k, v] of Object.entries(uniforms)) {
      const l = loc(k); if (!l) continue;
      if (Array.isArray(v)) gl['uniform' + v.length + 'fv'](l, v); else gl.uniform1f(l, v);
    }
    gl.enable(gl.SCISSOR_TEST);
    const px = new Uint8Array(4);
    let y = 0, rows = 4;
    const start = performance.now();
    while (y < height) {
      const h = Math.min(rows, height - y);
      const y0 = height - y - h;                 // GL's origin is bottom-left; we render top-down
      gl.scissor(0, y0, width, h);
      const t0 = performance.now();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, y0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // wait for the tile to finish
      const dt = performance.now() - t0;
      y += h;
      rows = Math.max(1, Math.min(256, Math.round(rows * msPerTile / Math.max(dt, 1))));
      ctx.drawImage(this.canvas, 0, 0);
      if (onProgress) onProgress(y / height);
      await new Promise(r => setTimeout(r, 0));
    }
    gl.disable(gl.SCISSOR_TEST);
    return performance.now() - start;
  }
}
