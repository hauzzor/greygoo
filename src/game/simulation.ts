import type { World } from "../core/physics";
import type { Goal } from "../core/types";

export const MAX_THRUST = 600;
export const THRUST_IMPULSE_TIME = 1;
export const FIRE_FLASH_TIME = 0.25;

export function applyGuidance(world: World, power: number, dt: number): void {
  const force = Math.min(power, MAX_THRUST);
  const decay = dt / FIRE_FLASH_TIME;

  for (const node of world.nodes.values()) {
    node.firing = Math.max(0, node.firing - decay);
  }

  for (const thruster of world.nodes.values()) {
    if (thruster.type !== "thruster" || !thruster.impulse) continue;
    thruster.impulse = false;

    const dirX = thruster.dirX;
    const dirY = thruster.dirY;
    if (dirX === 0 && dirY === 0) continue;

    const weight = Math.max(
      0,
      dirX * thruster.signalGoalX + dirY * thruster.signalGoalY,
    );
    if (weight <= 0) continue;

    const dv = force * THRUST_IMPULSE_TIME * weight;
    thruster.accel.x += (dirX * dv) / dt;
    thruster.accel.y += (dirY * dv) / dt;
    thruster.firing = Math.max(thruster.firing, weight);
  }
}

export function checkWin(world: World, goal: Goal): boolean {
  for (const node of world.nodes.values()) {
    const distance = Math.hypot(node.pos.x - goal.pos.x, node.pos.y - goal.pos.y);
    if (distance <= goal.radius + node.radius) return true;
  }
  return false;
}
