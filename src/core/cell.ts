import type { World } from "./physics";
import type { Vec2 } from "./vec2";

export function connectedComponent(world: World, startId: number): Set<number> {
  const seen = new Set<number>([startId]);
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift() as number;
    for (const beam of world.beams) {
      const other = beam.a === id ? beam.b : beam.b === id ? beam.a : -1;
      if (other !== -1 && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }

  return seen;
}

export function autoConnect(world: World, id: number, radius: number, maxPerNode = 6): void {
  const node = world.nodes.get(id);
  if (!node) return;

  for (const other of world.nodes.values()) {
    if (other.id === id) continue;
    if (world.connected(id, other.id)) continue;
    if (world.degree(id) >= maxPerNode || world.degree(other.id) >= maxPerNode) continue;

    const dx = other.pos.x - node.pos.x;
    const dy = other.pos.y - node.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= radius && d > 0) {
      world.beams.push({ a: id, b: other.id, rest: d });
    }
  }
}

export function previewConnections(
  world: World,
  pos: Vec2,
  radius: number,
  maxPerNode = 6,
): number[] {
  const result: number[] = [];
  for (const other of world.nodes.values()) {
    if (result.length >= maxPerNode) break;
    if (world.degree(other.id) >= maxPerNode) continue;
    const d = Math.hypot(other.pos.x - pos.x, other.pos.y - pos.y);
    if (d <= radius && d > 0) result.push(other.id);
  }
  return result;
}

export function thrustDirection(world: World, id: number): Vec2 | null {
  const node = world.nodes.get(id);
  if (!node) return null;

  let x = 0;
  let y = 0;
  let count = 0;

  for (const beam of world.beams) {
    const otherId = beam.a === id ? beam.b : beam.b === id ? beam.a : -1;
    if (otherId === -1) continue;
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
