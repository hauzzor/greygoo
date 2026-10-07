import type { World } from "./physics";
import type { Beam } from "./types";
import type { Vec2 } from "./vec2";

export const CONNECT_MIN = 50;
export const CONNECT_MAX = 100;

export const THRUST_DIR_MIN = 0.4;

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

function orient(
  ox: number,
  oy: number,
  px: number,
  py: number,
  qx: number,
  qy: number,
): number {
  return (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

export function beamWouldCross(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);

  for (const beam of world.beams) {
    const a = world.nodes.get(beam.a);
    const b = world.nodes.get(beam.b);
    if (!a || !b) continue;

    if (Math.max(a.pos.x, b.pos.x) < minX || Math.min(a.pos.x, b.pos.x) > maxX) {
      continue;
    }
    if (Math.max(a.pos.y, b.pos.y) < minY || Math.min(a.pos.y, b.pos.y) > maxY) {
      continue;
    }
    if (
      segmentsCross(ax, ay, bx, by, a.pos.x, a.pos.y, b.pos.x, b.pos.y)
    ) {
      return true;
    }
  }
  return false;
}

export function autoConnect(world: World, id: number, maxPerNode = 6): Beam[] {
  const added: Beam[] = [];
  const node = world.nodes.get(id);
  if (!node) return added;
  if (world.degree(id) >= maxPerNode) return added;

  world.forEachNear(node.pos.x, node.pos.y, CONNECT_MAX, (other) => {
    if (other.id === id) return;
    if (world.degree(id) >= maxPerNode || world.degree(other.id) >= maxPerNode) {
      return;
    }
    if (world.connected(id, other.id)) return;

    const dx = other.pos.x - node.pos.x;
    const dy = other.pos.y - node.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= CONNECT_MIN && d <= CONNECT_MAX) {
      if (beamWouldCross(world, node.pos.x, node.pos.y, other.pos.x, other.pos.y)) {
        return;
      }
      added.push(world.addBeam(id, other.id, d));
    }
  });

  return added;
}

export function previewConnections(
  world: World,
  pos: Vec2,
  maxPerNode = 6,
): number[] {
  const result: number[] = [];
  world.forEachNear(pos.x, pos.y, CONNECT_MAX, (other) => {
    if (result.length >= maxPerNode) return;
    if (world.degree(other.id) >= maxPerNode) return;
    const d = Math.hypot(other.pos.x - pos.x, other.pos.y - pos.y);
    if (d >= CONNECT_MIN && d <= CONNECT_MAX) {
      if (beamWouldCross(world, pos.x, pos.y, other.pos.x, other.pos.y)) return;
      result.push(other.id);
    }
  });
  return result;
}

export function removeCrossingBeams(
  world: World,
  newBeams: readonly Beam[],
): Beam[] {
  if (newBeams.length === 0) return [];
  const remove = new Set<Beam>();

  for (const nb of newBeams) {
    if (remove.has(nb)) continue;
    const na = world.nodes.get(nb.a);
    const nbn = world.nodes.get(nb.b);
    if (!na || !nbn) continue;

    for (const other of world.beams) {
      if (other === nb || remove.has(other)) continue;
      const oa = world.nodes.get(other.a);
      const ob = world.nodes.get(other.b);
      if (!oa || !ob) continue;
      if (
        segmentsCross(
          na.pos.x,
          na.pos.y,
          nbn.pos.x,
          nbn.pos.y,
          oa.pos.x,
          oa.pos.y,
          ob.pos.x,
          ob.pos.y,
        )
      ) {
        remove.add(nb);
        break;
      }
    }
  }

  const removed = [...remove];
  if (removed.length > 0) world.removeBeams(removed);
  return removed;
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
  if (len < THRUST_DIR_MIN) return null;
  return { x: -x / len, y: -y / len };
}

export function captureThrustDirection(world: World, id: number): void {
  const node = world.nodes.get(id);
  if (!node || node.type !== "thruster") return;
  const dir = thrustDirection(world, id);
  if (dir) {
    node.dirX = dir.x;
    node.dirY = dir.y;
  } else {
    node.dirX = 0;
    node.dirY = 0;
  }
}

export function syncThrustDirections(world: World): void {
  for (const node of world.nodes.values()) captureThrustDirection(world, node.id);
}
