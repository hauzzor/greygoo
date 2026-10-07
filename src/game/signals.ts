import type { World } from "../core/physics";
import type { Beam, Goal, Node } from "../core/types";
import type { View } from "../render/particles";
import { sprites } from "../render/sprites";
import { pickGoal, stepTraveller, type Traveller } from "./travellers";

export const SIGNAL_SPEED = 110;
export const EMIT_INTERVAL = 1;
const SIGNAL_RADIUS = 6;
const MAX_SIGNALS = 500;

export interface SensorColor {
  hex: string;
  rgb: [number, number, number];
}

export const SENSOR_PALETTE: SensorColor[] = [
  { hex: "#e6d4ff", rgb: [230, 212, 255] },
  { hex: "#ffd6e8", rgb: [255, 214, 232] },
  { hex: "#cdeaff", rgb: [205, 234, 255] },
  { hex: "#c9f5df", rgb: [201, 245, 223] },
  { hex: "#ffe9b8", rgb: [255, 233, 184] },
  { hex: "#ffcfc2", rgb: [255, 207, 194] },
];

export function sensorColorIndex(id: number): number {
  const n = SENSOR_PALETTE.length;
  return ((id % n) + n) % n;
}

export function sensorColor(id: number): SensorColor {
  return SENSOR_PALETTE[sensorColorIndex(id)];
}

interface Signal extends Traveller {
  sensorId: number;
  color: number;
  dirX: number;
  dirY: number;
  phase: number;
}

const signals: Signal[] = [];
const emitAcc = new Map<number, number>();

function otherEnd(beam: Beam, id: number): number {
  return beam.a === id ? beam.b : beam.a;
}

function spawn(world: World, sensor: Node, otherId: number, gx: number, gy: number): void {
  if (!world.nodes.has(otherId)) return;
  if (signals.length >= MAX_SIGNALS) return;
  signals.push({
    sensorId: sensor.id,
    color: sensorColorIndex(sensor.id),
    dirX: gx,
    dirY: gy,
    atId: sensor.id,
    toId: otherId,
    t: 0,
    goalId: pickGoal(world, sensor.id) ?? otherId,
    phase: Math.random() * Math.PI * 2,
  });
}

function fireThruster(node: Node, dirX: number, dirY: number): void {
  node.impulse = true;
  node.signalGoalX = dirX;
  node.signalGoalY = dirY;
}

export function updateSignals(world: World, goal: Goal, dt: number): void {
  for (const id of [...emitAcc.keys()]) {
    const node = world.nodes.get(id);
    if (!node || node.type !== "sensor") emitAcc.delete(id);
  }

  for (const sensor of world.nodes.values()) {
    if (sensor.type !== "sensor" || !sensor.emitting) continue;
    if (world.degree(sensor.id) === 0) {
      emitAcc.delete(sensor.id);
      continue;
    }

    const dx = goal.pos.x - sensor.pos.x;
    const dy = goal.pos.y - sensor.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const gx = dx / len;
    const gy = dy / len;

    let acc = (emitAcc.get(sensor.id) ?? 0) + dt;
    while (acc >= EMIT_INTERVAL) {
      acc -= EMIT_INTERVAL;
      for (const beam of world.neighbors(sensor.id)) {
        spawn(world, sensor, otherEnd(beam, sensor.id), gx, gy);
      }
    }
    emitAcc.set(sensor.id, acc);
  }

  for (let i = signals.length - 1; i >= 0; i--) {
    const sig = signals[i];
    let at = world.nodes.get(sig.atId);
    let to = world.nodes.get(sig.toId);
    if (!at || !to) {
      signals.splice(i, 1);
      continue;
    }

    let len = Math.hypot(to.pos.x - at.pos.x, to.pos.y - at.pos.y) || 1;
    sig.t += (SIGNAL_SPEED * dt) / len;

    let dead = false;
    let guard = 0;
    while (sig.t >= 1 && guard < 8) {
      guard++;
      sig.t -= 1;

      const node = world.nodes.get(sig.toId);
      if (node && node.type === "thruster") {
        fireThruster(node, sig.dirX, sig.dirY);
        dead = true;
        break;
      }

      sig.atId = sig.toId;
      at = world.nodes.get(sig.atId);
      if (!at) {
        dead = true;
        break;
      }

      if (!stepTraveller(world, sig)) {
        dead = true;
        break;
      }

      to = world.nodes.get(sig.toId);
      if (!to) {
        dead = true;
        break;
      }
      len = Math.hypot(to.pos.x - at.pos.x, to.pos.y - at.pos.y) || 1;
    }

    if (dead) signals.splice(i, 1);
  }
}

export function clearSignals(): void {
  signals.length = 0;
  emitAcc.clear();
}

export function signalCount(): number {
  return signals.length;
}

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function glowSprite(rgb: [number, number, number]): HTMLCanvasElement {
  const size = 64;
  const half = size / 2;
  return sprites.get(
    `sigglow|${rgb[0]}|${rgb[1]}|${rgb[2]}`,
    size,
    size,
    (ctx) => {
      const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.6)`);
      grad.addColorStop(0.4, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.22)`);
      grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    },
  );
}

export function drawSignals(
  ctx: CanvasRenderingContext2D,
  world: World,
  time: number,
  view: View,
): void {
  for (const sig of signals) {
    const at = world.nodes.get(sig.atId);
    const to = world.nodes.get(sig.toId);
    if (!at || !to) continue;

    const x = at.pos.x + (to.pos.x - at.pos.x) * sig.t;
    const y = at.pos.y + (to.pos.y - at.pos.y) * sig.t;
    const r = SIGNAL_RADIUS * (0.9 + 0.1 * Math.sin(time * 6 + sig.phase));

    if (x + r * 4 < view.x0 || x - r * 4 > view.x1) continue;
    if (y + r * 4 < view.y0 || y - r * 4 > view.y1) continue;

    const col = SENSOR_PALETTE[sig.color];

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.7;
    const gs = r * 4;
    ctx.drawImage(glowSprite(col.rgb), x - gs, y - gs, gs * 2, gs * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    const grad = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.1,
      x,
      y,
      r,
    );
    grad.addColorStop(0, "rgba(255, 255, 255, 0.92)");
    grad.addColorStop(0.55, hexA(col.hex, 0.85));
    grad.addColorStop(1, hexA(col.hex, 0.55));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = Math.max(0.8, r * 0.16);
    ctx.stroke();

    const a = Math.atan2(sig.dirY, sig.dirX);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.52);
    ctx.lineTo(r * 0.6, 0);
    ctx.lineTo(-r * 0.15, r * 0.52);
    ctx.strokeStyle = "rgba(60, 70, 60, 0.75)";
    ctx.lineWidth = Math.max(1, r * 0.24);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
}
