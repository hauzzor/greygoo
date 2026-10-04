import type { Camera } from "./camera";
import type { World } from "../core/physics";
import type { Ghost, Goal, Node, Stage } from "../core/types";
import type { Vec2 } from "../core/vec2";
import { thrustDirection } from "../core/cell";
import { BLOCK_RADIUS } from "../game/editor";

export interface RenderState {
  stage: Stage;
  selectedId: number | null;
  connectRadius: number;
  time: number;
  won: boolean;
  ghost: Ghost | null;
}

const GOO = "#58d68d";
const GOO_DARK = "#1f6b45";
const THRUST = "#f5a623";
const SENSOR = "#4dd0e1";
const GOAL = "#ff5c8a";

export function render(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  world: World,
  goal: Goal,
  state: RenderState,
): void {
  const { width, height } = camera;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);

  drawGrid(ctx, camera);
  drawGoal(ctx, goal, state.time);
  drawBeams(ctx, world);

  for (const node of world.nodes.values()) {
    const dir = node.type === "thruster" ? thrustDirection(world, node.id) : null;
    drawBlock(ctx, node.type, node.pos.x, node.pos.y, node.radius, dir, node.firing, state.stage, goal);
  }

  if (state.selectedId !== null) {
    const sel = world.nodes.get(state.selectedId);
    if (sel) {
      ctx.beginPath();
      ctx.arc(sel.pos.x, sel.pos.y, state.connectRadius, 0, Math.PI * 2);
      ctx.setLineDash([6 / camera.scale, 6 / camera.scale]);
      ctx.strokeStyle = "rgba(89, 237, 199, 0.35)";
      ctx.lineWidth = 1.5 / camera.scale;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(sel.pos.x, sel.pos.y, sel.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#59edc7";
      ctx.lineWidth = 2 / camera.scale;
      ctx.stroke();
    }
  }

  if (state.ghost) {
    drawGhost(ctx, camera, world, state.ghost, state.connectRadius);
  }

  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const halfW = camera.width / 2 / camera.scale;
  const halfH = camera.height / 2 / camera.scale;
  const x0 = camera.x - halfW;
  const x1 = camera.x + halfW;
  const y0 = camera.y - halfH;
  const y1 = camera.y + halfH;

  const step = 50;
  ctx.beginPath();
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.strokeStyle = "rgba(120, 140, 180, 0.08)";
  ctx.lineWidth = 1 / camera.scale;
  ctx.stroke();
}

function drawGoal(ctx: CanvasRenderingContext2D, goal: Goal, time: number): void {
  const pulse = 1 + Math.sin(time * 2) * 0.06;
  const grad = ctx.createRadialGradient(
    goal.pos.x,
    goal.pos.y,
    0,
    goal.pos.x,
    goal.pos.y,
    goal.radius,
  );
  grad.addColorStop(0, "rgba(255, 92, 138, 0.28)");
  grad.addColorStop(1, "rgba(255, 92, 138, 0)");

  ctx.beginPath();
  ctx.arc(goal.pos.x, goal.pos.y, goal.radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(goal.pos.x, goal.pos.y, goal.radius * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = GOAL;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(goal.pos.x - 10, goal.pos.y);
  ctx.lineTo(goal.pos.x + 10, goal.pos.y);
  ctx.moveTo(goal.pos.x, goal.pos.y - 10);
  ctx.lineTo(goal.pos.x, goal.pos.y + 10);
  ctx.strokeStyle = "rgba(255, 92, 138, 0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawBeams(ctx: CanvasRenderingContext2D, world: World): void {
  for (const beam of world.beams) {
    const a = world.nodes.get(beam.a);
    const b = world.nodes.get(beam.b);
    if (!a || !b) continue;

    const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
    const stretch = Math.abs(d - beam.rest) / beam.rest;
    const alpha = Math.max(0.25, Math.min(0.9, 0.7 - stretch * 0.8));

    ctx.beginPath();
    ctx.moveTo(a.pos.x, a.pos.y);
    ctx.lineTo(b.pos.x, b.pos.y);
    ctx.strokeStyle = `rgba(110, 224, 170, ${alpha})`;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(a.pos.x, a.pos.y);
    ctx.lineTo(b.pos.x, b.pos.y);
    ctx.strokeStyle = `rgba(200, 255, 230, ${alpha * 0.35})`;
    ctx.lineWidth = 1.2;
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
): void {
  if (type === "goo") {
    drawGoo(ctx, x, y, radius);
    return;
  }
  if (type === "thruster") {
    drawThruster(ctx, x, y, radius, dir, firing);
    return;
  }
  drawSensor(ctx, x, y, radius, stage, goal);
}

function drawGoo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const grad = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.15,
    x,
    y,
    radius,
  );
  grad.addColorStop(0, "#a9f0c8");
  grad.addColorStop(0.6, GOO);
  grad.addColorStop(1, GOO_DARK);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(10, 30, 20, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawThruster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  dir: Vec2 | null,
  firing: number,
): void {
  if (!dir) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245, 166, 35, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(60, 35, 0, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return;
  }

  const angle = Math.atan2(dir.y, dir.x);

  if (firing > 0.01) {
    const len = 12 + firing * 30;
    const bx = x - Math.cos(angle) * (radius + len);
    const by = y - Math.sin(angle) * (radius + len);
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * radius, y - Math.sin(angle) * radius);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = `rgba(255, 190, 80, ${0.5 + firing * 0.5})`;
    ctx.lineWidth = 3 + firing * 5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(radius + 6, 0);
  ctx.lineTo(-radius, radius * 0.85);
  ctx.lineTo(-radius * 0.4, 0);
  ctx.lineTo(-radius, -radius * 0.85);
  ctx.closePath();
  ctx.fillStyle = firing > 0.01 ? "#ffcf6b" : THRUST;
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 35, 0, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawSensor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  stage: Stage,
  goal: Goal,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 40, 46, 0.9)";
  ctx.fill();
  ctx.strokeStyle = SENSOR;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = SENSOR;
  ctx.fill();

  if (stage === "sim") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(goal.pos.x, goal.pos.y);
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(77, 208, 225, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
    ctx.strokeStyle = "rgba(89, 237, 199, 0.8)";
    ctx.lineWidth = 2.5 / camera.scale;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.arc(ghost.pos.x, ghost.pos.y, connectRadius, 0, Math.PI * 2);
  ctx.setLineDash([4 / camera.scale, 7 / camera.scale]);
  ctx.strokeStyle = "rgba(89, 237, 199, 0.3)";
  ctx.lineWidth = 1.2 / camera.scale;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.55;
  const radius = BLOCK_RADIUS[ghost.type];
  const dir = ghost.type === "thruster" ? ghostDirection(world, ghost) : null;
  drawBlock(ctx, ghost.type, ghost.pos.x, ghost.pos.y, radius, dir, 0, "editor", {
    pos: ghost.pos,
    radius: 0,
  });

  ctx.restore();
}
