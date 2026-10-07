import type { Camera } from "./camera";
import type { World } from "../core/physics";
import type { Goal, Node } from "../core/types";
import type { Vec2 } from "../core/vec2";
import { sprites } from "./sprites";
import { drawSignals, sensorColor, type SensorColor } from "../game/signals";
import type { Particles, View } from "./particles";

export interface RenderState {
  running: boolean;
  selectedId: number | null;
  connectRadius: number;
  time: number;
  cameraLocked: boolean;
  selectedCameraId: number | null;
  heldId: number | null;
  heldNeighbours: number[];
}

const LEAF_LIGHT = "#eafbe0";
const LEAF = "#7fd992";
const LEAF_MID = "#4aa863";
const FIREFLY_HOT = "#dff0ff";
const FIREFLY_DEEP = "#2e6fe8";
const PETAL_CORE = "#fff7c2";
const SUNBEAM = "#ffe9a8";
const SUNBEAM_RING = "#f7d774";
const HALO = "#a9e6b0";
const CAMERA_LIGHT = "#cdeee4";
const CAMERA_MID = "#6fc2b0";
const CAMERA_DARK = "#2f6f68";

const CELL_SEG = 12;
const BEAM_SEG = 6;
const BG_SIZE = 512;
const beamPts = new Float32Array((BEAM_SEG + 1) * 2);

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function glowSprite(color: string, radius: number): HTMLCanvasElement {
  const r = Math.max(4, Math.round(radius / 4) * 4);
  return sprites.get(`glow|${color}|${r}`, r * 2, r * 2, (ctx) => {
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, r * 2, r * 2);
  });
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  const r = Math.max(4, Math.round(radius / 4) * 4);
  ctx.drawImage(glowSprite(color, radius), x - r, y - r, r * 2, r * 2);
}

function ambientTexture(): HTMLCanvasElement {
  return sprites.get("ambient", BG_SIZE, BG_SIZE, (ctx) => {
    let s = 987654321;
    const rand = (): number => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    const blobs: number[][] = [];
    for (let i = 0; i < 14; i++) {
      blobs.push([rand() * BG_SIZE, rand() * BG_SIZE, 120 + rand() * 220]);
    }
    const rings: number[][] = [];
    for (let i = 0; i < 10; i++) {
      rings.push([rand() * BG_SIZE, rand() * BG_SIZE, 40 + rand() * 120]);
    }

    const offsets = [-BG_SIZE, 0, BG_SIZE];
    for (const [cx, cy, r] of blobs) {
      for (const ox of offsets) {
        for (const oy of offsets) {
          const grad = ctx.createRadialGradient(
            cx + ox,
            cy + oy,
            0,
            cx + ox,
            cy + oy,
            r,
          );
          grad.addColorStop(0, "rgba(234, 251, 224, 0.05)");
          grad.addColorStop(1, "rgba(234, 251, 224, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
        }
      }
    }

    ctx.strokeStyle = "rgba(220, 245, 205, 0.04)";
    ctx.lineWidth = 1.5;
    for (const [cx, cy, r] of rings) {
      for (const ox of offsets) {
        for (const oy of offsets) {
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, r * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  });
}

function nodeVisible(x: number, y: number, r: number, view: View): boolean {
  return x + r >= view.x0 && x - r <= view.x1 && y + r >= view.y0 && y - r <= view.y1;
}

function segmentVisible(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  view: View,
  margin: number,
): boolean {
  const x0 = Math.min(ax, bx) - margin;
  const x1 = Math.max(ax, bx) + margin;
  const y0 = Math.min(ay, by) - margin;
  const y1 = Math.max(ay, by) + margin;
  return x1 >= view.x0 && x0 <= view.x1 && y1 >= view.y0 && y0 <= view.y1;
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

  drawBackground(ctx, camera, state.time);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camera.x, -camera.y);

  const halfW = width / 2 / camera.scale;
  const halfH = height / 2 / camera.scale;
  const view: View = {
    x0: camera.x - halfW,
    y0: camera.y - halfH,
    x1: camera.x + halfW,
    y1: camera.y + halfH,
  };

  drawGoal(ctx, goal, state.time);
  particles.draw(ctx, view);
  drawBeams(ctx, world, state.time, view);
  drawSignals(ctx, world, state.time, view);

  for (const node of world.nodes.values()) {
    if (!nodeVisible(node.pos.x, node.pos.y, node.radius + 26, view)) continue;
    const dir =
      node.type === "thruster" && (node.dirX !== 0 || node.dirY !== 0)
        ? { x: node.dirX, y: node.dirY }
        : null;
    const cameraActive =
      state.cameraLocked && node.id === state.selectedCameraId;
    const isHeld = node.id === state.heldId;
    if (isHeld) ctx.globalAlpha = 0.6;
    drawBlock(
      ctx,
      node.type,
      node.pos.x,
      node.pos.y,
      node.radius,
      dir,
      node.firing,
      state.running,
      goal,
      state.time,
      node,
      cameraActive,
    );
    if (isHeld) ctx.globalAlpha = 1;
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

  if (state.heldId !== null) {
    const held = world.nodes.get(state.heldId);
    if (held) {
      for (const id of state.heldNeighbours) {
        const other = world.nodes.get(id);
        if (!other) continue;
        ctx.beginPath();
        ctx.moveTo(held.pos.x, held.pos.y);
        ctx.lineTo(other.pos.x, other.pos.y);
        ctx.setLineDash([5 / camera.scale, 5 / camera.scale]);
        ctx.strokeStyle = "rgba(169, 230, 176, 0.85)";
        ctx.lineWidth = 2.2 / camera.scale;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(held.pos.x, held.pos.y, held.radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(233, 255, 235, 0.9)";
      ctx.lineWidth = 2.5 / camera.scale;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  time: number,
): void {
  const w = camera.width;
  const h = camera.height;
  const overscan = Math.max(w, h) * 0.2;
  const ox = Math.sin(time * 0.05 + camera.x * 0.0007) * overscan * 0.5;
  const oy = Math.cos(time * 0.04 + camera.y * 0.0007) * overscan * 0.5;

  ctx.drawImage(
    ambientTexture(),
    ox - overscan,
    oy - overscan,
    w + overscan * 2,
    h + overscan * 2,
  );
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
  view: View,
): void {
  for (const beam of world.beams) {
    const a = world.nodes.get(beam.a);
    const b = world.nodes.get(beam.b);
    if (!a || !b) continue;
    const ax = a.pos.x;
    const ay = a.pos.y;
    const bx = b.pos.x;
    const by = b.pos.y;
    if (!segmentVisible(ax, ay, bx, by, view, 26)) continue;
    drawGooBeam(ctx, ax, ay, bx, by, beam.rest, a.radius, time, beam.a * 31 + beam.b * 17);
  }
}

function drawGooBeam(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rest: number,
  aRadius: number,
  time: number,
  seed: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d;
  const uy = dy / d;
  const nx = -uy;
  const ny = ux;

  const s = seed % 1000;
  const strain = Math.abs(d - rest) / rest;
  const wobble = 0.5 + 0.5 * Math.sin(time * 1.6 + s * 0.7);
  const amp = (1.6 + Math.min(4, strain * 7)) * wobble;
  const bow = Math.min(6, d * 0.03) * (seed % 2 === 0 ? 1 : -1);
  const baseW = Math.max(2.2, Math.min(5.2, aRadius * 0.34));

  for (let i = 0; i <= BEAM_SEG; i++) {
    const t = i / BEAM_SEG;
    const shape = Math.sin(Math.PI * t);
    const offset =
      bow * shape + Math.sin(t * Math.PI * 3 + time * 2 + s) * amp * shape;
    beamPts[i * 2] = ax + ux * d * t + nx * offset;
    beamPts[i * 2 + 1] = ay + uy * d * t + ny * offset;
  }

  const widthAt = (t: number): number => {
    const e = Math.abs(2 * t - 1);
    return baseW * (0.5 + 0.95 * Math.pow(e, 1.5));
  };

  const fill = `rgba(142, 208, 150, ${Math.max(0.3, 0.62 - strain * 0.25)})`;

  ctx.beginPath();
  for (let i = 0; i <= BEAM_SEG; i++) {
    const w = widthAt(i / BEAM_SEG);
    const px = beamPts[i * 2] + nx * w;
    const py = beamPts[i * 2 + 1] + ny * w;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let i = BEAM_SEG; i >= 0; i--) {
    const w = widthAt(i / BEAM_SEG);
    ctx.lineTo(beamPts[i * 2] - nx * w, beamPts[i * 2 + 1] - ny * w);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i <= BEAM_SEG; i++) {
    const px = beamPts[i * 2];
    const py = beamPts[i * 2 + 1];
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = `rgba(226, 250, 216, ${0.35 + 0.35 * wobble})`;
  ctx.lineWidth = Math.max(1, baseW * 0.4);
  ctx.lineCap = "round";
  ctx.stroke();

  const endW = widthAt(0);
  ctx.beginPath();
  ctx.moveTo(ax + endW, ay);
  ctx.arc(ax, ay, endW, 0, Math.PI * 2);
  ctx.moveTo(bx + endW, by);
  ctx.arc(bx, by, endW, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  type: Node["type"],
  x: number,
  y: number,
  radius: number,
  dir: Vec2 | null,
  firing: number,
  running: boolean,
  goal: Goal,
  time: number,
  node: Node | null,
  cameraActive = false,
): void {
  if (type === "cell") {
    drawCell(ctx, x, y, radius, node, time);
    return;
  }
  if (type === "thruster") {
    drawThruster(ctx, x, y, radius, dir, firing);
    return;
  }
  if (type === "camera") {
    drawCamera(ctx, x, y, radius, cameraActive);
    return;
  }
  drawSensor(
    ctx,
    x,
    y,
    radius,
    running,
    goal,
    time,
    sensorColor(node ? node.id : 0),
  );
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  node: Node | null,
  time: number,
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

  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, x, y, radius * 2.4, "rgba(120, 220, 150, 0.22)");
  ctx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.translate(x, y);
  if (angle !== 0) ctx.rotate(angle);
  ctx.scale(sx, sy);

  const seed = node ? node.id * 1.37 : 0;
  ctx.beginPath();
  for (let i = 0; i <= CELL_SEG; i++) {
    const a = (i / CELL_SEG) * Math.PI * 2;
    const rr =
      radius *
      (1 +
        0.055 * Math.sin(3 * a + time * 0.9 + seed) +
        0.035 * Math.sin(5 * a - time * 1.3 + seed * 2));
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

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
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(26, 74, 46, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-radius * 0.3, -radius * 0.32, radius * 0.22, 0, Math.PI * 2);
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
    grad.addColorStop(0, `rgba(200, 228, 255, ${0.5 + firing * 0.4})`);
    grad.addColorStop(1, "rgba(90, 160, 255, 0)");
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
  ctx.globalCompositeOperation = "lighter";
  drawGlow(
    ctx,
    x,
    y,
    radius * 2.6,
    active ? "rgba(120, 180, 255, 0.35)" : "rgba(120, 180, 255, 0.18)",
  );
  ctx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const grad = ctx.createRadialGradient(
    -radius * 0.3,
    -radius * 0.3,
    radius * 0.15,
    0,
    0,
    radius * 1.1,
  );
  grad.addColorStop(0, active ? FIREFLY_HOT : "#bcd9ff");
  grad.addColorStop(1, FIREFLY_DEEP);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.15, radius * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "rgba(20, 60, 120, 0.4)";
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
  running: boolean,
  goal: Goal,
  time: number,
  color: SensorColor,
): void {
  if (running) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(goal.pos.x, goal.pos.y);
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = hexA(color.hex, 0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawBlossom(ctx, x, y, radius, time, color.hex, PETAL_CORE);
}

function drawCamera(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  active: boolean,
): void {
  if (active) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(CAMERA_LIGHT, 0.8);
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    radius * 0.15,
    x,
    y,
    radius,
  );
  grad.addColorStop(0, CAMERA_LIGHT);
  grad.addColorStop(1, CAMERA_MID);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 70, 66, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = CAMERA_DARK;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, radius * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = CAMERA_DARK;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - radius * 0.16, y - radius * 0.16, radius * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.fill();
}


