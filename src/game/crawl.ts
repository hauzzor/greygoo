import type { World } from "../core/physics";
import type { Beam } from "../core/types";

export const CRAWL_SPEED = 60;

interface Crawler {
  nodeId: number;
  atId: number;
  toId: number;
  t: number;
}

const crawlers = new Map<number, Crawler>();
let installed = false;

function otherEnd(beam: Beam, id: number): number {
  return beam.a === id ? beam.b : beam.a;
}

function snapTo(world: World, nodeId: number, fromId: number, toId: number, t: number): void {
  const node = world.nodes.get(nodeId);
  const at = world.nodes.get(fromId);
  const to = world.nodes.get(toId);
  if (!node || !at || !to) return;
  node.pos.x = at.pos.x + (to.pos.x - at.pos.x) * t;
  node.pos.y = at.pos.y + (to.pos.y - at.pos.y) * t;
  node.prev.x = node.pos.x;
  node.prev.y = node.pos.y;
}

function startOnBeam(world: World, nodeId: number, beam: Beam, t: number): void {
  const node = world.nodes.get(nodeId);
  if (!node) return;

  let atId: number;
  let toId: number;
  let tt: number;
  if (t <= 0.5) {
    atId = beam.a;
    toId = beam.b;
    tt = t;
  } else {
    atId = beam.b;
    toId = beam.a;
    tt = 1 - t;
  }

  if (!world.nodes.has(atId) || !world.nodes.has(toId)) return;

  node.ghost = true;
  node.invMass = 0;
  crawlers.set(nodeId, { nodeId, atId, toId, t: tt });
  snapTo(world, nodeId, atId, toId, tt);
}

function startOnNode(world: World, nodeId: number, structId: number): void {
  const node = world.nodes.get(nodeId);
  const beams = world.neighbors(structId);
  if (!node || beams.length === 0) return;

  const beam = beams[Math.floor(Math.random() * beams.length)];
  const toId = otherEnd(beam, structId);
  if (!world.nodes.has(toId)) return;

  node.ghost = true;
  node.invMass = 0;
  crawlers.set(nodeId, { nodeId, atId: structId, toId, t: 0 });
  snapTo(world, nodeId, structId, toId, 0);
}

export function installCrawlHooks(world: World): void {
  if (installed) return;
  installed = true;

  world.onAbsorb = (nodeId, beam, t) => {
    if (crawlers.has(nodeId)) return true;
    startOnBeam(world, nodeId, beam, t);
    return crawlers.has(nodeId);
  };

  world.onAbsorbNode = (looseId, structId) => {
    if (crawlers.has(looseId)) return true;
    if (world.degree(structId) === 0) return false;
    startOnNode(world, looseId, structId);
    return crawlers.has(looseId);
  };
}

export function updateCrawlers(world: World, dt: number): void {
  for (const crawler of [...crawlers.values()]) {
    const node = world.nodes.get(crawler.nodeId);
    if (!node) {
      crawlers.delete(crawler.nodeId);
      continue;
    }

    let at = world.nodes.get(crawler.atId);
    let to = world.nodes.get(crawler.toId);
    if (!at || !to) {
      releaseCrawler(world, crawler.nodeId);
      continue;
    }

    let len = Math.hypot(to.pos.x - at.pos.x, to.pos.y - at.pos.y) || 1;
    crawler.t += (CRAWL_SPEED * dt) / len;

    let guard = 0;
    while (crawler.t >= 1 && guard < 8) {
      guard++;
      const arrived = crawler.toId;
      const cameFrom = crawler.atId;

      const options: number[] = [];
      for (const beam of world.neighbors(arrived)) {
        const other = otherEnd(beam, arrived);
        if (other !== cameFrom && world.nodes.has(other)) options.push(other);
      }
      const next =
        options.length > 0
          ? options[Math.floor(Math.random() * options.length)]
          : cameFrom;

      crawler.atId = arrived;
      crawler.toId = next;
      crawler.t -= 1;

      at = world.nodes.get(crawler.atId);
      to = world.nodes.get(crawler.toId);
      if (!at || !to) {
        releaseCrawler(world, crawler.nodeId);
        break;
      }
      len = Math.hypot(to.pos.x - at.pos.x, to.pos.y - at.pos.y) || 1;
    }

    if (!crawlers.has(crawler.nodeId)) continue;
    at = world.nodes.get(crawler.atId);
    to = world.nodes.get(crawler.toId);
    if (!at || !to) {
      releaseCrawler(world, crawler.nodeId);
      continue;
    }
    snapTo(world, crawler.nodeId, crawler.atId, crawler.toId, Math.min(crawler.t, 1));
  }
}

export function releaseCrawler(world: World, nodeId: number): void {
  if (!crawlers.delete(nodeId)) return;
  const node = world.nodes.get(nodeId);
  if (node) {
    node.ghost = false;
    node.invMass = 1;
    node.prev.x = node.pos.x;
    node.prev.y = node.pos.y;
  }
}

export function isCrawling(nodeId: number): boolean {
  return crawlers.has(nodeId);
}

export function clearCrawlers(): void {
  crawlers.clear();
}
