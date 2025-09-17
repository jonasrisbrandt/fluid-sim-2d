// Utility helpers shared across the simulation and UI modules.

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0.0, 1.0);
}

export function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6.0);
  const f = h * 6.0 - i;
  const p = v * (1.0 - s);
  const q = v * (1.0 - f * s);
  const t = v * (1.0 - (1.0 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    case 5: return [v, p, q];
    default: return [v, t, p];
  }
}

export function randomColor() {
  const h = Math.random();
  const s = 0.6 + Math.random() * 0.4;
  const v = 0.5 + Math.random() * 0.5;
  const [r, g, b] = hsvToRgb(h, s, v);
  return { r, g, b };
}

export function createPointer(id) {
  return {
    id,
    down: false,
    moved: false,
    position: { x: 0, y: 0 },
    previous: { x: 0, y: 0 },
    delta: { x: 0, y: 0 },
    color: randomColor(),
  };
}

export function updatePointerCoordinates(pointer, x, y, mouseDown) {
  pointer.previous.x = pointer.position.x;
  pointer.previous.y = pointer.position.y;
  pointer.position.x = x;
  pointer.position.y = y;
  pointer.delta.x = pointer.position.x - pointer.previous.x;
  pointer.delta.y = pointer.position.y - pointer.previous.y;
  pointer.moved = !mouseDown;
}

export function resizeCanvasToDisplaySize(canvas, multiplier = window.devicePixelRatio || 1) {
  const width = Math.floor(canvas.clientWidth * multiplier);
  const height = Math.floor(canvas.clientHeight * multiplier);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

export function getNormalizedPointer(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / rect.width, 0.0, 1.0);
  const y = clamp(1.0 - (event.clientY - rect.top) / rect.height, 0.0, 1.0);
  return { x, y };
}