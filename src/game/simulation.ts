import type { World } from "../core/physics";
import type { Goal } from "../core/types";
import { connectedComponent } from "../core/cell";

export function applyGuidance(world: World, goal: Goal, power: number): void {
  for (const node of world.nodes.values()) node.firing = 0;

  for (const sensor of world.nodes.values()) {
    if (sensor.type !== "sensor") continue;

    const dx = goal.pos.x - sensor.pos.x;
    const dy = goal.pos.y - sensor.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const gx = dx / len;
    const gy = dy / len;

    const component = connectedComponent(world, sensor.id);
    for (const id of component) {
      const thruster = world.nodes.get(id);
      if (!thruster || thruster.type !== "thruster") continue;

      const dirX = thruster.dirX;
      const dirY = thruster.dirY;
      if (dirX === 0 && dirY === 0) continue;

      const weight = Math.max(0, dirX * gx + dirY * gy);
      if (weight <= 0) continue;

      thruster.accel.x += dirX * weight * power;
      thruster.accel.y += dirY * weight * power;
      thruster.firing = Math.max(thruster.firing, weight);
    }
  }
}

export function checkWin(world: World, goal: Goal): boolean {
  for (const node of world.nodes.values()) {
    const distance = Math.hypot(node.pos.x - goal.pos.x, node.pos.y - goal.pos.y);
    if (distance <= goal.radius + node.radius) return true;
  }
  return false;
}
