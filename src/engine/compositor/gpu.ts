/**
 * The WebGL2 compositor (docs/06-engine.md §9): layer effects (blur, bloom, luma mattes),
 * motion-blur accumulation in a float buffer, and the finish (grain, soft glow). One context per
 * worker; framebuffers are pooled by name and size.
 *
 * Conventions: every texture holds premultiplied RGBA in GL orientation (row 0 = bottom);
 * canvas uploads use UNPACK_FLIP_Y and UNPACK_PREMULTIPLY_ALPHA, so 2D canvases round-trip
 * without precision loss or flips. Results are drawn into the bottom-left corner of this
 * compositor's canvas and returned as a source rectangle for `drawImage`.
 */

import type { BloomOptions, EffectImage, Effects } from './effects';

export type FinishOptions = {
  /** Film grain strength (0 = off, 1 = default). */
  grain: number;
  /** Soft glow strength (0 = off, 1 = default). */
  glow: number;
  /** Changes every 1/24 s so grain animates on film cadence (docs/04-motion-language.md §9). */
  step: number;
  /** Output pixels per 1080p design pixel (grain size and glow spread follow resolution). */
  scale: number;
};

type Target = {
  readonly tex: WebGLTexture;
  readonly fbo: WebGLFramebuffer;
  readonly w: number;
  readonly h: number;
};

type Program = {
  readonly program: WebGLProgram;
  /** Uniform locations by name; null for names the program doesn't use. */
  readonly uniforms: Map<string, WebGLUniformLocation | null>;
};

const VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  // One triangle covering the viewport; no vertex buffers.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// `u_scale` maps the target's UVs onto the source's: pyramid levels round their sizes up, so a
// level's content doesn't fill it exactly and sampling must account for that (registration).
const HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec2 u_scale;
`;

const LUMA = 'vec3(0.2126, 0.7152, 0.0722)';

const SHADERS = {
  copy: `${HEADER}
uniform float u_gain;
void main() { o = texture(u_tex, v_uv * u_scale) * u_gain; }`,

  blur: `${HEADER}
uniform vec2 u_step;
uniform int u_taps;
uniform float u_weights[16];
uniform float u_offsets[16];
void main() {
  vec2 uv = v_uv * u_scale;
  vec4 c = texture(u_tex, uv) * u_weights[0];
  for (int i = 1; i < 16; i++) {
    if (i >= u_taps) break;
    vec2 d = u_step * u_offsets[i];
    c += (texture(u_tex, uv + d) + texture(u_tex, uv - d)) * u_weights[i];
  }
  o = c;
}`,

  threshold: `${HEADER}
uniform float u_threshold;
void main() {
  vec4 c = texture(u_tex, v_uv * u_scale);
  float l = dot(c.rgb / max(c.a, 1e-4), ${LUMA});
  o = c * smoothstep(u_threshold - 0.1, u_threshold + 0.1, l);
}`,

  luma: `${HEADER}
void main() {
  // Premultiplied color: luma already includes coverage.
  float l = dot(texture(u_tex, v_uv * u_scale).rgb, ${LUMA});
  o = vec4(l);
}`,

  add: `${HEADER}
uniform sampler2D u_glow;
uniform vec2 u_glowScale;
uniform float u_gain;
void main() {
  vec4 c = texture(u_tex, v_uv * u_scale);
  vec4 g = texture(u_glow, v_uv * u_glowScale) * u_gain;
  // Screen-like add in premultiplied space: light never exceeds full coverage.
  float a = min(1.0, c.a + g.a * (1.0 - c.a));
  o = vec4(min(c.rgb + g.rgb * (1.0 - c.rgb), vec3(a)), a);
}`,

  grain: `${HEADER}
uniform float u_amount;
uniform float u_seed;
uniform vec2 u_cells;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + u_seed);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
void main() {
  vec4 c = texture(u_tex, v_uv * u_scale);
  float n = hash(floor(v_uv * u_cells)) - 0.5;
  // Grain rides on coverage, so transparent areas stay transparent.
  o = vec4(clamp(c.rgb + n * u_amount * c.a, 0.0, c.a), c.a);
}`,
} as const;

type ProgramName = keyof typeof SHADERS;

/**
 * UV scale for sampling a half-resolution target (rounded up) at full size: full-size texel j
 * sits at (j + ½) / 2 in half-resolution texels.
 */
function halfToFull(w: number, h: number, half: { w: number; h: number }): [number, number] {
  return [w / (2 * half.w), h / (2 * half.h)];
}

/** Gaussian weights for linear-sampled taps (pairs of texels share one bilinear fetch). */
function kernel(sigma: number): { weights: Float32Array; offsets: Float32Array; taps: number } {
  const radius = Math.max(1, Math.min(30, Math.ceil(sigma * 3)));
  const raw: number[] = [];
  let sum = 0;
  for (let i = 0; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    raw.push(v);
    sum += i === 0 ? v : 2 * v;
  }
  const weights = new Float32Array(16);
  const offsets = new Float32Array(16);
  weights[0] = (raw[0] as number) / sum;
  let taps = 1;
  for (let i = 1; i <= radius && taps < 16; i += 2) {
    const w1 = (raw[i] as number) / sum;
    const w2 = (raw[i + 1] ?? 0) / sum;
    const w = w1 + w2;
    weights[taps] = w;
    offsets[taps] = w > 0 ? (i * w1 + (i + 1) * w2) / w : i;
    taps++;
  }
  return { weights, offsets, taps };
}

/** Blur is computed at a lower resolution until σ ≤ this many pixels. */
const MAX_LEVEL_SIGMA = 4;

export class GpuCompositor implements Effects {
  readonly kind = 'gpu';
  /** Float render targets for accumulation (RGBA16F), else 8-bit. */
  readonly floatAccumulation: boolean;
  private readonly programs = new Map<ProgramName, Program>();
  private readonly targets = new Map<string, Target>();
  private readonly upload: WebGLTexture;
  private accumulation: Target | null = null;
  private lostContext = false;

  private constructor(
    private readonly canvas: OffscreenCanvas,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.floatAccumulation =
      gl.getExtension('EXT_color_buffer_half_float') !== null ||
      gl.getExtension('EXT_color_buffer_float') !== null;
    for (const name of Object.keys(SHADERS) as ProgramName[]) {
      this.programs.set(name, this.compile(SHADERS[name]));
    }
    this.upload = this.texture();
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lostContext = true;
    });
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  /** A compositor, or null where WebGL2 isn't available (the Canvas 2D effects take over). */
  static create(): GpuCompositor | null {
    if (typeof OffscreenCanvas === 'undefined') return null;
    try {
      const canvas = new OffscreenCanvas(1, 1);
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) return null;
      return new GpuCompositor(canvas, gl);
    } catch {
      return null;
    }
  }

  /** This compositor is its own effects backend. */
  get effects(): Effects {
    return this;
  }

  /** False after the GPU dropped the context; callers switch to Canvas 2D effects. */
  get usable(): boolean {
    return !this.lostContext && !this.gl.isContextLost();
  }

  // --- Effects ----------------------------------------------------------------------------

  blur(layer: OffscreenCanvas, sigma: number): EffectImage {
    const { width: w, height: h } = layer;
    const source = this.uploadCanvas(layer);
    if (!(sigma > 0.25)) return this.present(source, w, h, 'copy');
    const blurred = this.blurTexture(source, w, h, sigma, 'blur');
    return this.present(blurred.tex, w, h, 'copy');
  }

  bloom(layer: OffscreenCanvas, options: BloomOptions): EffectImage {
    const { width: w, height: h } = layer;
    const glow = this.glowTexture(
      this.uploadCanvas(layer),
      w,
      h,
      options.radius,
      options.threshold,
    );
    return this.present(glow.tex, w, h, 'copy', options.intensity, {
      u_scale: halfToFull(w, h, glow),
    });
  }

  lumaToAlpha(layer: OffscreenCanvas): EffectImage {
    return this.present(this.uploadCanvas(layer), layer.width, layer.height, 'luma');
  }

  // --- motion blur ------------------------------------------------------------------------

  beginAccumulation(width: number, height: number): void {
    const { gl } = this;
    this.accumulation = this.target(width, height, this.floatAccumulation ? 'f16' : 'u8', 'acc');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulation.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Adds `weight` × a rendered sub-frame to the accumulation buffer. */
  accumulate(frame: OffscreenCanvas, weight: number): void {
    const acc = this.accumulation;
    if (!acc) throw new Error('accumulate() before beginAccumulation()');
    const { gl } = this;
    const source = this.uploadCanvas(frame);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.pass('copy', source, acc, { u_gain: weight });
    gl.disable(gl.BLEND);
  }

  /** The averaged frame, finished (grain, glow) when asked. */
  resolve(finish: FinishOptions | null): EffectImage {
    const acc = this.accumulation;
    if (!acc) throw new Error('resolve() before beginAccumulation()');
    return this.finishTexture(acc.tex, acc.w, acc.h, finish);
  }

  /** Applies the finish to a rendered frame. */
  finish(frame: OffscreenCanvas, finish: FinishOptions): EffectImage {
    return this.finishTexture(this.uploadCanvas(frame), frame.width, frame.height, finish);
  }

  // --- internals --------------------------------------------------------------------------

  private finishTexture(
    tex: WebGLTexture,
    w: number,
    h: number,
    finish: FinishOptions | null,
  ): EffectImage {
    let source = tex;
    if (finish && finish.glow > 0) {
      // Highlights bloom softly (≈ 1.2u spread at 1080p), added screen-like.
      const glow = this.glowTexture(source, w, h, 13 * finish.scale, 0.72);
      const combined = this.target(w, h, 'u8', 'finish');
      this.pass(
        'add',
        source,
        combined,
        { u_gain: 0.55 * finish.glow, u_glowScale: halfToFull(w, h, glow) },
        glow.tex,
      );
      source = combined.tex;
    }
    if (finish && finish.grain > 0) {
      const cell = Math.max(1, finish.scale);
      return this.present(source, w, h, 'grain', 1, {
        u_amount: 0.085 * finish.grain,
        u_seed: (finish.step % 997) * 0.618,
        u_cells: [w / cell, h / cell],
      });
    }
    return this.present(source, w, h, 'copy');
  }

  /** Thresholded, blurred highlights at half resolution. */
  private glowTexture(
    source: WebGLTexture,
    w: number,
    h: number,
    sigma: number,
    threshold: number,
  ): Target {
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    const bright = this.target(hw, hh, 'u8', 'bright');
    this.pass('threshold', source, bright, {
      u_threshold: threshold,
      u_scale: [(2 * hw) / w, (2 * hh) / h],
    });
    return this.blurTexture(bright.tex, hw, hh, sigma / 2, 'glow');
  }

  /** Gaussian blur via a downsample pyramid and a separable kernel; returns a w × h target. */
  private blurTexture(
    source: WebGLTexture,
    w: number,
    h: number,
    sigma: number,
    slot: string,
  ): Target {
    let level = 0;
    while (sigma / 2 ** level > MAX_LEVEL_SIGMA && level < 6) level++;
    let tex = source;
    let lw = w;
    let lh = h;
    for (let i = 0; i < level; i++) {
      const pw = lw;
      const ph = lh;
      lw = Math.max(1, Math.ceil(pw / 2));
      lh = Math.max(1, Math.ceil(ph / 2));
      const down = this.target(lw, lh, 'u8', `${slot}-down${i}`);
      // Each texel averages the 2 × 2 source texels it covers.
      this.pass('copy', tex, down, { u_gain: 1, u_scale: [(2 * lw) / pw, (2 * lh) / ph] });
      tex = down.tex;
    }
    // Each halving already blurred a little; the kernel makes up the rest.
    const scale = 2 ** level;
    const pyramid = level > 0 ? 0.5 * scale : 0;
    const residual = Math.sqrt(Math.max(0.25, sigma * sigma - pyramid * pyramid)) / scale;
    const k = kernel(residual);
    const horizontal = this.target(lw, lh, 'u8', `${slot}-h`);
    this.pass('blur', tex, horizontal, {
      u_step: [1 / lw, 0],
      u_taps: k.taps,
      u_weights: k.weights,
      u_offsets: k.offsets,
    });
    const vertical = this.target(lw, lh, 'u8', `${slot}-v`);
    this.pass('blur', horizontal.tex, vertical, {
      u_step: [0, 1 / lh],
      u_taps: k.taps,
      u_weights: k.weights,
      u_offsets: k.offsets,
    });
    if (level === 0) return vertical;
    const full = this.target(w, h, 'u8', `${slot}-full`);
    this.pass('copy', vertical.tex, full, {
      u_gain: 1,
      u_scale: [w / (scale * lw), h / (scale * lh)],
    });
    return full;
  }

  /** Draws `tex` into this canvas's bottom-left w × h and returns that region. */
  private present(
    tex: WebGLTexture,
    w: number,
    h: number,
    program: 'copy' | 'luma' | 'grain',
    gain = 1,
    uniforms: Record<string, number | number[] | Float32Array> = {},
  ): EffectImage {
    const { canvas } = this;
    // Grow only: views of different sizes then don't reallocate every frame.
    if (canvas.width < w || canvas.height < h) {
      canvas.width = Math.max(canvas.width, w);
      canvas.height = Math.max(canvas.height, h);
    }
    this.pass(program, tex, null, { u_gain: gain, ...uniforms }, undefined, w, h);
    return { source: canvas, x: 0, y: canvas.height - h, width: w, height: h };
  }

  private pass(
    name: ProgramName,
    source: WebGLTexture,
    target: Target | null,
    uniforms: Record<string, number | number[] | Float32Array>,
    second?: WebGLTexture,
    width?: number,
    height?: number,
  ): void {
    const { gl } = this;
    const program = this.programs.get(name) as Program;
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : (width ?? 1), target ? target.h : (height ?? 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    this.uniform(program, 'u_tex', 0, true);
    // Uniforms persist per program: reset the UV scales unless this pass sets them.
    this.uniform(program, 'u_scale', [1, 1]);
    this.uniform(program, 'u_glowScale', [1, 1]);
    if (second) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, second);
      this.uniform(program, 'u_glow', 1, true);
    }
    for (const [key, value] of Object.entries(uniforms)) this.uniform(program, key, value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private uniform(
    program: Program,
    name: string,
    value: number | number[] | Float32Array,
    sampler = false,
  ): void {
    const { gl } = this;
    let location = program.uniforms.get(name);
    if (location === undefined) {
      location = gl.getUniformLocation(program.program, name);
      program.uniforms.set(name, location);
    }
    if (!location) return;
    if (sampler || name === 'u_taps') gl.uniform1i(location, value as number);
    else if (typeof value === 'number') gl.uniform1f(location, value);
    else if (value instanceof Float32Array) gl.uniform1fv(location, value);
    else if (value.length === 2) gl.uniform2f(location, value[0] as number, value[1] as number);
    else gl.uniform1fv(location, value);
  }

  private uploadCanvas(source: OffscreenCanvas): WebGLTexture {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.upload);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return this.upload;
  }

  private texture(): WebGLTexture {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) throw new Error('WebGL: texture allocation failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** A pooled render target; slots never alias, so a pass never reads what it writes. */
  private target(w: number, h: number, format: 'u8' | 'f16', slot: string): Target {
    const { gl } = this;
    const existing = this.targets.get(slot);
    if (existing && existing.w === w && existing.h === h) return existing;
    if (existing) {
      gl.deleteTexture(existing.tex);
      gl.deleteFramebuffer(existing.fbo);
    }
    const tex = this.texture();
    if (format === 'f16') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('WebGL: framebuffer allocation failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`WebGL: ${format} render target is incomplete`);
    }
    const target = { tex, fbo, w, h };
    this.targets.set(slot, target);
    return target;
  }

  private compile(fragment: string): Program {
    const { gl } = this;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error('WebGL: shader allocation failed');
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`WebGL shader: ${gl.getShaderInfoLog(s) ?? 'compile error'}`);
      }
      return s;
    };
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL: program allocation failed');
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`WebGL program: ${gl.getProgramInfoLog(program) ?? 'link error'}`);
    }
    return { program, uniforms: new Map() };
  }
}
