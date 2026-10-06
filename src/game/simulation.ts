import type { World } from "../core/physics";
import type { Goal } from "../core/types";

export function applyGuidance(world: World, power: number, dt: number): void {
  for (const node of world.nodes.values()) {
    node.firing = 0;
    if (node.signalTimer > 0) {
      node.signalTimer = Math.max(0, node.signalTimer - dt);
    }
  }

  for (const thruster of world.nodes.values()) {
    if (thruster.type !== "thruster" || thruster.signalTimer <= 0) continue;

    const dirX = thruster.dirX;
    const dirY = thruster.dirY;
    if (dirX === 0 && dirY === 0) continue;

    const weight = Math.max(
      0,
      dirX * thruster.signalGoalX + dirY * thruster.signalGoalY,
    );
    if (weight <= 0) continue;

    thruster.accel.x += dirX * weight * power;
    thruster.accel.y += dirY * weight * power;
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
