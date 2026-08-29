import type { ResolvedParticleOptions } from './defaults';
import { resolveParticles } from './defaults';
import type { AnimationFactory, AnimationPlayback, ParticleOptions } from './types';

interface ParticlePrograms {
  readonly baseFragment: string;
  readonly particleVertex: string;
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
  blockSize: number;
  data: Float32Array;
  thresholdMap: Uint8Array;
  layoutReleaseProgress: number;
}

interface RenderBounds {
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
const TRANSITION_WIDTH = 0.018;
const LAYOUT_RELEASE_FRACTION = 0.6;
const MIN_THRESHOLD = 0.025;
const MAX_THRESHOLD = 0.68;

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
uniform float u_progress;
uniform float u_transition;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec4 color = texture(u_source, v_uv);
  float threshold = texture(u_thresholds, v_uv).r;
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
uniform float u_progress;
uniform float u_transition;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec4 color = texture(u_source, v_uv);
  float threshold = texture(u_thresholds, v_uv).r;
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
in vec2 v_uv_origin;
in vec2 v_uv_size;
in float v_alpha;
out vec4 out_color;

void main() {
  vec2 uv = v_uv_origin + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * v_uv_size;
  out_color = texture(u_source, uv) * v_alpha;
}
`;

const REMOVE_PROGRAMS: ParticlePrograms = {
  baseFragment: REMOVE_BASE_FRAGMENT_SHADER,
  particleVertex: REMOVE_PARTICLE_VERTEX_SHADER,
};

const RESTORE_PROGRAMS: ParticlePrograms = {
  baseFragment: RESTORE_BASE_FRAGMENT_SHADER,
  particleVertex: RESTORE_PARTICLE_VERTEX_SHADER,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveMotion(motion: ResolvedParticleOptions['motion']) {
  switch (motion) {
    case 'vapor':
      return { curveMix: 0.85, fadeStart: 0.3, motionPower: 2.2, waveTurns: 1.6 };
    case 'scatter':
      return { curveMix: 0, fadeStart: 0.16, motionPower: 5, waveTurns: 2.4 };
    case 'wind':
      return { curveMix: 0, fadeStart: 0.32, motionPower: 2.2, waveTurns: 1.25 };
    case 'dust':
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
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (program === null) throw new Error('Unable to create a WebGL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown WebGL link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createTexture(gl: WebGL2RenderingContext, source: HTMLCanvasElement) {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('Unable to create the snapshot texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return texture;
}

function createThresholdTexture(gl: WebGL2RenderingContext, width: number, height: number, thresholds: Uint8Array) {
  const texture = gl.createTexture();
  if (texture === null) throw new Error('Unable to create the particle threshold texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, thresholds);
  return texture;
}

/**
 * Browsers cap the number of live WebGL contexts and silently drop the oldest one
 * once that cap is reached, so every exit path releases its context immediately
 * instead of waiting for garbage collection.
 */
function releaseContext(gl: WebGL2RenderingContext) {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

function withContext<T>(gl: WebGL2RenderingContext, create: () => T): T {
  try {
    return create();
  } catch (error) {
    releaseContext(gl);
    throw error;
  }
}

function createBounds(
  snapshot: HTMLCanvasElement,
  rect: DOMRectReadOnly,
  particles: ResolvedParticleOptions,
): RenderBounds {
  const scaleX = snapshot.width / rect.width;
  const scaleY = snapshot.height / rect.height;
  const drift = particles.horizontalDrift * 0.5;
  const minX = Math.min(0, particles.horizontalTravel[0] - drift);
  const maxX = Math.max(0, particles.horizontalTravel[1] + drift);
  const minY = Math.min(0, -particles.rise[1] - particles.swirl);
  const maxY = Math.max(0, particles.swirl);
  const padding = Math.max(8, Math.min(rect.width, rect.height) * 0.04);
  const left = minX - padding;
  const top = minY - padding;
  return {
    cssWidth: rect.width + maxX - minX + padding * 2,
    cssHeight: rect.height + maxY - minY + padding * 2,
    left,
    top,
    scaleX,
    scaleY,
    sourceX: -left * scaleX,
    sourceY: -top * scaleY,
  };
}

function resolveThreshold(particles: ResolvedParticleOptions, column: number, row: number, noise: number) {
  if (particles.motion === 'vapor') {
    // Noise dominates so no geometric front forms; the row bias releases the top first.
    return 0.04 + row * 0.12 + noise * 0.62;
  }

  const directional = particles.origin === 'right' ? 1 - column : column;
  return particles.origin === 'random' ? noise : directional * 0.78 + noise * 0.22;
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
  const thresholdMap = new Uint8Array(width * height);
  const visibleThresholds = new Uint32Array(256);
  const values: number[] = [];

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      const blockWidth = Math.min(blockSize, width - x);
      const blockHeight = Math.min(blockSize, height - y);
      let visible = false;
      for (let blockY = 0; blockY < blockHeight && !visible; blockY += 1) {
        for (let blockX = 0; blockX < blockWidth; blockX += 1) {
          if ((pixels[((y + blockY) * width + x + blockX) * 4 + 3] ?? 0) > 0) {
            visible = true;
            break;
          }
        }
      }

      const noise = random();
      const column = (x + blockWidth * 0.5) / width;
      const row = (y + blockHeight * 0.5) / height;
      const rawThreshold = resolveThreshold(particles, column, row, noise);
      const threshold = MIN_THRESHOLD + clamp(rawThreshold, 0, 1) * (MAX_THRESHOLD - MIN_THRESHOLD);
      const encodedThreshold = Math.round(threshold * 255);
      for (let blockY = 0; blockY < blockHeight; blockY += 1) {
        const rowStart = (y + blockY) * width + x;
        thresholdMap.fill(encodedThreshold, rowStart, rowStart + blockWidth);
      }
      if (!visible) continue;
      visibleThresholds[encodedThreshold] = (visibleThresholds[encodedThreshold] ?? 0) + 1;

      const directedTravel =
        particles.horizontalTravel[0] === particles.horizontalTravel[1]
          ? particles.horizontalTravel[0]
          : particles.horizontalTravel[0] + random() * (particles.horizontalTravel[1] - particles.horizontalTravel[0]);
      const riseSpan = particles.rise[1] - particles.rise[0];
      const riseAmount = particles.rise[0] + random() * riseSpan;
      // Pull scales with height, so the plume keeps tapering as it lifts.
      const riseFraction = riseSpan === 0 ? 1 : (riseAmount - particles.rise[0]) / riseSpan;
      const vaporCenterPull = particles.motion === 'vapor' ? (0.5 - column) * width * (0.16 + riseFraction * 0.42) : 0;
      const velocityX = (directedTravel + particles.horizontalDrift * (random() - 0.5)) * scaleX + vaporCenterPull;
      const velocityY = -riseAmount * scaleY;
      const swirl = particles.swirl * (0.45 + random() * 0.55) * scaleY;
      values.push(x, y, threshold, velocityX, velocityY, swirl, random() * Math.PI * 2);
    }
  }

  const particleCount = values.length / PARTICLE_STRIDE;
  const releaseCount = Math.ceil(particleCount * LAYOUT_RELEASE_FRACTION);
  let accumulated = 0;
  let releaseThreshold = 0;
  for (; releaseThreshold < visibleThresholds.length; releaseThreshold += 1) {
    accumulated += visibleThresholds[releaseThreshold] ?? 0;
    if (accumulated >= releaseCount) break;
  }

  return {
    blockSize,
    data: new Float32Array(values),
    thresholdMap,
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
  const sourceContext = snapshot.getContext('2d', { willReadFrequently: true });
  if (sourceContext === null || snapshot.width <= 0 || snapshot.height <= 0 || rect.width <= 0 || rect.height <= 0)
    return null;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    desynchronized: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (gl === null) return null;

  const bounds = createBounds(snapshot, rect, particles);
  const canvasWidth = Math.max(1, Math.ceil(bounds.cssWidth * bounds.scaleX));
  const canvasHeight = Math.max(1, Math.ceil(bounds.cssHeight * bounds.scaleY));
  const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  if (
    snapshot.width > maxTextureSize ||
    snapshot.height > maxTextureSize ||
    canvasWidth > (maxViewport[0] ?? maxTextureSize) ||
    canvasHeight > (maxViewport[1] ?? maxTextureSize)
  ) {
    releaseContext(gl);
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

  const sourcePixels = sourceContext.getImageData(0, 0, snapshot.width, snapshot.height).data;
  const field = createParticleField(
    sourcePixels,
    snapshot.width,
    snapshot.height,
    particles,
    bounds.scaleX,
    bounds.scaleY,
    random,
  );
  if (field.data.length === 0) {
    releaseContext(gl);
    return null;
  }

  const { baseProgram, particleProgram, quadBuffer, particleBuffer, sourceTexture, thresholdTexture } = withContext(
    gl,
    () => {
      const base = createProgram(gl, BASE_VERTEX_SHADER, programs.baseFragment);
      const particle = createProgram(gl, programs.particleVertex, PARTICLE_FRAGMENT_SHADER);
      const quad = gl.createBuffer();
      const points = gl.createBuffer();
      if (quad === null || points === null) throw new Error('Unable to create WebGL particle buffers.');
      return {
        baseProgram: base,
        particleProgram: particle,
        quadBuffer: quad,
        particleBuffer: points,
        sourceTexture: createTexture(gl, snapshot),
        thresholdTexture: createThresholdTexture(gl, snapshot.width, snapshot.height, field.thresholdMap),
      };
    },
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, field.data, gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const canvasSize = [canvas.width, canvas.height] as const;
  const sourceOffset = [bounds.sourceX, bounds.sourceY] as const;
  const sourceSize = [snapshot.width, snapshot.height] as const;
  const motion = resolveMotion(particles.motion);
  const basePosition = gl.getAttribLocation(baseProgram, 'a_position');
  const baseUniforms = {
    canvasSize: gl.getUniformLocation(baseProgram, 'u_canvas_size'),
    progress: gl.getUniformLocation(baseProgram, 'u_progress'),
    source: gl.getUniformLocation(baseProgram, 'u_source'),
    sourceOffset: gl.getUniformLocation(baseProgram, 'u_source_offset'),
    sourceSize: gl.getUniformLocation(baseProgram, 'u_source_size'),
    thresholds: gl.getUniformLocation(baseProgram, 'u_thresholds'),
    transition: gl.getUniformLocation(baseProgram, 'u_transition'),
  };
  const particleAttributes = [
    [gl.getAttribLocation(particleProgram, 'a_source'), 2, 0],
    [gl.getAttribLocation(particleProgram, 'a_threshold'), 1, 2],
    [gl.getAttribLocation(particleProgram, 'a_velocity'), 2, 3],
    [gl.getAttribLocation(particleProgram, 'a_swirl'), 1, 5],
    [gl.getAttribLocation(particleProgram, 'a_phase'), 1, 6],
  ] as const;
  const particleUniforms = {
    blockSize: gl.getUniformLocation(particleProgram, 'u_block_size'),
    canvasSize: gl.getUniformLocation(particleProgram, 'u_canvas_size'),
    curveMix: gl.getUniformLocation(particleProgram, 'u_curve_mix'),
    endScale: gl.getUniformLocation(particleProgram, 'u_end_scale'),
    fadeStart: gl.getUniformLocation(particleProgram, 'u_fade_start'),
    motionPower: gl.getUniformLocation(particleProgram, 'u_motion_power'),
    progress: gl.getUniformLocation(particleProgram, 'u_progress'),
    source: gl.getUniformLocation(particleProgram, 'u_source'),
    sourceOffset: gl.getUniformLocation(particleProgram, 'u_source_offset'),
    textureSize: gl.getUniformLocation(particleProgram, 'u_texture_size'),
    transition: gl.getUniformLocation(particleProgram, 'u_transition'),
    waveTurns: gl.getUniformLocation(particleProgram, 'u_wave_turns'),
  };

  const bindTexture = (uniform: WebGLUniformLocation | null, texture: WebGLTexture, unit: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniform, unit);
  };

  const render = (progress: number) => {
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(baseProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(basePosition);
    gl.vertexAttribPointer(basePosition, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(baseUniforms.canvasSize, ...canvasSize);
    gl.uniform2f(baseUniforms.sourceOffset, ...sourceOffset);
    gl.uniform2f(baseUniforms.sourceSize, ...sourceSize);
    gl.uniform1f(baseUniforms.progress, progress);
    gl.uniform1f(baseUniforms.transition, TRANSITION_WIDTH);
    bindTexture(baseUniforms.source, sourceTexture, 0);
    bindTexture(baseUniforms.thresholds, thresholdTexture, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(particleProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    const stride = PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    for (const [location, size, offset] of particleAttributes) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
    }
    gl.uniform2f(particleUniforms.canvasSize, ...canvasSize);
    gl.uniform2f(particleUniforms.sourceOffset, ...sourceOffset);
    gl.uniform2f(particleUniforms.textureSize, ...sourceSize);
    gl.uniform1f(particleUniforms.blockSize, field.blockSize);
    gl.uniform1f(particleUniforms.endScale, particles.endScale);
    gl.uniform1f(particleUniforms.curveMix, motion.curveMix);
    gl.uniform1f(particleUniforms.motionPower, motion.motionPower);
    gl.uniform1f(particleUniforms.fadeStart, motion.fadeStart);
    gl.uniform1f(particleUniforms.waveTurns, motion.waveTurns);
    gl.uniform1f(particleUniforms.progress, progress);
    gl.uniform1f(particleUniforms.transition, TRANSITION_WIDTH);
    bindTexture(particleUniforms.source, sourceTexture, 0);
    gl.drawArrays(gl.POINTS, 0, field.data.length / PARTICLE_STRIDE);
  };

  let disposed = false;
  let frame = 0;
  const handleContextLost = () => {
    // No restore is requested: the WAAPI clock still settles the operation.
    cancelAnimationFrame(frame);
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);
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
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    if (gl.isContextLost()) return;
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(particleBuffer);
    gl.deleteTexture(sourceTexture);
    gl.deleteTexture(thresholdTexture);
    gl.deleteProgram(baseProgram);
    gl.deleteProgram(particleProgram);
    releaseContext(gl);
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
    cancel: () => {
      animation.cancel();
      dispose();
    },
    dispose,
  };
}

function createParticlePhase(options: ParticleOptions, programs: ParticlePrograms): AnimationFactory {
  const particles = resolveParticles(options);
  return ({ snapshot, bounds, random }) => {
    if (snapshot === null) return null;
    return createParticleRenderer(snapshot, bounds, particles, programs, random);
  };
}

/** Creates a particle-based remove phase for a custom effect. */
export function createParticleAnimation(options: ParticleOptions = {}) {
  return createParticlePhase(options, REMOVE_PROGRAMS);
}

/** Creates the paired particle-based restore phase for a custom effect. */
export function createParticleRestoreAnimation(options: ParticleOptions = {}): AnimationFactory {
  return createParticlePhase(options, RESTORE_PROGRAMS);
}
