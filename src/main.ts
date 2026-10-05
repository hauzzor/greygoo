import "./style.css";
import { World } from "./core/physics";
import { autoConnect, previewConnections } from "./core/cell";
import type { BlockType, Ghost, Stage, Tool } from "./core/types";
import { Camera } from "./render/camera";
import { Particles } from "./render/particles";
import { render } from "./render/renderer";
import { createGoal } from "./game/level";
import { BLOCK_RADIUS, placeBlock } from "./game/editor";
import { applyGuidance, checkWin } from "./game/simulation";
import {
  emitLaunchPoof,
  emitPlacementPop,
  emitThrusterExhaust,
  emitWinBurst,
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

let stage: Stage = "editor";
let tool: Tool = "goo";
let selectedId: number | null = null;
let won = false;

let panning = false;
const panStart = { sx: 0, sy: 0, cx: 0, cy: 0 };
let dragNodeId: number | null = null;
let ghost: Ghost | null = null;
let editorSnapshot = new Map<number, { x: number; y: number }>();

const hud = createHud({
  onTool: (t) => setTool(t),
  onLaunch: () => launch(),
  onReset: () => resetToEditor(),
  onClear: () => {
    world.clear();
    particles.clear();
    selectedId = null;
    ghost = null;
    editorSnapshot.clear();
    won = false;
    hud.banner(null);
  },
});

function setTool(t: Tool): void {
  tool = t;
  hud.setToolActive(t);
}

function launch(): void {
  if (stage === "sim" || world.nodes.size === 0) return;
  ghost = null;
  particles.clear();
  const c = world.centroid();
  emitLaunchPoof(particles, c.x, c.y);
  editorSnapshot = new Map();
  for (const node of world.nodes.values()) {
    editorSnapshot.set(node.id, { x: node.pos.x, y: node.pos.y });
  }
  stage = "sim";
  won = false;
  hud.setStage("sim");
}

function resetToEditor(): void {
  ghost = null;
  particles.clear();
  for (const node of world.nodes.values()) {
    const saved = editorSnapshot.get(node.id);
    if (saved) {
      node.pos.x = saved.x;
      node.pos.y = saved.y;
      node.prev.x = saved.x;
      node.prev.y = saved.y;
    }
    node.accel.x = 0;
    node.accel.y = 0;
    node.firing = 0;
  }
  const c = world.centroid();
  camera.x = c.x;
  camera.y = c.y;
  stage = "editor";
  won = false;
  hud.setStage("editor");
  hud.banner(null);
}

function startNewGame(): void {
  world.clear();
  particles.clear();
  selectedId = null;
  ghost = null;
  editorSnapshot.clear();
  won = false;
  stage = "editor";
  hud.setStage("editor");
  hud.banner(null);

  const sensor = world.addNode("sensor", { x: 0, y: 0 }, BLOCK_RADIUS.sensor);
  selectedId = sensor.id;
  camera.x = 0;
  camera.y = 0;
  camera.scale = 1;
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
  if (stage === "editor") {
    dragNodeId = id;
    const n = world.nodes.get(id);
    if (n) n.invMass = 0;
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
    selectAndDrag(hit);
    return;
  }

  if (stage !== "editor") {
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
    dragNodeId = null;
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
  if (e.code === "Space") {
    e.preventDefault();
    if (stage === "editor") launch();
    else resetToEditor();
    return;
  }
  if (e.key === "1") setTool("goo");
  else if (e.key === "2") setTool("thruster");
  else if (e.key === "3") setTool("sensor");
  else if (e.key === "4") setTool("pan");
  else if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedId !== null) {
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
  camera.decayKick(dt);

  if (stage === "editor") {
    world.params.damping = 0.99;
  } else {
    world.params.damping = Math.exp(-p.drag * dt);
    applyGuidance(world, goal, p.power);
  }

  world.step(dt);

  updateAmbientLife(particles, camera, dt);

  if (stage === "sim") {
    emitThrusterExhaust(world, particles, dt);

    if (!won && checkWin(world, goal)) {
      won = true;
      hud.banner("GOAL REACHED");
      emitWinBurst(particles, goal);
      camera.punch(0.08);
    }
    if (!won) camera.follow(world.centroid(), 0.04);
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
      stage,
      selectedId,
      connectRadius: hud.params().connectRadius,
      time: performance.now() / 1000,
      won,
      ghost,
    },
    particles,
  );

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
