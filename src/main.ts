import "./style.css";
import { World } from "./core/physics";
import {
  CONNECT_MAX,
  autoConnect,
  captureThrustDirection,
  previewConnections,
  removeCrossingBeams,
  syncThrustDirections,
} from "./core/cell";
import {
  clearCrawlers,
  installCrawlHooks,
  isCrawling,
  releaseCrawler,
  updateCrawlers,
} from "./game/crawl";
import { clearSignals, updateSignals } from "./game/signals";
import type { Tool, WorldSnapshot } from "./core/types";
import { Camera } from "./render/camera";
import { Particles } from "./render/particles";
import { render } from "./render/renderer";
import { createGoal } from "./game/level";
import { scatterBlocks } from "./game/editor";
import { applyGuidance } from "./game/simulation";
import {
  emitPlacementPop,
  emitRunPoof,
  emitThrusterExhaust,
  updateAmbientLife,
} from "./game/effects";
import { createHud } from "./ui/hud";
import { createContextMenu, type MenuModel } from "./ui/contextMenu";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D not supported");
const ctx: CanvasRenderingContext2D = context;

const world = new World();
const camera = new Camera();
const particles = new Particles();
const goal = createGoal();
installCrawlHooks(world);
world.onTopologyChange = (ids) => {
  for (const id of ids) captureThrustDirection(world, id);
};

let tool: Tool = "select";
let selectedId: number | null = null;
let running = false;

let panning = false;
const panStart = { sx: 0, sy: 0, cx: 0, cy: 0 };
let dragNodeId: number | null = null;
let dragStart: WorldSnapshot | null = null;
let dragMoved = false;
let dragDetached = false;

const history: WorldSnapshot[] = [];

let cameraLocked = false;
let selectedCameraId: number | null = null;

const contextMenu = createContextMenu();
let menuNodeId: number | null = null;
let suppressMenuReopen = false;

const hud = createHud({
  onTool: (t) => setTool(t),
  onToggleRun: () => toggleRun(),
  onToggleCamera: () => toggleCamera(),
  onSelectCamera: (id) => {
    selectedCameraId = id;
  },
  onUndo: () => undo(),
  onClear: () => clearAll(),
});

function buildBlockMenu(id: number): MenuModel | null {
  const n = world.nodes.get(id);
  if (!n) return null;
  if (n.type === "sensor") {
    return {
      title: `Sensor #${n.id}`,
      actions: [
        {
          label: n.emitting ? "Emission: On" : "Emission: Off",
          on: n.emitting,
          onSelect: () => {
            const sensor = world.nodes.get(id);
            if (sensor) sensor.emitting = !sensor.emitting;
          },
        },
      ],
    };
  }
  return null;
}

function openBlockMenu(id: number): void {
  const n = world.nodes.get(id);
  if (!n) return;
  const model = buildBlockMenu(id);
  if (!model) return;
  menuNodeId = id;
  const s = camera.toScreen(n.pos.x, n.pos.y);
  contextMenu.open(s.x, s.y, n.radius * camera.scale, () =>
    buildBlockMenu(id),
  );
}

function closeBlockMenu(): void {
  contextMenu.close();
  menuNodeId = null;
}

window.addEventListener(
  "pointerdown",
  (e) => {
    suppressMenuReopen = false;
    if (menuNodeId === null) return;
    if (contextMenu.contains(e.target)) return;
    const anchor = menuNodeId;
    closeBlockMenu();
    if (e.button === 0 && e.target === canvas) {
      const w = camera.toWorld(e.clientX, e.clientY);
      if (pickNode(w.x, w.y) === anchor) suppressMenuReopen = true;
    }
  },
  true,
);

function setTool(t: Tool): void {
  tool = t;
  document.body.dataset.tool = t;
  hud.setToolActive(t);
}

function pushHistory(): void {
  history.push(world.snapshot());
}

function undo(): void {
  const snap = history.pop();
  if (!snap) return;
  clearCrawlers();
  clearSignals();
  world.restore(snap);
  syncThrustDirections(world);
  selectedId = null;
  dragNodeId = null;
  closeBlockMenu();
  hud.banner(null);
}

function resetScatter(): void {
  clearCrawlers();
  clearSignals();
  world.clear();
  particles.clear();
  scatterBlocks(world);
  syncThrustDirections(world);
  selectedId = null;
  dragNodeId = null;
  dragStart = null;
  dragMoved = false;
  dragDetached = false;
  closeBlockMenu();
}

function clearAll(): void {
  pushHistory();
  resetScatter();
  if (running) {
    running = false;
    hud.setRunning(false);
  }
  hud.banner(null);
}

function toggleRun(): void {
  running = !running;
  hud.setRunning(running);
  if (running) {
    const c = world.centroid();
    emitRunPoof(particles, c.x, c.y);
  } else {
    for (const node of world.nodes.values()) {
      node.firing = 0;
      node.signalTimer = 0;
    }
    clearSignals();
  }
  hud.banner(null);
}

function firstCameraId(): number | null {
  for (const node of world.nodes.values()) {
    if (node.type === "camera") return node.id;
  }
  return null;
}

function toggleCamera(): void {
  if (selectedCameraId === null || !world.nodes.has(selectedCameraId)) {
    const first = firstCameraId();
    if (first === null) {
      cameraLocked = false;
      hud.setCameraLock(false);
      return;
    }
    selectedCameraId = first;
  }
  cameraLocked = !cameraLocked;
  hud.setCameraLock(cameraLocked);
}

function syncCameraOptions(): void {
  const options: { id: number; label: string }[] = [];
  for (const node of world.nodes.values()) {
    if (node.type === "camera") {
      options.push({ id: node.id, label: `Camera #${node.id}` });
    }
  }
  if (
    selectedCameraId !== null &&
    !options.some((o) => o.id === selectedCameraId)
  ) {
    selectedCameraId = options.length > 0 ? options[0].id : null;
  }
  if (selectedCameraId === null && options.length > 0) {
    selectedCameraId = options[0].id;
  }
  if (cameraLocked && selectedCameraId === null) {
    cameraLocked = false;
    hud.setCameraLock(false);
  }
  hud.setCameraOptions(options, selectedCameraId);
}

function startNewGame(): void {
  history.length = 0;
  resetScatter();
  running = false;
  cameraLocked = false;
  selectedCameraId = null;
  closeBlockMenu();
  hud.setRunning(false);
  hud.setCameraLock(false);
  hud.banner(null);

  camera.x = 0;
  camera.y = 0;
  camera.scale = 1;
  setTool("select");
}

function pickNode(wx: number, wy: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const n of world.nodes.values()) {
    const d = Math.hypot(n.pos.x - wx, n.pos.y - wy);
    if (d <= n.radius + 8 && d < bestD) {
      best = n.id;
      bestD = d;
    }
  }
  return best;
}

function startPan(sx: number, sy: number): void {
  panning = true;
  panStart.sx = sx;
  panStart.sy = sy;
  panStart.cx = camera.x;
  panStart.cy = camera.y;
}

function selectAndDrag(id: number): void {
  selectedId = id;
  dragNodeId = id;
  dragStart = world.snapshot();
  dragMoved = false;
  dragDetached = false;
  if (isCrawling(id)) releaseCrawler(world, id);
  const n = world.nodes.get(id);
  if (n) {
    n.invMass = 0;
    n.ghost = true;
  }
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const sx = e.clientX;
  const sy = e.clientY;

  if (e.button === 1 || e.button === 2) {
    startPan(sx, sy);
    return;
  }
  if (e.button !== 0) return;

  if (tool === "pan") {
    startPan(sx, sy);
    return;
  }

  const w = camera.toWorld(sx, sy);
  const hit = pickNode(w.x, w.y);

  if (hit !== null) {
    if (tool === "delete") {
      pushHistory();
      if (menuNodeId === hit) closeBlockMenu();
      world.removeNode(hit);
      if (selectedId === hit) selectedId = null;
      return;
    }
    selectAndDrag(hit);
    return;
  }

  selectedId = null;
});

canvas.addEventListener("pointermove", (e) => {
  const sx = e.clientX;
  const sy = e.clientY;

  if (panning) {
    camera.x = panStart.cx - (sx - panStart.sx) / camera.scale;
    camera.y = panStart.cy - (sy - panStart.sy) / camera.scale;
    return;
  }

  if (dragNodeId !== null) {
    const n = world.nodes.get(dragNodeId);
    if (n) {
      const w = camera.toWorld(sx, sy);
      if (!dragMoved && Math.hypot(w.x - n.pos.x, w.y - n.pos.y) > 2) {
        dragMoved = true;
        if (!dragDetached && world.degree(dragNodeId) > 0) {
          world.detachNode(dragNodeId);
          dragDetached = true;
        }
      }
      n.pos.x = w.x;
      n.pos.y = w.y;
      n.prev.x = w.x;
      n.prev.y = w.y;
    }
  }
});

function endPointer(e: PointerEvent): void {
  if (panning) {
    panning = false;
    return;
  }
  if (dragNodeId !== null) {
    const id = dragNodeId;
    const n = world.nodes.get(id);
    if (n) {
      n.invMass = 1;
      n.ghost = false;
      const added = autoConnect(world, id);
      removeCrossingBeams(world, added);
      n.prev.x = n.pos.x;
      n.prev.y = n.pos.y;
      if (world.degree(id) > 0) {
        emitPlacementPop(particles, n.pos.x, n.pos.y);
      }
    }
    if (dragMoved && dragStart) history.push(dragStart);
    const clicked = !dragMoved && e.type === "pointerup";
    dragNodeId = null;
    dragStart = null;
    dragMoved = false;
    dragDetached = false;
    if (clicked && !suppressMenuReopen) openBlockMenu(id);
  }
  suppressMenuReopen = false;
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    camera.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0012));
  },
  { passive: false },
);

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    undo();
    return;
  }
  if (e.code === "Space") {
    e.preventDefault();
    toggleRun();
    return;
  }
  if (e.key === "1") setTool("select");
  else if (e.key === "2") setTool("pan");
  else if (e.key === "3") setTool("delete");
  else if (e.key === "c" || e.key === "C") toggleCamera();
  else if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedId !== null) {
      pushHistory();
      if (menuNodeId === selectedId) closeBlockMenu();
      world.removeNode(selectedId);
      selectedId = null;
    }
  } else if (e.key === "Escape") {
    selectedId = null;
    closeBlockMenu();
  }
});

const MAX_PIXELS = 2_500_000;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  camera.width = window.innerWidth;
  camera.height = window.innerHeight;
  const budget = Math.sqrt(MAX_PIXELS / (camera.width * camera.height));
  const scale = Math.min(dpr, Math.max(0.7, budget));
  canvas.width = Math.floor(camera.width * scale);
  canvas.height = Math.floor(camera.height * scale);
  canvas.style.width = `${camera.width}px`;
  canvas.style.height = `${camera.height}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const DT = 1 / 60;
let last = performance.now();
let accumulator = 0;
let fpsSmooth = 60;
let upsSmooth = 60;
let msSmooth = 16.7;
let lastPerf = 0;

function update(dt: number): void {
  const p = hud.params();
  world.params.stiffness = p.stiffness;
  world.params.damping = Math.exp(-p.drag * dt);
  camera.decayKick(dt);

  if (running) {
    updateSignals(world, goal, dt);
    applyGuidance(world, p.power, dt);
  }

  world.step(dt);
  updateCrawlers(world, dt);

  if (running) emitThrusterExhaust(world, particles, dt);

  updateAmbientLife(particles, camera, dt);

  if (cameraLocked && selectedCameraId !== null) {
    const locked = world.nodes.get(selectedCameraId);
    if (locked) camera.follow(locked.pos, 0.2);
  }

  particles.update(dt);
}

function draw(): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  let heldNeighbours: number[] = [];
  if (dragNodeId !== null) {
    const held = world.nodes.get(dragNodeId);
    if (held) {
      heldNeighbours = previewConnections(world, held.pos);
    }
  }

  render(
    ctx,
    camera,
    world,
    goal,
    {
      running,
      selectedId,
      connectRadius: CONNECT_MAX,
      time: performance.now() / 1000,
      cameraLocked,
      selectedCameraId,
      heldId: dragNodeId,
      heldNeighbours,
    },
    particles,
  );

  syncCameraOptions();

  if (menuNodeId !== null) {
    const n = world.nodes.get(menuNodeId);
    if (n) {
      const s = camera.toScreen(n.pos.x, n.pos.y);
      contextMenu.anchor(s.x, s.y, n.radius * camera.scale);
    } else {
      closeBlockMenu();
    }
  }

  const c = world.centroid();
  const distance =
    world.nodes.size > 0 ? Math.hypot(goal.pos.x - c.x, goal.pos.y - c.y) : null;
  let loose = 0;
  for (const n of world.nodes.values()) {
    if (world.degree(n.id) === 0) loose++;
  }
  hud.setStats(world.nodes.size, world.beams.length, distance, loose);

  const now = performance.now();
  if (now - lastPerf > 150) {
    lastPerf = now;
    hud.setPerf(fpsSmooth, upsSmooth, msSmooth);
  }
}

function frame(now: number): void {
  const raw = (now - last) / 1000;
  const elapsed = Math.min(0.05, raw);
  last = now;

  if (raw > 0) {
    fpsSmooth += (1 / raw - fpsSmooth) * 0.1;
    msSmooth += (raw * 1000 - msSmooth) * 0.1;
  }

  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= DT && steps < 5) {
    update(DT);
    accumulator -= DT;
    steps++;
  }

  if (raw > 0) upsSmooth += (steps / raw - upsSmooth) * 0.1;

  draw();
  requestAnimationFrame(frame);
}

startNewGame();
requestAnimationFrame(frame);
