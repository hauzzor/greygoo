import type { World } from "./physics";
import type { Vec2 } from "./vec2";

export function connectedComponent(world: World, startId: number): Set<number> {
  const seen = new Set<number>([startId]);
  const queue: number[] = [startId];

  while (queue.length > 0) {
    const id = queue.pop() as number;
    for (const beam of world.neighbors(id)) {
      const other = beam.a === id ? beam.b : beam.a;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }

  return seen;
}

export function autoConnect(
  world: World,
  id: number,
  radius: number,
  maxPerNode = 6,
): void {
  const node = world.nodes.get(id);
  if (!node) return;
  if (world.degree(id) >= maxPerNode) return;

  world.forEachNear(node.pos.x, node.pos.y, radius, (other) => {
    if (other.id === id) return;
    if (world.degree(id) >= maxPerNode || world.degree(other.id) >= maxPerNode) {
      return;
    }
    if (world.connected(id, other.id)) return;

    const dx = other.pos.x - node.pos.x;
    const dy = other.pos.y - node.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= radius && d > 0) world.addBeam(id, other.id, d);
  });
}

export function previewConnections(
  world: World,
  pos: Vec2,
  radius: number,
  maxPerNode = 6,
): number[] {
  const result: number[] = [];
  world.forEachNear(pos.x, pos.y, radius, (other) => {
    if (result.length >= maxPerNode) return;
    if (world.degree(other.id) >= maxPerNode) return;
    const d = Math.hypot(other.pos.x - pos.x, other.pos.y - pos.y);
    if (d <= radius && d > 0) result.push(other.id);
  });
  return result;
}

export function thrustDirection(world: World, id: number): Vec2 | null {
  const node = world.nodes.get(id);
  if (!node) return null;

  let x = 0;
  let y = 0;
  let count = 0;

  for (const beam of world.neighbors(id)) {
    const otherId = beam.a === id ? beam.b : beam.a;
    const other = world.nodes.get(otherId);
    if (!other) continue;

    const dx = other.pos.x - node.pos.x;
    const dy = other.pos.y - node.pos.y;
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

export function updateThrustDirections(world: World): void {
  for (const node of world.nodes.values()) {
    if (node.type !== "thruster") {
      node.dirX = 0;
      node.dirY = 0;
      continue;
    }
    const dir = thrustDirection(world, node.id);
    if (dir) {
      node.dirX = dir.x;
      node.dirY = dir.y;
    } else {
      node.dirX = 0;
      node.dirY = 0;
    }
  }
}
