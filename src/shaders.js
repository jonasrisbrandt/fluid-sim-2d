// Shader sources and material helpers for the fluid renderer.

export const baseVertexShader = `#version 300 es
// Fullscreen clip-space quad used by all passes.
layout(location = 0) in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const copyShader = `#version 300 es
precision highp float;

uniform sampler2D uTexture;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  fragColor = texture(uTexture, vUv);
}
`;

export const clearShader = `#version 300 es
precision highp float;

// Damp existing pressure to stabilise Jacobi iterations.
uniform sampler2D uPressure;
uniform float uDecay;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  float pressure = texture(uPressure, vUv).x;
  fragColor = vec4(pressure * uDecay, 0.0, 0.0, 1.0);
}
`;

export const splatShader = `#version 300 es
precision highp float;

// Inject colour or velocity in a Gaussian footprint.
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform float uRadius;
uniform vec4 uValue;
uniform float uAspectRatio;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec2 diff = vUv - uPoint;
  diff.x *= uAspectRatio; // preserve circular splats on non-square canvases
  float dist = dot(diff, diff);
  float falloff = exp(-dist / uRadius);
  vec4 base = texture(uTarget, vUv);
  fragColor = base + uValue * falloff;
}
`;

export const advectionShader = `#version 300 es
precision highp float;

// Semi-Lagrangian advection for velocity and dye.
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDissipation;
uniform float uTimeStep;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uTimeStep * velocity * uTexelSize;
  coord = clamp(coord, vec2(0.0), vec2(1.0));
  vec4 result = texture(uSource, coord);
  fragColor = result * uDissipation;
}
`;

export const curlShader = `#version 300 es
precision highp float;

// z-component of the velocity curl.
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  float left = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float right = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float bottom = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float top = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  float curl = right - left - (top - bottom);
  fragColor = vec4(curl, 0.0, 0.0, 1.0);
}
`;

export const vorticityShader = `#version 300 es
precision highp float;

// Vorticity confinement forces to re-introduce small scale swirl.
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uCurlStrength;
uniform float uDeltaTime;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  float curlL = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
  float curlR = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float curlB = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
  float curlT = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  vec2 gradient = vec2(abs(curlT) - abs(curlB), abs(curlR) - abs(curlL));
  gradient = gradient / (length(gradient) + 1e-5);
  float curl = texture(uCurl, vUv).x;
  vec2 force = vec2(gradient.y, -gradient.x) * curl * uCurlStrength;
  vec2 velocity = texture(uVelocity, vUv).xy;
  fragColor = vec4(velocity + force * uDeltaTime, 0.0, 1.0);
}
`;

export const divergenceShader = `#version 300 es
precision highp float;

// Divergence of the velocity field (??v).
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec2 left = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).xy;
  vec2 right = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).xy;
  vec2 bottom = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).xy;
  vec2 top = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).xy;

  float divergence = 0.5 * (right.x - left.x + top.y - bottom.y);
  fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}
`;

export const pressureShader = `#version 300 es
precision highp float;

// Jacobi iteration for pressure solve.
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  float left = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float right = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float bottom = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float top = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (left + right + bottom + top - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const gradientSubtractShader = `#version 300 es
precision highp float;

// Projection step: enforce ??v ? 0 by subtracting pressure gradient.
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  float left = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float right = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float bottom = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float top = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 gradient = vec2(right - left, top - bottom) * 0.5;
  fragColor = vec4(velocity - gradient, 0.0, 1.0);
}
`;

export const displayShader = `#version 300 es
precision highp float;

// Final tone mapped presentation.
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform bool uEnableBloom;
uniform float uBloomIntensity;
uniform float uGamma;
uniform float uExposure;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

vec3 toneMap(vec3 color) {
  return vec3(1.0) - exp(-color * uExposure);
}

void main() {
  vec3 base = texture(uTexture, vUv).rgb;
  if (uEnableBloom) {
    vec3 bloom = texture(uBloom, vUv).rgb;
    base += bloom * uBloomIntensity;
  }
  vec3 toneMapped = toneMap(base);
  vec3 gammaCorrected = pow(toneMapped, vec3(1.0 / uGamma));
  fragColor = vec4(gammaCorrected, 1.0);
}
`;

export const bloomPrefilterShader = `#version 300 es
precision highp float;

// Threshold bright regions before blur.
uniform sampler2D uTexture;
uniform float uThreshold;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec3 color = texture(uTexture, vUv).rgb;
  float brightness = max(max(color.r, color.g), color.b);
  float weight = max(brightness - uThreshold, 0.0);
  fragColor = vec4(color * weight, 1.0);
}
`;

export const bloomBlurShader = `#version 300 es
precision highp float;

// Single-pass 5-tap Gaussian blur. Horizontal or vertical depending on direction.
uniform sampler2D uTexture;
uniform vec2 uDirection;
uniform vec2 uTexelSize;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec2 step = uDirection * uTexelSize;
  vec3 sum = texture(uTexture, vUv).rgb * 0.2941176;
  sum += texture(uTexture, vUv + step * 1.3333333).rgb * 0.3529411;
  sum += texture(uTexture, vUv - step * 1.3333333).rgb * 0.3529411;
  fragColor = vec4(sum, 1.0);
}
`;

export const bloomCombineShader = `#version 300 es
precision highp float;

// Combine bloom mip chain.
uniform sampler2D uBase;
uniform sampler2D uBloom;

in vec2 vUv;
layout(location = 0) out vec4 fragColor;

void main() {
  vec3 color = texture(uBase, vUv).rgb + texture(uBloom, vUv).rgb;
  fragColor = vec4(color, 1.0);
}
`;

export class Material {
  constructor(gl, vertexSource, fragmentSource) {
    this.gl = gl;
    this.program = createProgram(gl, vertexSource, fragmentSource);
    this.uniforms = this._buildUniformTable();
  }

  _buildUniformTable() {
    const gl = this.gl;
    const uniforms = new Map();
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(this.program, i);
      if (!info) continue;
      uniforms.set(info.name, {
        location: gl.getUniformLocation(this.program, info.name),
        type: info.type,
      });
    }
    return uniforms;
  }

  setUniforms(values = {}) {
    const gl = this.gl;
    gl.useProgram(this.program);
    let textureUnit = 0;
    for (const [name, value] of Object.entries(values)) {
      const uniform = this.uniforms.get(name);
      if (!uniform) continue;
      const { location, type } = uniform;
      switch (type) {
        case gl.FLOAT:
          gl.uniform1f(location, value);
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2f(location, value[0], value[1]);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3f(location, value[0], value[1], value[2]);
          break;
        case gl.FLOAT_VEC4:
          gl.uniform4f(location, value[0], value[1], value[2], value[3]);
          break;
        case gl.INT:
        case gl.BOOL:
          gl.uniform1i(location, value);
          break;
        case gl.INT_VEC2:
        case gl.BOOL_VEC2:
          gl.uniform2i(location, value[0], value[1]);
          break;
        case gl.INT_VEC3:
        case gl.BOOL_VEC3:
          gl.uniform3i(location, value[0], value[1], value[2]);
          break;
        case gl.INT_VEC4:
        case gl.BOOL_VEC4:
          gl.uniform4i(location, value[0], value[1], value[2], value[3]);
          break;
        case gl.SAMPLER_2D:
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, value);
          gl.uniform1i(location, textureUnit);
          textureUnit++;
          break;
        default:
          throw new Error(`Unsupported uniform type for ${name}`);
      }
    }
  }
}

export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Failed to compile shader: ${info}`);
  }
  return shader;
}

export function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`Failed to link program: ${info}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

export function createMaterial(gl, fragmentSource) {
  return new Material(gl, baseVertexShader, fragmentSource);
}