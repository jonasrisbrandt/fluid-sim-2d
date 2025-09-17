// Entry point hooking up the simulation, UI and render loop.

import { createGLContext } from "./gl.js";
import { FluidSimulation } from "./sim.js";
import { SimulationUI } from "./ui.js";
import { resizeCanvasToDisplaySize } from "./utils.js";

const canvas = document.getElementById("fluid-canvas");
const errorBanner = document.getElementById("support-error");

let gl = null;
let simulation = null;
let ui = null;

try {
  gl = createGLContext(canvas);
  resizeCanvasToDisplaySize(canvas);
  simulation = new FluidSimulation(gl);
  ui = new SimulationUI(canvas, simulation);
} catch (error) {
  console.error(error);
  if (errorBanner) {
    errorBanner.textContent = error instanceof Error ? error.message : String(error);
    errorBanner.classList.remove("hidden");
  }
  throw error;
}

let lastTime = performance.now();

function frame(now) {
  const delta = Math.max((now - lastTime) * 0.001, 0.00001);
  lastTime = now;

  simulation.step(delta, ui.getPointers());
  simulation.render();
  ui.update(delta, now * 0.001);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  ui?.dispose();
});