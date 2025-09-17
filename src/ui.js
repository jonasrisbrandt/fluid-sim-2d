// Input handling and runtime UI controls.

import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.17/+esm";
import {
  createPointer,
  updatePointerCoordinates,
  getNormalizedPointer,
  resizeCanvasToDisplaySize,
} from "./utils.js";

export class SimulationUI {
  constructor(canvas, simulation) {
    this.canvas = canvas;
    this.simulation = simulation;
    this.pointers = new Map();
    this.listeners = [];

    this.stats = { fps: 0 };
    this._lastFpsSample = 0;

    this.gui = new GUI({ width: 320 });
    this._buildGui();
    this._bindPointerEvents();
    this._bindResize();
  }

  _buildGui() {
    const cfg = this.simulation.config;

    const simFolder = this.gui.addFolder("Simulation");
    simFolder.add(cfg, "velocityDissipation", 0.9, 1.0, 0.001).name("Velocity Diss");
    simFolder.add(cfg, "densityDissipation", 0.9, 1.0, 0.001).name("Density Diss");
    simFolder.add(cfg, "pressureDecay", 0.9, 1.0, 0.001).name("Pressure Decay");
    simFolder
      .add(cfg, "pressureIterations", 1, 80, 1)
      .name("Pressure Iterations");
    simFolder.add(cfg, "curlStrength", 0.0, 60.0, 0.5).name("Curl Strength");
    simFolder.add(cfg, "paused").name("Paused");
    simFolder.open();

    const splatFolder = this.gui.addFolder("Splats");
    splatFolder.add(cfg, "splatRadius", 0.001, 0.05, 0.001).name("Radius");
    splatFolder.add(cfg, "splatForce", 1000.0, 15000.0, 100.0).name("Force");
    splatFolder.add(cfg, "cycleColors").name("Cycle Colours");
    splatFolder.add(cfg, "colorCycleSpeed", 0.001, 4.0, 0.001).name("Colour Cycle Invterval");
    splatFolder
      .add(cfg, "texelDownsample", 1, 8, 1)
      .name("Downsample")
      .onFinishChange(() => {
        this.simulation.resize(this.canvas.width, this.canvas.height);
      });

    const displayFolder = this.gui.addFolder("Display");
    displayFolder.add(cfg, "gamma", 1.0, 3.0, 0.01).name("Gamma");
    displayFolder.add(cfg, "exposure", 0.05, 0.6, 0.01).name("Exposure");
    displayFolder.add(cfg, "enableBloom").name("Bloom");
    displayFolder.add(cfg, "bloomIntensity", 0.05, 1.0, 0.01).name("Bloom Intensity");
    displayFolder.add(cfg, "bloomThreshold", 0.0, 1.5, 0.01).name("Bloom Threshold");
    displayFolder.add(cfg, "bloomLevels", 1, 6, 1).name("Bloom Levels");

    this.gui.add(this.stats, "fps").name("FPS").listen();

    this.gui.close();
  }

  _bindPointerEvents() {
    const canvas = this.canvas;

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      const pointer = createPointer(event.pointerId);
      const { x, y } = getNormalizedPointer(event, canvas);
      updatePointerCoordinates(pointer, x, y, true);
      pointer.down = true;
      this.pointers.set(event.pointerId, pointer);
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const { x, y } = getNormalizedPointer(event, canvas);
      updatePointerCoordinates(pointer, x, y, false);
      event.preventDefault();
    };

    const onPointerUp = (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      pointer.down = false;
      pointer.moved = false;
      this.pointers.delete(event.pointerId);
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: false });

    this.listeners.push(() => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    });
  }

  _bindResize() {
    const onResize = () => {
      if (resizeCanvasToDisplaySize(this.canvas)) {
        this.simulation.resize(this.canvas.width, this.canvas.height);
      }
    };
    window.addEventListener("resize", onResize);
    onResize();
    this.listeners.push(() => window.removeEventListener("resize", onResize));
  }

  getPointers() {
    return Array.from(this.pointers.values());
  }

  update(deltaTime, now) {
    const elapsed = now - this._lastFpsSample;
    if (elapsed > 0.1) {
      const fps = 1.0 / deltaTime;
      this.stats.fps = Math.round(fps * 10) / 10;
      this._lastFpsSample = now;
    }
  }

  dispose() {
    this.listeners.forEach((cleanup) => cleanup());
    this.gui.destroy();
    this.pointers.clear();
  }
}