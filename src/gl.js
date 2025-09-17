// WebGL2 helpers for framebuffer and fullscreen pass management.

import { createMaterial, copyShader } from "./shaders.js";

let quadVAO = null;
let blitMaterial = null;

function initFullscreenQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const vertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return vao;
}

function assignTexelSize(target) {
  target.texelSize = [1.0 / target.width, 1.0 / target.height];
}

export function createGLContext(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    powerPreference: "high-performance",
  });

  if (!gl) {
    throw new Error("WebGL2 is not supported on this device.");
  }

  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("Required extension EXT_color_buffer_float is unavailable.");
  }

  gl.getExtension("OES_texture_float_linear");
  gl.getExtension("EXT_float_blend");

  quadVAO = initFullscreenQuad(gl);
  blitMaterial = createMaterial(gl, copyShader);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return gl;
}

export function createTexture(gl, width, height, internalFormat, format, type, filtering = gl.LINEAR) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtering);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtering);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function createFBO(gl, width, height, internalFormat, format, type, filtering = gl.LINEAR) {
  const texture = createTexture(gl, width, height, internalFormat, format, type, filtering);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const target = { texture, fbo, width, height, internalFormat, format, type };
  assignTexelSize(target);
  return target;
}

export function createDoubleFBO(gl, width, height, internalFormat, format, type, filtering = gl.LINEAR) {
  const first = createFBO(gl, width, height, internalFormat, format, type, filtering);
  const second = createFBO(gl, width, height, internalFormat, format, type, filtering);
  return {
    read: first,
    write: second,
    swap() {
      const tmp = this.read;
      this.read = this.write;
      this.write = tmp;
    },
  };
}

export function resizeFBO(gl, target, width, height) {
  if (target.width === width && target.height === height) {
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, target.internalFormat, width, height, 0, target.format, target.type, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  target.width = width;
  target.height = height;
  assignTexelSize(target);
}

export function deleteFBO(gl, target) {
  if (!target) return;
  if (target.texture) gl.deleteTexture(target.texture);
  if (target.fbo) gl.deleteFramebuffer(target.fbo);
}

export function blit(gl, target, material, uniforms = {}) {
  if (!quadVAO) {
    throw new Error("Fullscreen quad not initialised.");
  }

  const framebuffer = target ? target.fbo : null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  if (target) {
    gl.viewport(0, 0, target.width, target.height);
  } else {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  material.setUniforms(uniforms);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

export function copyTexture(gl, target, sourceTexture) {
  blit(gl, target, blitMaterial, { uTexture: sourceTexture });
}