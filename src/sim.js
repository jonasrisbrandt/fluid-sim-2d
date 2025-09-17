// Core simulation orchestrating the stable fluids pipeline.

import {
  createFBO,
  createDoubleFBO,
  resizeFBO,
  deleteFBO,
  blit,
  copyTexture,
} from "./gl.js";
import {
  createMaterial,
  clearShader,
  splatShader,
  advectionShader,
  curlShader,
  vorticityShader,
  divergenceShader,
  pressureShader,
  gradientSubtractShader,
  displayShader,
  bloomPrefilterShader,
  bloomBlurShader,
  bloomCombineShader,
} from "./shaders.js";
import { randomColor } from "./utils.js";

const DEFAULT_CONFIG = {
  velocityDissipation: 0.995,
  densityDissipation: 0.98,
  pressureDecay: 0.915,
  pressureIterations: 40,
  curlStrength: 11.0,
  splatRadius: 0.002,
  splatForce: 13800.0,
  texelDownsample: 3,
  paused: false,
  cycleColors: true,
  colorCycleSpeed: 0.5,
  gamma: 2.2,
  exposure: 0.18,
  enableBloom: true,
  bloomIntensity: 0.2,
  bloomThreshold: 0.6,
  bloomLevels: 4,
};

const HALF_FLOAT_TYPE = (gl) => gl.HALF_FLOAT;

function ensureDimension(value) {
  return Math.max(2, Math.floor(value));
}

export class FluidSimulation {
  constructor(gl, config = {}) {
    this.gl = gl;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.framebuffers = {
      velocity: null,
      density: null,
      pressure: null,
      divergence: null,
      curl: null,
      bloom: [],
    };

    this.materials = this._createMaterials(gl);

    this.simSize = { width: 0, height: 0 };
    this.canvasSize = { width: 0, height: 0 };

    this.autoTimer = 0;
    this.colorCycleTimer = 0;
    this.lastPointerColor = randomColor();

    this.resize(gl.canvas.width, gl.canvas.height);
  }

  _createMaterials(gl) {
    return {
      clear: createMaterial(gl, clearShader),
      splat: createMaterial(gl, splatShader),
      advection: createMaterial(gl, advectionShader),
      curl: createMaterial(gl, curlShader),
      vorticity: createMaterial(gl, vorticityShader),
      divergence: createMaterial(gl, divergenceShader),
      pressure: createMaterial(gl, pressureShader),
      gradient: createMaterial(gl, gradientSubtractShader),
      display: createMaterial(gl, displayShader),
      bloomPrefilter: createMaterial(gl, bloomPrefilterShader),
      bloomBlur: createMaterial(gl, bloomBlurShader),
      bloomCombine: createMaterial(gl, bloomCombineShader),
    };
  }

  dispose() {
    const { gl } = this;
    const { velocity, density, pressure, divergence, curl, bloom } = this.framebuffers;
    if (velocity) {
      deleteFBO(gl, velocity.read);
      deleteFBO(gl, velocity.write);
    }
    if (density) {
      deleteFBO(gl, density.read);
      deleteFBO(gl, density.write);
    }
    if (pressure) {
      deleteFBO(gl, pressure.read);
      deleteFBO(gl, pressure.write);
    }
    deleteFBO(gl, divergence);
    deleteFBO(gl, curl);
    bloom.forEach((level) => {
      deleteFBO(gl, level.buffer);
      deleteFBO(gl, level.temp);
    });
    this.framebuffers.bloom.length = 0;
  }

  resize(width, height) {
    const { gl, config } = this;
    this.canvasSize.width = width;
    this.canvasSize.height = height;

    const simWidth = ensureDimension(width / config.texelDownsample);
    const simHeight = ensureDimension(height / config.texelDownsample);
    const dyeWidth = simWidth;
    const dyeHeight = simHeight;

    if (this.simSize.width === simWidth && this.simSize.height === simHeight) {
      return;
    }

    this.simSize.width = simWidth;
    this.simSize.height = simHeight;

    const { velocity, density, pressure } = this.framebuffers;
    if (!velocity) {
      this.framebuffers.velocity = createDoubleFBO(
        gl,
        simWidth,
        simHeight,
        gl.RG16F,
        gl.RG,
        HALF_FLOAT_TYPE(gl),
        gl.LINEAR
      );
    } else {
      resizeFBO(gl, velocity.read, simWidth, simHeight);
      resizeFBO(gl, velocity.write, simWidth, simHeight);
    }

    if (!density) {
      this.framebuffers.density = createDoubleFBO(
        gl,
        dyeWidth,
        dyeHeight,
        gl.RGBA16F,
        gl.RGBA,
        HALF_FLOAT_TYPE(gl),
        gl.LINEAR
      );
    } else {
      resizeFBO(gl, density.read, dyeWidth, dyeHeight);
      resizeFBO(gl, density.write, dyeWidth, dyeHeight);
    }

    if (!pressure) {
      this.framebuffers.pressure = createDoubleFBO(
        gl,
        simWidth,
        simHeight,
        gl.R16F,
        gl.RED,
        HALF_FLOAT_TYPE(gl),
        gl.NEAREST
      );
    } else {
      resizeFBO(gl, pressure.read, simWidth, simHeight);
      resizeFBO(gl, pressure.write, simWidth, simHeight);
    }

    if (!this.framebuffers.divergence) {
      this.framebuffers.divergence = createFBO(
        gl,
        simWidth,
        simHeight,
        gl.R16F,
        gl.RED,
        HALF_FLOAT_TYPE(gl),
        gl.NEAREST
      );
    } else {
      resizeFBO(gl, this.framebuffers.divergence, simWidth, simHeight);
    }

    if (!this.framebuffers.curl) {
      this.framebuffers.curl = createFBO(
        gl,
        simWidth,
        simHeight,
        gl.R16F,
        gl.RED,
        HALF_FLOAT_TYPE(gl),
        gl.NEAREST
      );
    } else {
      resizeFBO(gl, this.framebuffers.curl, simWidth, simHeight);
    }

    this._setupBloomBuffers(width, width);
  }

  _setupBloomBuffers(baseWidth, baseHeight) {
    const { gl, config } = this;
    const levels = Math.max(1, config.bloomLevels);
    this.framebuffers.bloom.forEach((level) => {
      deleteFBO(gl, level.buffer);
      deleteFBO(gl, level.temp);
    });
    this.framebuffers.bloom.length = 0;

    let width = ensureDimension(baseWidth / 2);
    let height = ensureDimension(baseHeight / 2);

    for (let i = 0; i < levels; i++) {
      const buffer = createFBO(gl, width, height, gl.RGBA16F, gl.RGBA, HALF_FLOAT_TYPE(gl), gl.LINEAR);
      const temp = createFBO(gl, width, height, gl.RGBA16F, gl.RGBA, HALF_FLOAT_TYPE(gl), gl.LINEAR);
      this.framebuffers.bloom.push({ buffer, temp });
      width = ensureDimension(width / 2);
      height = ensureDimension(height / 2);
      if (width === 2 || height === 2) {
        break;
      }
    }
  }

  updateConfig(partial) {
    Object.assign(this.config, partial);
  }

  applyPointer(pointer, randomizeColor = false) {
    if (!pointer.moved || !pointer.down) {
      return;
    }
    const dx = pointer.delta.x;
    const dy = pointer.delta.y;
    if (dx === 0 && dy === 0) {
      return;
    }

    if (randomizeColor) {
      pointer.color = randomColor();
    }

    this.splat(pointer.position.x, pointer.position.y, dx, dy, pointer.color);
    pointer.moved = false;
  }

  splat(x, y, dx, dy, color) {
    const { gl, config } = this;
    const aspect = this.simSize.width / this.simSize.height;
    const velocity = this.framebuffers.velocity;
    const density = this.framebuffers.density;

    // Velocity impulse
    const velocityImpulse = [dx * config.splatForce, dy * config.splatForce, 0.0, 0.0];
    blit(gl, velocity.write, this.materials.splat, {
      uTarget: velocity.read.texture,
      uPoint: [x, y],
      uRadius: config.splatRadius,
      uValue: velocityImpulse,
      uAspectRatio: aspect,
    });
    velocity.swap();

    // Colour injection
    const colorValue = [color.r, color.g, color.b, 1.0];
    blit(gl, density.write, this.materials.splat, {
      uTarget: density.read.texture,
      uPoint: [x, y],
      uRadius: config.splatRadius,
      uValue: colorValue,
      uAspectRatio: aspect,
    });
    density.swap();
    this.lastPointerColor = color;
  }

  step(deltaTime, pointers = []) {
    const { gl, config } = this;
    if (config.paused) {
      return;
    }

    this.autoTimer += deltaTime;
    this.colorCycleTimer += deltaTime;
    let ramdomizeColor = false;
    if (config.cycleColors && this.colorCycleTimer > config.colorCycleSpeed) { 
      this.colorCycleTimer = 0;
      ramdomizeColor = true;
    } 

    pointers.forEach((pointer) => this.applyPointer(pointer, ramdomizeColor));

    const cappedDt = Math.min(deltaTime, 0.016);

    this._advectVelocity(cappedDt);
    this._applyVorticity(cappedDt);
    this._computeDivergence();
    this._solvePressure();
    this._subtractPressureGradient();
    this._advectDye(cappedDt);
  }

  render() {
    const { gl, config } = this;
    let bloomTexture = null;
    if (config.enableBloom && this.framebuffers.bloom.length > 0) {
      bloomTexture = this._runBloom();
    }

    blit(gl, null, this.materials.display, {
      uTexture: this.framebuffers.density.read.texture,
      uBloom: bloomTexture || this.framebuffers.density.read.texture,
      uEnableBloom: config.enableBloom,
      uBloomIntensity: config.bloomIntensity,
      uGamma: config.gamma,
      uExposure: config.exposure,
    });
  }

  _advectVelocity(deltaTime) {
    const { gl, config } = this;
    const { velocity } = this.framebuffers;
    blit(gl, velocity.write, this.materials.advection, {
      uVelocity: velocity.read.texture,
      uSource: velocity.read.texture,
      uTexelSize: velocity.read.texelSize,
      uDissipation: config.velocityDissipation,
      uTimeStep: deltaTime,
    });
    velocity.swap();
  }

  _advectDye(deltaTime) {
    const { gl, config } = this;
    const { density, velocity } = this.framebuffers;
    blit(gl, density.write, this.materials.advection, {
      uVelocity: velocity.read.texture,
      uSource: density.read.texture,
      uTexelSize: density.read.texelSize,
      uDissipation: config.densityDissipation,
      uTimeStep: deltaTime,
    });
    density.swap();
  }

  _applyVorticity(deltaTime) {
    const { gl, config } = this;
    const { velocity, curl } = this.framebuffers;
    blit(gl, curl, this.materials.curl, {
      uVelocity: velocity.read.texture,
      uTexelSize: velocity.read.texelSize,
    });

    blit(gl, velocity.write, this.materials.vorticity, {
      uVelocity: velocity.read.texture,
      uCurl: curl.texture,
      uTexelSize: velocity.read.texelSize,
      uCurlStrength: config.curlStrength,
      uDeltaTime: deltaTime,
    });
    velocity.swap();
  }

  _computeDivergence() {
    const { gl } = this;
    const { velocity, divergence } = this.framebuffers;
    blit(gl, divergence, this.materials.divergence, {
      uVelocity: velocity.read.texture,
      uTexelSize: velocity.read.texelSize,
    });
  }

  _solvePressure() {
    const { gl, config } = this;
    const { pressure, divergence } = this.framebuffers;

    blit(gl, pressure.write, this.materials.clear, {
      uPressure: pressure.read.texture,
      uDecay: config.pressureDecay,
    });
    pressure.swap();

    for (let i = 0; i < config.pressureIterations; i++) {
      blit(gl, pressure.write, this.materials.pressure, {
        uPressure: pressure.read.texture,
        uDivergence: divergence.texture,
        uTexelSize: pressure.read.texelSize,
      });
      pressure.swap();
    }
  }

  _subtractPressureGradient() {
    const { gl } = this;
    const { pressure, velocity } = this.framebuffers;
    blit(gl, velocity.write, this.materials.gradient, {
      uPressure: pressure.read.texture,
      uVelocity: velocity.read.texture,
      uTexelSize: velocity.read.texelSize,
    });
    velocity.swap();
  }

  _runBloom() {
    const { gl, config } = this;
    const { density, bloom } = this.framebuffers;
    if (bloom.length === 0) {
      return density.read.texture;
    }

    const first = bloom[0];
    blit(gl, first.buffer, this.materials.bloomPrefilter, {
      uTexture: density.read.texture,
      uThreshold: config.bloomThreshold,
    });

    let previous = first.buffer;
    for (let i = 1; i < bloom.length; i++) {
      const level = bloom[i];
      copyTexture(gl, level.buffer, previous.texture);
      previous = level.buffer;
    }

    for (let i = 0; i < bloom.length; i++) {
      const level = bloom[i];
      blit(gl, level.temp, this.materials.bloomBlur, {
        uTexture: level.buffer.texture,
        uDirection: [1.0, 0.0],
        uTexelSize: level.buffer.texelSize,
      });
      blit(gl, level.buffer, this.materials.bloomBlur, {
        uTexture: level.temp.texture,
        uDirection: [0.0, 1.0],
        uTexelSize: level.buffer.texelSize,
      });
    }

    let currentTexture = bloom[bloom.length - 1].buffer.texture;
    for (let i = bloom.length - 2; i >= 0; i--) {
      const level = bloom[i];
      blit(gl, level.temp, this.materials.bloomCombine, {
        uBase: level.buffer.texture,
        uBloom: currentTexture,
      });
      copyTexture(gl, level.buffer, level.temp.texture);
      currentTexture = level.buffer.texture;
    }

    return bloom[0].buffer.texture;
  }
}