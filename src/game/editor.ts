import type { World } from "../core/physics";
import type { BlockType, Node } from "../core/types";

export const BLOCK_RADIUS: Record<BlockType, number> = {
  cell: 13,
  thruster: 15,
  sensor: 14,
  camera: 14,
};

export function placeBlock(
  world: World,
  type: BlockType,
  pos: { x: number; y: number },
): Node {
  return world.addNode(type, pos, BLOCK_RADIUS[type]);
}

const SCATTER_LAYOUT: Array<[BlockType, number]> = [
  ["cell", 14],
  ["thruster", 5],
  ["sensor", 3],
  ["camera", 1],
];

export function scatterBlocks(world: World): void {
  const types: BlockType[] = [];
  for (const [type, count] of SCATTER_LAYOUT) {
    for (let i = 0; i < count; i++) types.push(type);
  }
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = types[i];
    types[i] = types[j];
    types[j] = tmp;
  }

  const placed: Array<{ x: number; y: number; r: number }> = [];
  for (const type of types) {
    const radius = BLOCK_RADIUS[type];
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 340;
      x = Math.cos(angle) * dist;
      y = Math.sin(angle) * dist;
      const clear = placed.every(
        (p) => Math.hypot(p.x - x, p.y - y) > p.r + radius + 16,
      );
      if (clear) break;
    }
    placed.push({ x, y, r: radius });
    world.addNode(type, { x, y }, radius);
  }
}
