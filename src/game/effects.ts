import type { World } from "../core/physics";
import type { Goal } from "../core/types";
import type { Camera } from "../render/camera";
import type { Particles } from "../render/particles";
import { thrustDirection } from "../core/cell";

const MOTE: [number, number, number] = [200, 240, 190];
const BUBBLE: [number, number, number] = [220, 255, 235];
const EXHAUST: [number, number, number] = [255, 214, 120];
const POLLEN: [number, number, number] = [255, 236, 170];
const POP: [number, number, number] = [200, 255, 210];

let moteAcc = 0;
let bubbleAcc = 0;

export function updateAmbientLife(
  particles: Particles,
  camera: Camera,
  dt: number,
): void {
  const halfW = camera.width / 2 / camera.scale;
  const halfH = camera.height / 2 / camera.scale;
  const x0 = camera.x - halfW;
  const y0 = camera.y - halfH;

  moteAcc += dt * 3.5;
  while (moteAcc >= 1) {
    moteAcc -= 1;
    particles.emit({
      x: x0 + Math.random() * halfW * 2,
      y: y0 + Math.random() * halfH * 2,
      vx: (Math.random() - 0.5) * 6,
      vy: -4 - Math.random() * 6,
      life: 6 + Math.random() * 6,
      size: 1 + Math.random() * 1.6,
      color: MOTE,
      drag: 0.995,
      alpha: 0.16 + Math.random() * 0.18,
    });
  }

  bubbleAcc += dt * 0.5;
  while (bubbleAcc >= 1) {
    bubbleAcc -= 1;
    particles.emit({
      x: x0 + Math.random() * halfW * 2,
      y: y0 + halfH * 2,
      vx: (Math.random() - 0.5) * 4,
      vy: -12 - Math.random() * 14,
      life: 4 + Math.random() * 3,
      size: 2 + Math.random() * 2.4,
      color: BUBBLE,
      drag: 0.998,
      alpha: 0.22,
    });
  }
}

export function emitThrusterExhaust(
  world: World,
  particles: Particles,
  dt: number,
): void {
  for (const node of world.nodes.values()) {
    if (node.type !== "thruster" || node.firing <= 0.01) continue;
    const dir = thrustDirection(world, node.id);
    if (!dir) continue;

    const rate = 30 + node.firing * 80;
    const expected = rate * dt;
    let count = Math.floor(expected);
    if (Math.random() < expected - count) count++;

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.9;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const dx = -dir.x * cos + dir.y * sin;
      const dy = -dir.x * sin - dir.y * cos;
      const speed = 20 + Math.random() * 45 + node.firing * 40;
      particles.emit({
        x: node.pos.x + dx * node.radius * 0.8,
        y: node.pos.y + dy * node.radius * 0.8,
        vx: dx * speed,
        vy: dy * speed,
        life: 0.4 + Math.random() * 0.5,
        size: 2 + Math.random() * 2.5,
        color: EXHAUST,
        drag: 0.9,
        glow: true,
        alpha: 0.5,
      });
    }
  }
}

export function emitPlacementPop(
  particles: Particles,
  x: number,
  y: number,
): void {
  particles.burst(x, y, 10, {
    life: 0.6,
    size: 2,
    color: POP,
    drag: 0.9,
    alpha: 0.5,
  });
}

export function emitLaunchPoof(
  particles: Particles,
  x: number,
  y: number,
): void {
  particles.burst(x, y, 18, {
    life: 0.8,
    size: 2.4,
    color: MOTE,
    drag: 0.92,
    glow: true,
    alpha: 0.5,
  });
}

export function emitWinBurst(particles: Particles, goal: Goal): void {
  particles.burst(goal.pos.x, goal.pos.y, 40, {
    life: 1.6,
    size: 3,
    color: POLLEN,
    drag: 0.94,
    glow: true,
    alpha: 0.7,
  });
  particles.burst(goal.pos.x, goal.pos.y, 24, {
    life: 2.2,
    size: 2,
    color: MOTE,
    drag: 0.97,
    alpha: 0.5,
  });
}
