import type { Camera } from "./camera";
import type { World } from "../core/physics";
import type { Ghost, Goal, Node, Stage } from "../core/types";
import type { Vec2 } from "../core/vec2";
import { thrustDirection } from "../core/cell";
import { BLOCK_RADIUS } from "../game/editor";
import type { Particles } from "./particles";

export interface RenderState {
  stage: Stage;
  selectedId: number | null;
  connectRadius: number;
  time: number;
  won: boolean;
  ghost: Ghost | null;
}

const LEAF_LIGHT = "#eafbe0";
const LEAF = "#7fd992";
const LEAF_MID = "#4aa863";
const FIREFLY_HOT = "#fff2b8";
const FIREFLY_DEEP = "#e8a92e";
const PETAL = "#e6d4ff";
const PETAL_CORE = "#fff7c2";
const SUNBEAM = "#ffe9a8";
const SUNBEAM_RING = "#f7d774";
const HALO = "#a9e6b0";

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function render(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  world: World,
  goal: Goal,
  state: RenderState,
  particles: Particles,
): void {
  const { width, height } = camera;
  const scale = camera.scale * (1 + camera.kick);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camera.x, -camera.y);

  drawBackground(ctx, camera, state.time);
  drawGoal(ctx, goal, state.time);
  particles.draw(ctx);
  drawBeams(ctx, world, state.time);

  for (const node of world.nodes.values()) {
    const dir =
      node.type === "thruster" ? thrustDirection(world, node.id) : null;
    drawBlock(
      ctx,
      node.type,
      node.pos.x,
      node.pos.y,
      node.radius,
      dir,
      node.firing,
      state.stage,
      goal,
      state.time,
      node,
    );
  }

  if (state.selectedId !== null) {
    const sel = world.nodes.get(state.selectedId);
    if (sel) {
      ctx.beginPath();
      ctx.arc(sel.pos.x, sel.pos.y, state.connectRadius, 0, Math.PI * 2);
      ctx.setLineDash([6 / camera.scale, 6 / camera.scale]);
      ctx.strokeStyle = "rgba(169, 230, 176, 0.35)";
      ctx.lineWidth = 1.5 / camera.scale;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(sel.pos.x, sel.pos.y, sel.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = HALO;
      ctx.lineWidth = 2 / camera.scale;
      ctx.stroke();
    }
  }

  if (state.ghost) {
    drawGhost(ctx, camera, world, state.ghost, state.connectRadius, state.time);
  }

  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  time: number,
): void {
  const halfW = camera.width / 2 / camera.scale;
  const halfH = camera.height / 2 / camera.scale;
  const x0 = camera.x - halfW;
  const x1 = camera.x + halfW;
  const y0 = camera.y - halfH;
  const y1 = camera.y + halfH;

  const cell = 560;
  for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
    for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
      const h = hash2(gx, gy);
      const h2 = hash2(gx + 17, gy - 9);
      const cx = (gx + 0.2 + h * 0.6) * cell;
      const cy = (gy + 0.2 + h2 * 0.6) * cell;
      const r = 200 + h * 190;
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.25 + h * 6.283);
      const alpha = 0.03 + 0.035 * pulse;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, hexA(LEAF_LIGHT, alpha));
      grad.addColorStop(1, hexA(LEAF_LIGHT, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal, time: number): void {
  const { x, y } = goal.pos;
  const r = goal.radius;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.35);
  glow.addColorStop(0, hexA(SUNBEAM, 0.34));
  glow.addColorStop(0.55, hexA(SUNBEAM, 0.14));
  glow.addColorStop(1, hexA(SUNBEAM, 0));
  ctx.beginPath();
  ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    const t = (time * 0.28 + i / 3) % 1;
    const rr = r * 0.25 + t * r * 1.15;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(SUNBEAM_RING, (1 - t) * 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const pool = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
  pool.addColorStop(0, hexA(SUNBEAM, 0.5));
  pool.addColorStop(1, hexA(SUNBEAM, 0));
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = pool;
  ctx.fill();

  drawBlossom(ctx, x, y, r * 0.28, time, SUNBEAM_RING, PETAL_CORE);
}

function drawBlossom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  time: number,
  petalColor: string,
  coreColor: string,
): void {
  const petals = 5;
  const rot = time * 0.15;
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < petals; i++) {
    const a = rot + (i / petals) * Math.PI * 2;
    const px = x + Math.cos(a) * radius * 0.7;
    const py = y + Math.sin(a) * radius * 0.7;
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = petalColor;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = coreColor;
  ctx.fill();
  ctx.restore();
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  world: World,
  time: number,
): void {
  for (const beam of world.beams) {
    const a = world.nodes.get(beam.a);
    const b = world.nodes.get(beam.b);
    if (!a || !b) continue;

    const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
    const stretch = Math.abs(d - beam.rest) / beam.rest;
    const base = Math.max(0.28, Math.min(0.85, 0.68 - stretch * 0.7));
    const seed = (beam.a * 31 + beam.b * 17) % 100;
    const shimmer = 0.9 + 0.1 * Math.sin(time * 1.8 + seed);
    const alpha = base * shimmer;

    const mx = (a.pos.x + b.pos.x) / 2;
    const my = (a.pos.y + b.pos.y) / 2;
    const nx = -(b.pos.y - a.pos.y) / (d || 1);
    const ny = (b.pos.x - a.pos.x) / (d || 1);
    const bow = Math.min(7, d * 0.04) * (seed % 2 === 0 ? 1 : -1);
    const cx = mx + nx * bow;
    const cy = my + ny * bow;

    ctx.beginPath();
    ctx.moveTo(a.pos.x, a.pos.y);
    ctx.quadraticCurveTo(cx, cy, b.pos.x, b.pos.y);
    ctx.strokeStyle = `rgba(143, 211, 154, ${alpha})`;
    ctx.lineWidth = 3.6;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(a.pos.x, a.pos.y);
    ctx.quadraticCurveTo(cx, cy, b.pos.x, b.pos.y);
    ctx.strokeStyle = `rgba(230, 255, 222, ${alpha * 0.45})`;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  type: Node["type"],
  x: number,
  y: number,
  radius: number,
  dir: Vec2 | null,
  firing: number,
  stage: Stage,
  goal: Goal,
  time: number,
  node: Node | null,
): void {
  if (type === "goo") {
    drawGoo(ctx, x, y, radius, node);
    return;
  }
  if (type === "thruster") {
    drawThruster(ctx, x, y, radius, dir, firing);
    return;
  }
  drawSensor(ctx, x, y, radius, stage, goal, time);
}

function drawGoo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  node: Node | null,
): void {
  let sx = 1;
  let sy = 1;
  let angle = 0;

  if (node) {
    const vx = node.pos.x - node.prev.x;
    const vy = node.pos.y - node.prev.y;
    const speed = Math.hypot(vx, vy);
    if (speed > 0.4) {
      const amt = Math.min(0.22, speed * 0.02);
      sx = 1 + amt;
      sy = 1 - amt;
      angle = Math.atan2(vy, vx);
    }
  }

  ctx.save();
  ctx.translate(x, y);
  if (angle !== 0) ctx.rotate(angle);
  ctx.scale(sx, sy);

  ctx.shadowColor = "rgba(120, 230, 160, 0.45)";
  ctx.shadowBlur = 14;

  const grad = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.35,
    radius * 0.1,
    0,
    0,
    radius,
  );
  grad.addColorStop(0, LEAF_LIGHT);
  grad.addColorStop(0.55, LEAF);
  grad.addColorStop(1, LEAF_MID);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(26, 74, 46, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-radius * 0.3, -radius * 0.32, radius * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fill();

  ctx.restore();
}

function drawThruster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  dir: Vec2 | null,
  firing: number,
): void {
  const active = firing > 0.01;
  if (!dir) {
    drawSeed(ctx, x, y, radius, 0, active);
    return;
  }

  const angle = Math.atan2(dir.y, dir.x);

  if (active) {
    const len = 14 + firing * 34;
    const bx = x - Math.cos(angle) * (radius + len);
    const by = y - Math.sin(angle) * (radius + len);
    const grad = ctx.createLinearGradient(x, y, bx, by);
    grad.addColorStop(0, `rgba(255, 236, 160, ${0.5 + firing * 0.4})`);
    grad.addColorStop(1, "rgba(255, 200, 90, 0)");
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * radius, y - Math.sin(angle) * radius);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4 + firing * 7;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawSeed(ctx, x, y, radius, angle, active);
}

function drawSeed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
  active: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.shadowColor = "rgba(255, 210, 110, 0.7)";
  ctx.shadowBlur = active ? 18 : 10;

  const grad = ctx.createRadialGradient(
    -radius * 0.3,
    -radius * 0.3,
    radius * 0.15,
    0,
    0,
    radius * 1.1,
  );
  grad.addColorStop(0, active ? FIREFLY_HOT : "#ffe9a8");
  grad.addColorStop(1, FIREFLY_DEEP);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.15, radius * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(120, 80, 20, 0.4)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-radius * 0.28, -radius * 0.3, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fill();

  ctx.restore();
}

function drawSensor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stage: Stage,
  goal: Goal,
  time: number,
): void {
  if (stage === "sim") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(goal.pos.x, goal.pos.y);
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = "rgba(255, 240, 190, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawBlossom(ctx, x, y, radius, time, PETAL, PETAL_CORE);
}

function ghostDirection(world: World, ghost: Ghost): Vec2 | null {
  let x = 0;
  let y = 0;
  let count = 0;

  for (const id of ghost.neighbours) {
    const other = world.nodes.get(id);
    if (!other) continue;
    const dx = other.pos.x - ghost.pos.x;
    const dy = other.pos.y - ghost.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    x += dx / len;
    y += dy / len;
    count++;
  }

  if (count === 0) return null;
  const len = Math.hypot(x, y);
  if (len < 1e-6) return null;
  return { x: x / len, y: y / len };
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  world: World,
  ghost: Ghost,
  connectRadius: number,
  time: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.85;

  for (const id of ghost.neighbours) {
    const other = world.nodes.get(id);
    if (!other) continue;
    ctx.beginPath();
    ctx.moveTo(ghost.pos.x, ghost.pos.y);
    ctx.lineTo(other.pos.x, other.pos.y);
    ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
    ctx.strokeStyle = "rgba(169, 230, 176, 0.8)";
    ctx.lineWidth = 2.5 / camera.scale;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.arc(ghost.pos.x, ghost.pos.y, connectRadius, 0, Math.PI * 2);
  ctx.setLineDash([4 / camera.scale, 7 / camera.scale]);
  ctx.strokeStyle = "rgba(169, 230, 176, 0.3)";
  ctx.lineWidth = 1.2 / camera.scale;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.55;
  const radius = BLOCK_RADIUS[ghost.type];
  const dir = ghost.type === "thruster" ? ghostDirection(world, ghost) : null;
  drawBlock(
    ctx,
    ghost.type,
    ghost.pos.x,
    ghost.pos.y,
    radius,
    dir,
    0,
    "editor",
    { pos: ghost.pos, radius: 0 },
    time,
    null,
  );

  ctx.restore();
}
