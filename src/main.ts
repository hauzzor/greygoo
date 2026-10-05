import "./style.css";
import { World } from "./core/physics";
import { autoConnect, previewConnections } from "./core/cell";
import type { BlockType, Ghost, Tool, WorldSnapshot } from "./core/types";
import { Camera } from "./render/camera";
import { Particles } from "./render/particles";
import { render } from "./render/renderer";
import { createGoal } from "./game/level";
import { BLOCK_RADIUS, placeBlock } from "./game/editor";
import { applyGuidance } from "./game/simulation";
import {
  emitPlacementPop,
  emitRunPoof,
  emitThrusterExhaust,
  updateAmbientLife,
} from "./game/effects";
import { createHud } from "./ui/hud";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D not supported");
const ctx: CanvasRenderingContext2D = context;

const world = new World();
const camera = new Camera();
const particles = new Particles();
const goal = createGoal();

let tool: Tool = "goo";
let selectedId: number | null = null;
let running = false;

let panning = false;
const panStart = { sx: 0, sy: 0, cx: 0, cy: 0 };
let dragNodeId: number | null = null;
let dragStart: WorldSnapshot | null = null;
let dragMoved = false;
let ghost: Ghost | null = null;

const history: WorldSnapshot[] = [];

let cameraLocked = false;
let selectedCameraId: number | null = null;

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

function setTool(t: Tool): void {
  tool = t;
  if (ghost) ghost = null;
  document.body.dataset.tool = t;
  hud.setToolActive(t);
}

function pushHistory(): void {
  history.push(world.snapshot());
}

function undo(): void {
  const snap = history.pop();
  if (!snap) return;
  world.restore(snap);
  selectedId = null;
  ghost = null;
  hud.banner(null);
}

function clearAll(): void {
  pushHistory();
  world.clear();
  particles.clear();
  selectedId = null;
  ghost = null;
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
    for (const node of world.nodes.values()) node.firing = 0;
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
  world.clear();
  particles.clear();
  history.length = 0;
  selectedId = null;
  ghost = null;
  dragNodeId = null;
  dragStart = null;
  dragMoved = false;
  running = false;
  cameraLocked = false;
  selectedCameraId = null;
  hud.setRunning(false);
  hud.setCameraLock(false);
  hud.banner(null);

  const sensor = world.addNode("sensor", { x: 0, y: 0 }, BLOCK_RADIUS.sensor);
  selectedId = sensor.id;
  camera.x = 0;
  camera.y = 0;
  camera.scale = 1;
  setTool("goo");
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
  const n = world.nodes.get(id);
  if (n) n.invMass = 0;
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
      world.removeNode(hit);
      if (selectedId === hit) selectedId = null;
      return;
    }
    selectAndDrag(hit);
    return;
  }

  if (tool === "delete" || tool === "select") {
    selectedId = null;
    return;
  }

  const block = tool as BlockType;
  ghost = {
    type: block,
    pos: { x: w.x, y: w.y },
    neighbours: previewConnections(world, w, hud.params().connectRadius),
  };
});

canvas.addEventListener("pointermove", (e) => {
  const sx = e.clientX;
  const sy = e.clientY;

  if (panning) {
    camera.x = panStart.cx - (sx - panStart.sx) / camera.scale;
    camera.y = panStart.cy - (sy - panStart.sy) / camera.scale;
    return;
  }

  if (ghost) {
    const w = camera.toWorld(sx, sy);
    ghost.pos.x = w.x;
    ghost.pos.y = w.y;
    ghost.neighbours = previewConnections(world, w, hud.params().connectRadius);
    return;
  }

  if (dragNodeId !== null) {
    const n = world.nodes.get(dragNodeId);
    if (n) {
      const w = camera.toWorld(sx, sy);
      if (Math.hypot(w.x - n.pos.x, w.y - n.pos.y) > 0.5) dragMoved = true;
      n.pos.x = w.x;
      n.pos.y = w.y;
      n.prev.x = w.x;
      n.prev.y = w.y;
    }
  }
});

function endPointer(): void {
  if (panning) {
    panning = false;
    return;
  }
  if (ghost) {
    const g = ghost;
    ghost = null;
    pushHistory();
    const node = placeBlock(world, g.type, g.pos);
    autoConnect(world, node.id, hud.params().connectRadius);
    emitPlacementPop(particles, node.pos.x, node.pos.y);
    selectedId = node.id;
    return;
  }
  if (dragNodeId !== null) {
    const id = dragNodeId;
    const n = world.nodes.get(id);
    if (n) n.invMass = 1;
    autoConnect(world, id, hud.params().connectRadius);
    if (dragMoved && dragStart) history.push(dragStart);
    dragNodeId = null;
    dragStart = null;
    dragMoved = false;
  }
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
  if (e.key === "1") setTool("goo");
  else if (e.key === "2") setTool("thruster");
  else if (e.key === "3") setTool("sensor");
  else if (e.key === "4") setTool("camera");
  else if (e.key === "5") setTool("pan");
  else if (e.key === "6") setTool("select");
  else if (e.key === "7") setTool("delete");
  else if (e.key === "c" || e.key === "C") toggleCamera();
  else if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedId !== null) {
      pushHistory();
      world.removeNode(selectedId);
      selectedId = null;
    }
  } else if (e.key === "Escape") {
    if (ghost) ghost = null;
    else selectedId = null;
  }
});

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  camera.width = window.innerWidth;
  camera.height = window.innerHeight;
  canvas.width = Math.floor(camera.width * dpr);
  canvas.height = Math.floor(camera.height * dpr);
  canvas.style.width = `${camera.width}px`;
  canvas.style.height = `${camera.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const DT = 1 / 60;
let last = performance.now();
let accumulator = 0;

function update(dt: number): void {
  const p = hud.params();
  world.params.stiffness = p.stiffness;
  world.params.damping = Math.exp(-p.drag * dt);
  camera.decayKick(dt);

  if (running) applyGuidance(world, goal, p.power);

  world.step(dt);

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

  render(
    ctx,
    camera,
    world,
    goal,
    {
      running,
      selectedId,
      connectRadius: hud.params().connectRadius,
      time: performance.now() / 1000,
      cameraLocked,
      selectedCameraId,
      ghost,
    },
    particles,
  );

  syncCameraOptions();

  const c = world.centroid();
  const distance =
    world.nodes.size > 0 ? Math.hypot(goal.pos.x - c.x, goal.pos.y - c.y) : null;
  hud.setStats(world.nodes.size, world.beams.length, distance);
}

function frame(now: number): void {
  const elapsed = Math.min(0.05, (now - last) / 1000);
  last = now;
  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= DT && steps < 5) {
    update(DT);
    accumulator -= DT;
    steps++;
  }

  draw();
  requestAnimationFrame(frame);
}

startNewGame();
requestAnimationFrame(frame);
