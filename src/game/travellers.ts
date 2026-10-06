import type { World } from "../core/physics";
import type { Beam } from "../core/types";

export interface Traveller {
  atId: number;
  toId: number;
  t: number;
  goalId: number;
}

function otherEnd(beam: Beam, id: number): number {
  return beam.a === id ? beam.b : beam.a;
}

export function pickGoal(world: World, fromId: number): number | null {
  const seen = new Set<number>([fromId]);
  const queue: number[] = [fromId];
  const candidates: number[] = [];

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const beam of world.neighbors(id)) {
      const other = otherEnd(beam, id);
      if (seen.has(other) || !world.nodes.has(other)) continue;
      seen.add(other);
      candidates.push(other);
      queue.push(other);
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function nextStepToward(
  world: World,
  fromId: number,
  goalId: number,
): number | null {
  if (fromId === goalId || !world.nodes.has(goalId)) return null;

  const prev = new Map<number, number>();
  const seen = new Set<number>([fromId]);
  const queue: number[] = [fromId];
  let found = false;

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === goalId) {
      found = true;
      break;
    }
    for (const beam of world.neighbors(id)) {
      const other = otherEnd(beam, id);
      if (seen.has(other) || !world.nodes.has(other)) continue;
      seen.add(other);
      prev.set(other, id);
      queue.push(other);
    }
  }

  if (!found) return null;

  let cur = goalId;
  let parent = prev.get(cur);
  if (parent === undefined) return null;
  while (parent !== fromId) {
    cur = parent;
    parent = prev.get(cur);
    if (parent === undefined) return null;
  }
  return cur;
}

export function stepTraveller(world: World, traveller: Traveller): boolean {
  let next = nextStepToward(world, traveller.atId, traveller.goalId);
  if (next === null) {
    const goal = pickGoal(world, traveller.atId);
    if (goal === null) return false;
    traveller.goalId = goal;
    next = nextStepToward(world, traveller.atId, goal);
    if (next === null) return false;
  }
  traveller.toId = next;
  return true;
}
