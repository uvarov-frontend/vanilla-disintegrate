import type { ResolvedParticleOptions } from './defaults';
import { resolveParticles } from './defaults';
import type { AnimationFactory, AnimationPlayback, ParticleContextLimits, ParticleOptions } from './types';

interface ParticlePrograms {
  readonly key: 'remove' | 'restore';
  readonly baseFragment: string;
  readonly particleVertex: string;
}

interface BaseUniforms {
  readonly blockSize: WebGLUniformLocation | null;
  readonly canvasSize: WebGLUniformLocation | null;
  readonly progress: WebGLUniformLocation | null;
  readonly source: WebGLUniformLocation | null;
  readonly sourceOffset: WebGLUniformLocation | null;
  readonly sourceSize: WebGLUniformLocation | null;
  readonly thresholds: WebGLUniformLocation | null;
  readonly transition: WebGLUniformLocation | null;
}

interface ParticleUniforms {
  readonly blockSize: WebGLUniformLocation | null;
  readonly canvasSize: WebGLUniformLocation | null;
  readonly curveMix: WebGLUniformLocation | null;
  readonly endScale: WebGLUniformLocation | null;
  readonly fadeStart: WebGLUniformLocation | null;
  readonly motionPower: WebGLUniformLocation | null;
  readonly progress: WebGLUniformLocation | null;
  readonly source: WebGLUniformLocation | null;
  readonly sourceOffset: WebGLUniformLocation | null;
  readonly textureSize: WebGLUniformLocation | null;
  readonly transition: WebGLUniformLocation | null;
  readonly waveTurns: WebGLUniformLocation | null;
}

interface CompiledParticlePrograms {
  readonly base: WebGLProgram;
  readonly baseUniforms: BaseUniforms;
  readonly baseVao: WebGLVertexArrayObject;
  readonly particle: WebGLProgram;
  readonly particleAttributes: readonly ParticleAttribute[];
  readonly particleUniforms: ParticleUniforms;
  readonly particleVao: WebGLVertexArrayObject;
}

type ParticleAttribute = readonly [location: number, size: number, offset: number];

type ParticleDraw = readonly [buffer: WebGLBuffer | null, count: number, vao: WebGLVertexArrayObject];

interface RendererContext {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly handleContextLost: () => void;
  readonly particleBuffer: WebGLBuffer;
  readonly programs: Map<ParticlePrograms['key'], CompiledParticlePrograms>;
  readonly quadBuffer: WebGLBuffer;
  cancelWarmup: (() => void) | null;
  destroyed: boolean;
  idleTimer: number | null;
}

export interface ParticleRenderer extends AnimationPlayback {
  readonly canvas: HTMLCanvasElement;
  readonly element: HTMLCanvasElement;
  readonly animation: Animation;
  readonly duration: number;
  readonly finished: Promise<void>;
  readonly layoutDelay: number;
  cancel: () => void;
  dispose: () => void;
}

interface ParticleField {
  readonly blockSize: number;
  readonly data: Float32Array;
  readonly thresholdHeight: number;
  readonly thresholdMap: Uint8Array;
  readonly thresholdWidth: number;
  readonly layoutReleaseProgress: number;
}

interface RenderBounds {
  canvasHeight: number;
  canvasWidth: number;
  cssWidth: number;
  cssHeight: number;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  sourceX: number;
  sourceY: number;
}

const PARTICLE_STRIDE = 7;
const PARTICLE_BUDGET = 180_000;
// Safari's Metal-backed POINTS path silently stops consuming interleaved
// attributes beyond this many records in one vertex buffer.
const PARTICLES_PER_BUFFER = 32_768;
const DEFAULT_MAX_RENDERER_CONTEXTS = 4;
const DEFAULT_MAX_IDLE_CONTEXTS = 2;

/**
 * Live WebGL2 contexts are a page-wide resource, not a per-effect one: browsers
 * keep only a dozen or so alive and silently drop the oldest beyond that. The
 * ceiling therefore belongs to the page rather than to `ParticleOptions`, where
 * two effects could ask for different values and neither would be right.
 */
const contextLimits = {
  maxContexts: DEFAULT_MAX_RENDERER_CONTEXTS,
  maxIdleContexts: DEFAULT_MAX_IDLE_CONTEXTS,
};

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/**
 * Adjusts how many WebGL2 contexts the particle renderer keeps alive per page.
 *
 * Lower it on memory-tight devices. Raising it lets more effects animate at once,
 * up to the point where the browser starts discarding contexts on its own, which
 * surfaces as an effect losing its surface mid-flight. Returns the values in use.
 */
export function configureParticleContexts(limits: ParticleContextLimits = {}) {
  contextLimits.maxContexts = positiveInteger(limits.maxContexts, contextLimits.maxContexts);
  contextLimits.maxIdleContexts = Math.min(
    contextLimits.maxContexts,
    nonNegativeInteger(limits.maxIdleContexts, contextLimits.maxIdleContexts),
  );
  return { ...contextLimits };
}
const CONTEXT_IDLE_TTL = 30_000;
const TRANSITION_WIDTH = 0.018;
const LAYOUT_RELEASE_FRACTION = 0.6;
const MIN_THRESHOLD = 0.025;
const MAX_THRESHOLD = 0.68;
const CONVERGENCE_FACTOR = 0.58;
const QUAD_VERTICES = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
const WEBGL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  desynchronized: false,
  failIfMajorPerformanceCaveat: false,
  powerPreference: 'default',
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  stencil: false,
};

const BASE_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
uniform vec2 u_canvas_size;
uniform vec2 u_source_offset;
uniform highp vec2 u_source_size;
out vec2 v_uv;

void main() {
  vec2 pixel = u_source_offset + a_position * u_source_size;
  vec2 clip = pixel / u_canvas_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_position;
}
`;

const REMOVE_BASE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_source;
uniform sampler2D u_thresholds;
uniform highp vec2 u_source_size;
uniform highp float u_block_size;
uniform float u_progress;
uniform float u_transition;
// The vertex stage produces this at highp; mediump here would round the scaled
// coordinate by up to a pixel and pick the neighbouring threshold block.
in highp vec2 v_uv;
out vec4 out_color;

void main() {
  vec4 color = texture(u_source, v_uv);
  ivec2 threshold_size = textureSize(u_thresholds, 0);
  vec2 source_pixel = min(floor(v_uv * u_source_size), u_source_size - vec2(1.0));
  ivec2 threshold_pixel = clamp(ivec2(source_pixel / u_block_size), ivec2(0), threshold_size - ivec2(1));
  // Sampled at a texel centre rather than with texelFetch: Gecko returns 0 for some
  // texels of this texture, which fades blocks that should still be intact. The
  // sampler is NEAREST, so this reads exactly the same texel on every engine.
  float threshold = texture(u_thresholds, (vec2(threshold_pixel) + 0.5) / vec2(threshold_size)).r;
  float intact = smoothstep(u_progress - u_transition, u_progress + u_transition, threshold);
  out_color = color * intact;
}
`;

const REMOVE_PARTICLE_VERTEX_SHADER = `#version 300 es
in vec2 a_source;
in float a_threshold;
in vec2 a_velocity;
in float a_swirl;
in float a_phase;
uniform vec2 u_canvas_size;
uniform vec2 u_source_offset;
uniform vec2 u_texture_size;
uniform float u_block_size;
uniform float u_end_scale;
uniform float u_curve_mix;
uniform float u_motion_power;
uniform float u_fade_start;
uniform float u_wave_turns;
uniform float u_progress;
uniform float u_transition;
out vec2 v_uv_origin;
out vec2 v_uv_size;
out float v_alpha;

void main() {
  float lifetime = max(0.0001, 1.0 - a_threshold);
  float local = clamp((u_progress - a_threshold) / lifetime, 0.0, 1.0);
  float ease_out = 1.0 - pow(1.0 - local, u_motion_power);
  float smooth_motion = local * local * (3.0 - 2.0 * local);
  float motion = mix(ease_out, smooth_motion, u_curve_mix);
  float activation = smoothstep(a_threshold - u_transition, a_threshold + u_transition, u_progress);
  float fade = 1.0 - smoothstep(u_fade_start, 1.0, local);
  float tail = 1.0 - smoothstep(0.78, 1.0, u_progress);
  float wave = sin(local * 6.2831853 * u_wave_turns + a_phase) * a_swirl * (1.0 - local * 0.35);
  vec2 source_center = u_source_offset + a_source + vec2(u_block_size * 0.5);
  vec2 pixel = source_center + a_velocity * motion + vec2(0.0, wave);
  vec2 clip = pixel / u_canvas_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, u_block_size * mix(1.0, u_end_scale, motion));
  v_uv_origin = a_source / u_texture_size;
  v_uv_size = vec2(u_block_size) / u_texture_size;
  v_alpha = activation * fade * tail;
}
`;

const RESTORE_BASE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_source;
uniform sampler2D u_thresholds;
uniform highp vec2 u_source_size;
uniform highp float u_block_size;
uniform float u_progress;
uniform float u_transition;
// The vertex stage produces this at highp; mediump here would round the scaled
// coordinate by up to a pixel and pick the neighbouring threshold block.
in highp vec2 v_uv;
out vec4 out_color;

void main() {
  vec4 color = texture(u_source, v_uv);
  ivec2 threshold_size = textureSize(u_thresholds, 0);
  vec2 source_pixel = min(floor(v_uv * u_source_size), u_source_size - vec2(1.0));
  ivec2 threshold_pixel = clamp(ivec2(source_pixel / u_block_size), ivec2(0), threshold_size - ivec2(1));
  // Sampled at a texel centre rather than with texelFetch: Gecko returns 0 for some
  // texels of this texture, which fades blocks that should still be intact. The
  // sampler is NEAREST, so this reads exactly the same texel on every engine.
  float threshold = texture(u_thresholds, (vec2(threshold_pixel) + 0.5) / vec2(threshold_size)).r;
  float arrival = 1.0 - threshold;
  float assembled = smoothstep(arrival - u_transition, arrival + u_transition, u_progress);
  out_color = color * assembled;
}
`;

const RESTORE_PARTICLE_VERTEX_SHADER = `#version 300 es
in vec2 a_source;
in float a_threshold;
in vec2 a_velocity;
in float a_swirl;
in float a_phase;
uniform vec2 u_canvas_size;
uniform vec2 u_source_offset;
uniform vec2 u_texture_size;
uniform float u_block_size;
uniform float u_end_scale;
uniform float u_curve_mix;
uniform float u_motion_power;
uniform float u_fade_start;
uniform float u_wave_turns;
uniform float u_progress;
uniform float u_transition;
out vec2 v_uv_origin;
out vec2 v_uv_size;
out float v_alpha;

void main() {
  float arrival = max(0.0001, 1.0 - a_threshold);
  float local = clamp(u_progress / arrival, 0.0, 1.0);
  float ease_in = pow(local, u_motion_power);
  float smooth_motion = local * local * (3.0 - 2.0 * local);
  float convergence = mix(ease_in, smooth_motion, u_curve_mix);
  float outbound = 1.0 - convergence;
  float appearance = smoothstep(0.0, max(0.0001, 1.0 - u_fade_start), local);
  float entrance = smoothstep(0.0, 0.22, u_progress);
  float settle = 1.0 - smoothstep(arrival - u_transition, arrival + u_transition, u_progress);
  float outbound_phase = 1.0 - local;
  float wave = sin(outbound_phase * 6.2831853 * u_wave_turns + a_phase) * a_swirl * (1.0 - outbound_phase * 0.35);
  vec2 source_center = u_source_offset + a_source + vec2(u_block_size * 0.5);
  vec2 pixel = source_center + a_velocity * outbound + vec2(0.0, wave);
  vec2 clip = pixel / u_canvas_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, u_block_size * mix(1.0, u_end_scale, outbound));
  v_uv_origin = a_source / u_texture_size;
  v_uv_size = vec2(u_block_size) / u_texture_size;
  v_alpha = entrance * appearance * settle;
}
`;

const PARTICLE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_source;
in highp vec2 v_uv_origin;
in highp vec2 v_uv_size;
in float v_alpha;
out vec4 out_color;

void main() {
  vec2 uv = v_uv_origin + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * v_uv_size;
  out_color = texture(u_source, uv) * v_alpha;
}
`;

const REMOVE_PROGRAMS: ParticlePrograms = {
  key: 'remove',
  baseFragment: REMOVE_BASE_FRAGMENT_SHADER,
  particleVertex: REMOVE_PARTICLE_VERTEX_SHADER,
};

const RESTORE_PROGRAMS: ParticlePrograms = {
  key: 'restore',
  baseFragment: RESTORE_BASE_FRAGMENT_SHADER,
  particleVertex: RESTORE_PARTICLE_VERTEX_SHADER,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveCurve(curve: ResolvedParticleOptions['curve']) {
  switch (curve) {
    case 'float':
      return { curveMix: 0.85, fadeStart: 0.3, motionPower: 2.2, waveTurns: 1.6 };
    case 'burst':
      return { curveMix: 0.45, fadeStart: 0.12, motionPower: 4, waveTurns: 1 };
    case 'drift':
      return { curveMix: 0, fadeStart: 0.32, motionPower: 2.2, waveTurns: 1.25 };
    case 'settle':
    default:
      return { curveMix: 0, fadeStart: 0.3, motionPower: 3, waveTurns: 1 };
  }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('Unable to create a WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (program === null) throw new Error('Unable to create a WebGL program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unknown WebGL link error.');
    }
    return program;
  } catch (error) {
    if (program !== null) gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex !== null) gl.deleteShader(vertex);
    if (fragment !== null) gl.deleteShader(fragment);
  }
}

function createTexture(gl: WebGL2RenderingContext, source: HTMLCanvasElement) {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('Unable to create the snapshot texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Global unpack state: it is reset after this upload so the threshold texture,
  // which is raw bytes rather than a DOM element, is not unpacked through it.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return texture;
}

function createThresholdTexture(gl: WebGL2RenderingContext, width: number, height: number, thresholds: Uint8Array) {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('Unable to create the particle threshold texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, thresholds);
  return texture;
}

/** Permanently releases a context instead of waiting for browser garbage collection. */
function releaseContext(gl: WebGL2RenderingContext) {
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Context release is best-effort and must never mask the original failure.
  }
}

const contextPools = new WeakMap<Document, RendererContextPool>();

function attributeLocation(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) throw new Error(`Unable to resolve WebGL attribute: ${name}.`);
  return location;
}

function deleteCompiledPrograms(gl: WebGL2RenderingContext, programs: CompiledParticlePrograms) {
  gl.deleteVertexArray(programs.baseVao);
  gl.deleteVertexArray(programs.particleVao);
  gl.deleteProgram(programs.base);
  gl.deleteProgram(programs.particle);
}

function bindParticleAttributes(gl: WebGL2RenderingContext, attributes: readonly ParticleAttribute[]) {
  const stride = PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  for (const attribute of attributes) {
    gl.enableVertexAttribArray(attribute[0]);
    gl.vertexAttribPointer(
      attribute[0],
      attribute[1],
      gl.FLOAT,
      false,
      stride,
      attribute[2] * Float32Array.BYTES_PER_ELEMENT,
    );
  }
}

function compileParticlePrograms(context: RendererContext, sources: ParticlePrograms) {
  const cached = context.programs.get(sources.key);
  if (cached !== undefined) return cached;

  const { gl } = context;
  let base: WebGLProgram | null = null;
  let particle: WebGLProgram | null = null;
  let baseVao: WebGLVertexArrayObject | null = null;
  let particleVao: WebGLVertexArrayObject | null = null;
  try {
    base = createProgram(gl, BASE_VERTEX_SHADER, sources.baseFragment);
    particle = createProgram(gl, sources.particleVertex, PARTICLE_FRAGMENT_SHADER);
    baseVao = gl.createVertexArray();
    particleVao = gl.createVertexArray();
    if (baseVao === null || particleVao === null) throw new Error('Unable to create WebGL vertex arrays.');

    gl.bindVertexArray(baseVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, context.quadBuffer);
    const basePosition = attributeLocation(gl, base, 'a_position');
    gl.enableVertexAttribArray(basePosition);
    gl.vertexAttribPointer(basePosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, context.particleBuffer);
    const attributes = [
      [attributeLocation(gl, particle, 'a_source'), 2, 0],
      [attributeLocation(gl, particle, 'a_threshold'), 1, 2],
      [attributeLocation(gl, particle, 'a_velocity'), 2, 3],
      [attributeLocation(gl, particle, 'a_swirl'), 1, 5],
      [attributeLocation(gl, particle, 'a_phase'), 1, 6],
    ] as const;
    bindParticleAttributes(gl, attributes);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const compiled: CompiledParticlePrograms = {
      base,
      baseVao,
      baseUniforms: {
        blockSize: gl.getUniformLocation(base, 'u_block_size'),
        canvasSize: gl.getUniformLocation(base, 'u_canvas_size'),
        progress: gl.getUniformLocation(base, 'u_progress'),
        source: gl.getUniformLocation(base, 'u_source'),
        sourceOffset: gl.getUniformLocation(base, 'u_source_offset'),
        sourceSize: gl.getUniformLocation(base, 'u_source_size'),
        thresholds: gl.getUniformLocation(base, 'u_thresholds'),
        transition: gl.getUniformLocation(base, 'u_transition'),
      },
      particle,
      particleAttributes: attributes,
      particleVao,
      particleUniforms: {
        blockSize: gl.getUniformLocation(particle, 'u_block_size'),
        canvasSize: gl.getUniformLocation(particle, 'u_canvas_size'),
        curveMix: gl.getUniformLocation(particle, 'u_curve_mix'),
        endScale: gl.getUniformLocation(particle, 'u_end_scale'),
        fadeStart: gl.getUniformLocation(particle, 'u_fade_start'),
        motionPower: gl.getUniformLocation(particle, 'u_motion_power'),
        progress: gl.getUniformLocation(particle, 'u_progress'),
        source: gl.getUniformLocation(particle, 'u_source'),
        sourceOffset: gl.getUniformLocation(particle, 'u_source_offset'),
        textureSize: gl.getUniformLocation(particle, 'u_texture_size'),
        transition: gl.getUniformLocation(particle, 'u_transition'),
        waveTurns: gl.getUniformLocation(particle, 'u_wave_turns'),
      },
    };
    context.programs.set(sources.key, compiled);
    return compiled;
  } catch (error) {
    if (baseVao !== null) gl.deleteVertexArray(baseVao);
    if (particleVao !== null) gl.deleteVertexArray(particleVao);
    if (base !== null) gl.deleteProgram(base);
    if (particle !== null) gl.deleteProgram(particle);
    throw error;
  } finally {
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

function createParticleDraws(
  gl: WebGL2RenderingContext,
  sharedBuffer: WebGLBuffer,
  sharedVao: WebGLVertexArrayObject,
  attributes: readonly ParticleAttribute[],
  data: Float32Array,
): ParticleDraw[] {
  const particleCount = data.length / PARTICLE_STRIDE;
  const draws: ParticleDraw[] = [];
  for (let offset = 0; offset < particleCount; offset += PARTICLES_PER_BUFFER) {
    const buffer = offset === 0 ? sharedBuffer : gl.createBuffer();
    const vao = offset === 0 ? sharedVao : gl.createVertexArray();
    if (buffer === null || vao === null) throw new Error('Unable to create WebGL particle buffers.');
    const count = Math.min(PARTICLES_PER_BUFFER, particleCount - offset);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      data.subarray(offset * PARTICLE_STRIDE, (offset + count) * PARTICLE_STRIDE),
      gl.STATIC_DRAW,
    );
    if (offset !== 0) {
      gl.bindVertexArray(vao);
      bindParticleAttributes(gl, attributes);
    }
    draws.push([offset === 0 ? null : buffer, count, vao]);
  }
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return draws;
}

function createRendererContext(ownerDocument: Document): RendererContext | null {
  const canvas = ownerDocument.createElement('canvas');
  const gl = canvas.getContext('webgl2', WEBGL_CONTEXT_ATTRIBUTES);
  if (gl === null) return null;

  const quadBuffer = gl.createBuffer();
  const particleBuffer = gl.createBuffer();
  if (quadBuffer === null || particleBuffer === null) {
    if (quadBuffer !== null) gl.deleteBuffer(quadBuffer);
    if (particleBuffer !== null) gl.deleteBuffer(particleBuffer);
    releaseContext(gl);
    throw new Error('Unable to create WebGL particle buffers.');
  }
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  } catch (error) {
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(particleBuffer);
    releaseContext(gl);
    throw error;
  }

  const context: RendererContext = {
    canvas,
    gl,
    quadBuffer,
    particleBuffer,
    programs: new Map(),
    destroyed: false,
    idleTimer: null,
    cancelWarmup: null,
    handleContextLost: () => {
      canvas.style.visibility = 'hidden';
    },
  };
  canvas.addEventListener('webglcontextlost', context.handleContextLost);
  return context;
}

function destroyRendererContext(context: RendererContext) {
  if (context.destroyed) return;
  context.destroyed = true;
  if (context.idleTimer !== null) context.canvas.ownerDocument.defaultView?.clearTimeout(context.idleTimer);
  context.idleTimer = null;
  context.cancelWarmup?.();
  context.cancelWarmup = null;
  context.canvas.removeEventListener('webglcontextlost', context.handleContextLost);
  const { gl } = context;
  if (!gl.isContextLost()) {
    for (const programs of context.programs.values()) deleteCompiledPrograms(gl, programs);
    gl.deleteBuffer(context.quadBuffer);
    gl.deleteBuffer(context.particleBuffer);
  }
  context.programs.clear();
  releaseContext(gl);
}

function resetRendererContext(context: RendererContext) {
  const { canvas, gl } = context;
  for (const animation of canvas.getAnimations()) animation.cancel();
  canvas.remove();
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, context.particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 0, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.useProgram(null);
  canvas.width = 1;
  canvas.height = 1;
  canvas.removeAttribute('style');
}

function scheduleIdle(ownerWindow: Window, callback: () => void) {
  if (typeof ownerWindow.requestIdleCallback === 'function') {
    const id = ownerWindow.requestIdleCallback(callback, { timeout: 1000 });
    return () => ownerWindow.cancelIdleCallback(id);
  }
  const id = ownerWindow.setTimeout(callback, 100);
  return () => ownerWindow.clearTimeout(id);
}

class RendererContextPool {
  private readonly contexts = new Set<RendererContext>();
  private readonly idle: RendererContext[] = [];
  private readonly ownerWindow: Window;

  constructor(private readonly ownerDocument: Document) {
    const ownerWindow = ownerDocument.defaultView;
    if (ownerWindow === null) throw new Error('A WebGL renderer requires an active Window.');
    this.ownerWindow = ownerWindow;
    ownerWindow.addEventListener('pagehide', this.destroyAll);
  }

  acquire() {
    while (this.idle.length > 0) {
      const context = this.idle.pop();
      if (context === undefined) break;
      this.cancelIdleWork(context);
      if (!context.destroyed && !context.gl.isContextLost()) {
        context.canvas.style.visibility = '';
        return context;
      }
      this.destroy(context);
    }

    if (this.contexts.size >= contextLimits.maxContexts) return null;
    const context = createRendererContext(this.ownerDocument);
    if (context !== null) this.contexts.add(context);
    return context;
  }

  release(context: RendererContext) {
    if (!this.contexts.has(context)) return;
    if (context.destroyed || context.gl.isContextLost()) {
      this.destroy(context);
      return;
    }
    try {
      resetRendererContext(context);
    } catch {
      this.destroy(context);
      return;
    }
    if (this.idle.length >= contextLimits.maxIdleContexts) {
      this.destroy(context);
      return;
    }

    this.idle.push(context);
    context.idleTimer = this.ownerWindow.setTimeout(() => this.destroy(context), CONTEXT_IDLE_TTL);
    context.cancelWarmup = scheduleIdle(this.ownerWindow, () => {
      context.cancelWarmup = null;
      if (!this.idle.includes(context) || context.destroyed || context.gl.isContextLost()) return;
      try {
        compileParticlePrograms(context, REMOVE_PROGRAMS);
        compileParticlePrograms(context, RESTORE_PROGRAMS);
      } catch {
        this.destroy(context);
      }
    });
  }

  discard(context: RendererContext) {
    this.destroy(context);
  }

  private cancelIdleWork(context: RendererContext) {
    if (context.idleTimer !== null) this.ownerWindow.clearTimeout(context.idleTimer);
    context.idleTimer = null;
    context.cancelWarmup?.();
    context.cancelWarmup = null;
  }

  private destroy(context: RendererContext) {
    this.cancelIdleWork(context);
    const idleIndex = this.idle.indexOf(context);
    if (idleIndex !== -1) this.idle.splice(idleIndex, 1);
    if (!this.contexts.delete(context)) return;
    destroyRendererContext(context);
  }

  private readonly destroyAll = () => {
    for (const context of [...this.contexts]) this.destroy(context);
    this.ownerWindow.removeEventListener('pagehide', this.destroyAll);
    contextPools.delete(this.ownerDocument);
  };
}

function rendererContextPool(ownerDocument: Document) {
  let pool = contextPools.get(ownerDocument);
  if (pool === undefined) {
    pool = new RendererContextPool(ownerDocument);
    contextPools.set(ownerDocument, pool);
  }
  return pool;
}

function acquireRendererContext(ownerDocument: Document) {
  const pool = rendererContextPool(ownerDocument);
  return { context: pool.acquire(), pool };
}

function createBounds(
  source: Pick<HTMLCanvasElement, 'width' | 'height'>,
  rect: DOMRectReadOnly,
  particles: ResolvedParticleOptions,
): RenderBounds {
  const scaleX = source.width / rect.width;
  const scaleY = source.height / rect.height;
  const drift = particles.horizontalDrift * 0.5;
  const convergence = rect.width * particles.convergence * CONVERGENCE_FACTOR * 0.5;
  const minX = Math.min(0, particles.horizontalTravel[0] - drift - convergence);
  const maxX = Math.max(0, particles.horizontalTravel[1] + drift + convergence);
  const minY = Math.min(0, particles.verticalTravel[0] - particles.swirl);
  const maxY = Math.max(0, particles.verticalTravel[1] + particles.swirl);
  const padding = Math.max(8, Math.min(rect.width, rect.height) * 0.04);
  // Pixel-grid alignment prevents LINEAR filtering from resmoothing intact frames.
  const pixelLeft = Math.floor((minX - padding) * scaleX);
  const pixelTop = Math.floor((minY - padding) * scaleY);
  const pixelRight = Math.ceil((rect.width + maxX + padding) * scaleX);
  const pixelBottom = Math.ceil((rect.height + maxY + padding) * scaleY);
  const canvasWidth = Math.max(1, pixelRight - pixelLeft);
  const canvasHeight = Math.max(1, pixelBottom - pixelTop);
  return {
    canvasHeight,
    canvasWidth,
    cssWidth: canvasWidth / scaleX,
    cssHeight: canvasHeight / scaleY,
    left: pixelLeft / scaleX,
    top: pixelTop / scaleY,
    scaleX,
    scaleY,
    sourceX: -pixelLeft,
    sourceY: -pixelTop,
  };
}

function resolveSourceSize(width: number, height: number, rect: DOMRectReadOnly, particles: ResolvedParticleOptions) {
  if (particles.renderQuality === 'exact') return { width, height };
  const budget = particles.renderQuality;
  const scale = Math.min(
    1,
    budget.maxSourceDimension / width,
    budget.maxSourceDimension / height,
    Math.sqrt(budget.maxSourcePixels / (width * height)),
  );
  let size = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };

  while (size.width > 1 || size.height > 1) {
    const bounds = createBounds(size, rect, particles);
    const renderPixels = bounds.canvasWidth * bounds.canvasHeight;
    if (renderPixels <= budget.maxRenderPixels) break;
    const renderScale = Math.min(0.999, Math.sqrt(budget.maxRenderPixels / renderPixels));
    const next = {
      width: Math.max(1, Math.floor(size.width * renderScale)),
      height: Math.max(1, Math.floor(size.height * renderScale)),
    };
    if (next.width === size.width && next.height === size.height) break;
    size = next;
  }
  return size;
}

function releaseReadback(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

function resolveThreshold(particles: ResolvedParticleOptions, column: number, row: number, noise: number) {
  switch (particles.release) {
    case 'top':
      // Noise dominates so no hard geometric front forms; the row bias releases the top first.
      return 0.04 + row * 0.12 + noise * 0.62;
    case 'right':
      return (1 - column) * 0.78 + noise * 0.22;
    case 'random':
      return noise;
    case 'left':
    default:
      return column * 0.78 + noise * 0.22;
  }
}

export function createParticleField(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  particles: ResolvedParticleOptions,
  scaleX: number,
  scaleY: number,
  random: () => number,
): ParticleField {
  const blockSize = Math.max(1, Math.ceil(Math.sqrt((width * height) / PARTICLE_BUDGET)));
  const thresholdWidth = Math.ceil(width / blockSize);
  const thresholdHeight = Math.ceil(height / blockSize);
  const blockCount = thresholdWidth * thresholdHeight;
  const visibleBlocks = new Uint8Array(blockCount);
  let particleCount = 0;

  for (let blockY = 0; blockY < thresholdHeight; blockY += 1) {
    const y = blockY * blockSize;
    const blockHeight = Math.min(blockSize, height - y);
    for (let blockX = 0; blockX < thresholdWidth; blockX += 1) {
      const x = blockX * blockSize;
      const blockWidth = Math.min(blockSize, width - x);
      let visible = false;
      for (let localY = 0; localY < blockHeight && !visible; localY += 1) {
        for (let localX = 0; localX < blockWidth; localX += 1) {
          if ((pixels[((y + localY) * width + x + localX) * 4 + 3] ?? 0) > 0) {
            visible = true;
            break;
          }
        }
      }
      if (!visible) continue;
      visibleBlocks[blockY * thresholdWidth + blockX] = 1;
      particleCount += 1;
    }
  }

  const data = new Float32Array(particleCount * PARTICLE_STRIDE);
  const thresholdMap = new Uint8Array(blockCount);
  const visibleThresholds = new Uint32Array(256);
  // Safari's WebGL backend can draw a phantom strip for large, ascending source rows.
  // Write the same records in reverse order without allocating or traversing another buffer.
  let dataOffset = data.length - PARTICLE_STRIDE;

  for (let blockY = 0; blockY < thresholdHeight; blockY += 1) {
    const y = blockY * blockSize;
    for (let blockX = 0; blockX < thresholdWidth; blockX += 1) {
      const x = blockX * blockSize;
      const blockWidth = Math.min(blockSize, width - x);
      const blockHeight = Math.min(blockSize, height - y);
      const noise = random();
      const column = (x + blockWidth * 0.5) / width;
      const row = (y + blockHeight * 0.5) / height;
      const rawThreshold = resolveThreshold(particles, column, row, noise);
      const threshold = MIN_THRESHOLD + clamp(rawThreshold, 0, 1) * (MAX_THRESHOLD - MIN_THRESHOLD);
      const encodedThreshold = Math.round(threshold * 255);
      const blockIndex = blockY * thresholdWidth + blockX;
      thresholdMap[blockIndex] = encodedThreshold;
      if (visibleBlocks[blockIndex] === 0) continue;
      visibleThresholds[encodedThreshold] = (visibleThresholds[encodedThreshold] ?? 0) + 1;

      const directedTravel =
        particles.horizontalTravel[0] === particles.horizontalTravel[1]
          ? particles.horizontalTravel[0]
          : particles.horizontalTravel[0] + random() * (particles.horizontalTravel[1] - particles.horizontalTravel[0]);
      const verticalTravel =
        particles.verticalTravel[0] === particles.verticalTravel[1]
          ? particles.verticalTravel[0]
          : particles.verticalTravel[0] + random() * (particles.verticalTravel[1] - particles.verticalTravel[0]);
      const centerPull = (0.5 - column) * width * particles.convergence * CONVERGENCE_FACTOR;
      const velocityX = (directedTravel + particles.horizontalDrift * (random() - 0.5)) * scaleX + centerPull;
      const velocityY = verticalTravel * scaleY;
      const swirl = particles.swirl * (0.45 + random() * 0.55) * scaleY;
      data[dataOffset] = x;
      data[dataOffset + 1] = y;
      data[dataOffset + 2] = threshold;
      data[dataOffset + 3] = velocityX;
      data[dataOffset + 4] = velocityY;
      data[dataOffset + 5] = swirl;
      data[dataOffset + 6] = random() * Math.PI * 2;
      dataOffset -= PARTICLE_STRIDE;
    }
  }

  const releaseCount = Math.ceil(particleCount * LAYOUT_RELEASE_FRACTION);
  let accumulated = 0;
  let releaseThreshold = 0;
  for (; releaseThreshold < visibleThresholds.length; releaseThreshold += 1) {
    accumulated += visibleThresholds[releaseThreshold] ?? 0;
    if (accumulated >= releaseCount) break;
  }

  return {
    blockSize,
    data,
    thresholdHeight,
    thresholdMap,
    thresholdWidth,
    layoutReleaseProgress: particleCount === 0 ? 0 : Math.min(255, releaseThreshold) / 255,
  };
}

function createParticleRenderer(
  snapshot: HTMLCanvasElement,
  rect: DOMRectReadOnly,
  particles: ResolvedParticleOptions,
  programs: ParticlePrograms,
  random: () => number,
): ParticleRenderer | null {
  if (snapshot.width <= 0 || snapshot.height <= 0 || rect.width <= 0 || rect.height <= 0) return null;

  // Capture adapters may have created their 2D context without the readback hint.
  // Reading such a reused canvas repeatedly makes Chromium switch its backing
  // store and emit a warning. A short-lived CPU-backed canvas keeps the source
  // snapshot reusable without retaining another full-size pixel buffer.
  const readback = snapshot.ownerDocument.createElement('canvas');
  const sourceSize = resolveSourceSize(snapshot.width, snapshot.height, rect, particles);
  readback.width = sourceSize.width;
  readback.height = sourceSize.height;
  const readbackContext = readback.getContext('2d', { willReadFrequently: true });
  if (readbackContext === null) {
    releaseReadback(readback);
    return null;
  }
  const sourcePixels = (() => {
    try {
      readbackContext.drawImage(snapshot, 0, 0, sourceSize.width, sourceSize.height);
      return readbackContext.getImageData(0, 0, sourceSize.width, sourceSize.height).data;
    } catch (error) {
      releaseReadback(readback);
      throw error;
    }
  })();

  const bounds = createBounds(sourceSize, rect, particles);
  const field = createParticleField(
    sourcePixels,
    sourceSize.width,
    sourceSize.height,
    particles,
    bounds.scaleX,
    bounds.scaleY,
    random,
  );
  if (field.data.length === 0) {
    releaseReadback(readback);
    return null;
  }

  const acquired = acquireRendererContext(snapshot.ownerDocument);
  const rendererContext = acquired.context;
  if (rendererContext === null) {
    releaseReadback(readback);
    return null;
  }
  const { canvas, gl } = rendererContext;

  try {
    const { canvasHeight, canvasWidth } = bounds;
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const exceedsSoftwareBudget =
      particles.renderQuality !== 'exact' && canvasWidth * canvasHeight > particles.renderQuality.maxRenderPixels;
    const exceedsHardware =
      sourceSize.width > maxTextureSize ||
      sourceSize.height > maxTextureSize ||
      canvasWidth > (maxViewport[0] ?? maxTextureSize) ||
      canvasHeight > (maxViewport[1] ?? maxTextureSize);
    if (exceedsSoftwareBudget || exceedsHardware) {
      if (particles.renderQuality === 'exact' && exceedsHardware) {
        throw new RangeError(
          `Exact particle rendering requires a ${String(sourceSize.width)}×${String(sourceSize.height)} texture and a ${String(canvasWidth)}×${String(canvasHeight)} viewport, exceeding this WebGL2 device's limits.`,
        );
      }
      acquired.pool.release(rendererContext);
      return null;
    }
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    Object.assign(canvas.style, {
      height: `${bounds.cssHeight}px`,
      left: `${bounds.left}px`,
      pointerEvents: 'none',
      position: 'absolute',
      top: `${bounds.top}px`,
      width: `${bounds.cssWidth}px`,
    });

    const compiled = compileParticlePrograms(rendererContext, programs);
    const { base, baseUniforms, baseVao, particle, particleAttributes, particleUniforms, particleVao } = compiled;
    const particleDraws = createParticleDraws(
      gl,
      rendererContext.particleBuffer,
      particleVao,
      particleAttributes,
      field.data,
    );
    const sourceTexture = createTexture(gl, readback);
    releaseReadback(readback);
    const thresholdTexture = createThresholdTexture(
      gl,
      field.thresholdWidth,
      field.thresholdHeight,
      field.thresholdMap,
    );

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);

    const canvasSize = [canvas.width, canvas.height] as const;
    const sourceOffset = [bounds.sourceX, bounds.sourceY] as const;
    const textureSize = [sourceSize.width, sourceSize.height] as const;
    const curve = resolveCurve(particles.curve);

    const bindTexture = (uniform: WebGLUniformLocation | null, texture: WebGLTexture, unit: number) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    };

    gl.useProgram(base);
    gl.uniform2f(baseUniforms.canvasSize, ...canvasSize);
    gl.uniform2f(baseUniforms.sourceOffset, ...sourceOffset);
    gl.uniform2f(baseUniforms.sourceSize, ...textureSize);
    gl.uniform1f(baseUniforms.blockSize, field.blockSize);
    gl.uniform1f(baseUniforms.transition, TRANSITION_WIDTH);
    bindTexture(baseUniforms.source, sourceTexture, 0);
    bindTexture(baseUniforms.thresholds, thresholdTexture, 1);

    gl.useProgram(particle);
    gl.uniform2f(particleUniforms.canvasSize, ...canvasSize);
    gl.uniform2f(particleUniforms.sourceOffset, ...sourceOffset);
    gl.uniform2f(particleUniforms.textureSize, ...textureSize);
    gl.uniform1f(particleUniforms.blockSize, field.blockSize);
    gl.uniform1f(particleUniforms.endScale, particles.endScale);
    gl.uniform1f(particleUniforms.curveMix, curve.curveMix);
    gl.uniform1f(particleUniforms.motionPower, curve.motionPower);
    gl.uniform1f(particleUniforms.fadeStart, curve.fadeStart);
    gl.uniform1f(particleUniforms.waveTurns, curve.waveTurns);
    gl.uniform1f(particleUniforms.transition, TRANSITION_WIDTH);
    bindTexture(particleUniforms.source, sourceTexture, 0);

    const render = (progress: number) => {
      if (gl.isContextLost()) return;
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(base);
      gl.bindVertexArray(baseVao);
      gl.uniform1f(baseUniforms.progress, progress);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.useProgram(particle);
      gl.uniform1f(particleUniforms.progress, progress);
      for (const draw of particleDraws) {
        gl.bindVertexArray(draw[2]);
        gl.drawArrays(gl.POINTS, 0, draw[1]);
      }
      gl.bindVertexArray(null);
    };

    let disposed = false;
    let frame = 0;
    render(0);
    const duration = particles.duration + particles.stagger;
    const animation = canvas.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration,
      easing: 'linear',
      fill: 'both',
    });

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      animation.cancel();
      if (gl.isContextLost()) {
        acquired.pool.discard(rendererContext);
        return;
      }
      gl.deleteTexture(sourceTexture);
      gl.deleteTexture(thresholdTexture);
      for (const draw of particleDraws.slice(1)) {
        gl.deleteVertexArray(draw[2]);
        gl.deleteBuffer(draw[0]);
      }
      acquired.pool.release(rendererContext);
    };
    const tick = () => {
      if (disposed || gl.isContextLost()) return;
      const timingProgress = animation.effect?.getComputedTiming().progress;
      const timelineProgress = typeof timingProgress === 'number' ? timingProgress : 0;
      render(timelineProgress);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const finished = animation.finished.then(
      () => {
        if (!disposed) render(1);
        cancelAnimationFrame(frame);
      },
      () => undefined,
    );

    return {
      canvas,
      element: canvas,
      animation,
      duration,
      finished,
      layoutDelay: duration * field.layoutReleaseProgress,
      cancel: dispose,
      dispose,
    };
  } catch (error) {
    acquired.pool.discard(rendererContext);
    throw error;
  } finally {
    releaseReadback(readback);
  }
}

function createParticlePhase(options: ParticleOptions, programs: ParticlePrograms): AnimationFactory {
  const particles = resolveParticles(options);
  return ({ snapshot, bounds, random }) => {
    if (snapshot === null) return null;
    return createParticleRenderer(snapshot, bounds, particles, programs, random);
  };
}

/** Creates a particle-based remove phase for a custom effect. */
export function createParticleAnimation(options: ParticleOptions = {}): AnimationFactory {
  return createParticlePhase(options, REMOVE_PROGRAMS);
}

/** Creates the paired particle-based restore phase for a custom effect. */
export function createParticleRestoreAnimation(options: ParticleOptions = {}): AnimationFactory {
  return createParticlePhase(options, RESTORE_PROGRAMS);
}
