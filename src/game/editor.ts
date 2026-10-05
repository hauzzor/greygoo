import type { World } from "../core/physics";
import type { BlockType, Node } from "../core/types";

export const BLOCK_RADIUS: Record<BlockType, number> = {
  goo: 13,
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
