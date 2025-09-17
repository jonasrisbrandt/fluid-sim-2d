# WebGL2 Fluid Simulation

A production-ready WebGL2 (EXT_color_buffer_float) port of PavelDoGreat''s fluid simulation with the same look, feel and interaction model. The app runs entirely in vanilla JavaScript and GLSL ES 3.00.

## Getting Started

1. Clone or download the project.
2. Open `public/index.html` directly in any modern WebGL2-capable browser **or** serve the project root with a basic static server:
   ```sh
   npx serve .
   ```
3. Interact with the fluid by dragging on the canvas. Multitouch is supported on touch devices.

## Controls

The built-in control panel exposes the following runtime parameters:

- `Velocity Diss`, `Density Diss`, `Pressure Decay`: dissipation factors for advection.
- `Pressure Iterations`: Jacobi iterations per frame.
- `Curl Strength`: vorticity confinement magnitude.
- `Paused`: stops the simulation while keeping the current field buffers.
- `Radius`, `Force`: controls for injected splats.
- `Auto Colour`: toggles automatic random splats.
- `Downsample`: adjusts simulation resolution (1 = full resolution).
- `Gamma`, `Exposure`: tone mapping parameters for rendering.
- `Bloom`, `Bloom Intensity`, `Bloom Threshold`, `Bloom Levels`: toggle and tune the bloom effect.
- `FPS`: live performance monitor.

## Pipeline Overview

Each frame the simulation executes the classic stable fluids stages entirely on the GPU:

1. **Splats**: user input injects velocity impulses and dye.
2. **Advection**: semi-Lagrangian backtracking of velocity and dye fields.
3. **Curl/Vorticity**: vorticity confinement adds coherent swirling.
4. **Divergence**: compute the divergence of the velocity field.
5. **Pressure Solve**: Jacobi iterations solve the Poisson equation for pressure.
6. **Projection**: subtract the pressure gradient to enforce incompressibility.
7. **Display**: tone map dye, optionally combine bloom, and render to the backbuffer.

Textures are stored as half-float colour attachments (`RGBA16F`, `RG16F`, `R16F`) with ping-pong framebuffers for mutable fields. Bloom is produced via a multi-level separable blur chain.

## Requirements

- WebGL2 with the `EXT_color_buffer_float` extension (most modern desktop and mobile browsers).
- No WebGL1 fallback is provided; unsupported devices show a descriptive error banner.

## Files

- `public/index.html` ? shell document.
- `public/style.css` ? layout and theme.
- `src/main.js` ? entry point and render loop.
- `src/gl.js` ? WebGL2 initialisation and framebuffer helpers.
- `src/sim.js` ? simulation orchestration and render passes.
- `src/shaders.js` ? GLSL source strings and program helpers.
- `src/ui.js` ? UI controls and pointer handling.
- `src/utils.js` ? math and helper utilities.