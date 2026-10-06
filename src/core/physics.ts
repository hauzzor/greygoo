import type {
  BlockType,
  Beam,
  BeamSnapshot,
  Node,
  NodeSnapshot,
  WorldSnapshot,
} from "./types";
import { v } from "./vec2";

export interface PhysicsParams {
  damping: number;
  stiffness: number;
  iterations: number;
  maxVelocity: number;
}

const EMPTY_BEAMS: Beam[] = [];
const DEFAULT_RADIUS = 16;
const BEAM_RADIUS = 5;

function cellKey(cx: number, cy: number): number {
  return cx * 2000003 + cy;
}

export class World {
  nodes = new Map<number, Node>();
  beams: Beam[] = [];
  nextId = 1;
  maxRadius = DEFAULT_RADIUS;
  params: PhysicsParams = {
    damping: 0.99,
    stiffness: 0.9,
    iterations: 8,
    maxVelocity: 40,
  };

  private beamsByNode = new Map<number, Beam[]>();

  onAbsorb: ((nodeId: number, beam: Beam, t: number) => boolean) | null = null;
  onAbsorbNode: ((looseId: number, structId: number) => boolean) | null = null;
  onTopologyChange: ((ids: number[]) => void) | null = null;

  private notifyTopology(ids: number[]): void {
    if (this.onTopologyChange && ids.length > 0) this.onTopologyChange(ids);
  }

  private incidentNeighbors(id: number): number[] {
    const out: number[] = [];
    for (const beam of this.beams) {
      if (beam.a === id) out.push(beam.b);
      else if (beam.b === id) out.push(beam.a);
    }
    return out;
  }

  addNode(type: BlockType, pos: { x: number; y: number }, radius: number): Node {
    const node: Node = {
      id: this.nextId++,
      type,
      pos: v(pos.x, pos.y),
      prev: v(pos.x, pos.y),
      accel: v(0, 0),
      radius,
      invMass: 1,
      firing: 0,
      dirX: 0,
      dirY: 0,
      ghost: false,
      emitting: true,
      signalTimer: 0,
    };
    this.nodes.set(node.id, node);
    if (!this.beamsByNode.has(node.id)) this.beamsByNode.set(node.id, []);
    if (radius > this.maxRadius) this.maxRadius = radius;
    return node;
  }

  addBeam(a: number, b: number, rest: number): Beam {
    const beam: Beam = { a, b, rest };
    this.beams.push(beam);
    this.indexBeam(beam);
    this.notifyTopology([a, b]);
    return beam;
  }

  private indexBeam(beam: Beam): void {
    let la = this.beamsByNode.get(beam.a);
    if (!la) {
      la = [];
      this.beamsByNode.set(beam.a, la);
    }
    la.push(beam);

    let lb = this.beamsByNode.get(beam.b);
    if (!lb) {
      lb = [];
      this.beamsByNode.set(beam.b, lb);
    }
    lb.push(beam);
  }

  private reindex(): void {
    this.beamsByNode.clear();
    for (const beam of this.beams) this.indexBeam(beam);
    this.recomputeMaxRadius();
  }

  private recomputeMaxRadius(): void {
    let max = DEFAULT_RADIUS;
    for (const node of this.nodes.values()) {
      if (node.radius > max) max = node.radius;
    }
    this.maxRadius = max;
  }

  removeNode(id: number): void {
    const affected = this.incidentNeighbors(id);
    this.nodes.delete(id);
    const before = this.beams.length;
    this.beams = this.beams.filter((b) => b.a !== id && b.b !== id);
    if (this.beams.length !== before) this.reindex();
    else this.beamsByNode.delete(id);
    this.notifyTopology(affected);
  }

  detachNode(id: number): void {
    const affected = this.incidentNeighbors(id);
    const before = this.beams.length;
    this.beams = this.beams.filter((b) => b.a !== id && b.b !== id);
    if (this.beams.length !== before) this.reindex();
    this.notifyTopology(affected);
  }

  removeBeams(list: readonly Beam[]): void {
    if (list.length === 0) return;
    const affected: number[] = [];
    for (const b of list) {
      affected.push(b.a, b.b);
    }
    const set = new Set(list);
    this.beams = this.beams.filter((b) => !set.has(b));
    this.reindex();
    this.notifyTopology(affected);
  }

  clear(): void {
    this.nodes.clear();
    this.beams = [];
    this.beamsByNode.clear();
    this.nextId = 1;
    this.maxRadius = DEFAULT_RADIUS;
  }

  snapshot(): WorldSnapshot {
    const nodes: NodeSnapshot[] = [];
    for (const n of this.nodes.values()) {
      nodes.push({
        id: n.id,
        type: n.type,
        x: n.pos.x,
        y: n.pos.y,
        radius: n.radius,
      });
    }
    const beams: BeamSnapshot[] = this.beams.map((b) => ({
      a: b.a,
      b: b.b,
      rest: b.rest,
    }));
    return { nodes, beams, nextId: this.nextId };
  }

  restore(snap: WorldSnapshot): void {
    this.nodes.clear();
    for (const s of snap.nodes) {
      this.nodes.set(s.id, {
        id: s.id,
        type: s.type,
        pos: v(s.x, s.y),
        prev: v(s.x, s.y),
        accel: v(0, 0),
        radius: s.radius,
        invMass: 1,
        firing: 0,
        dirX: 0,
        dirY: 0,
        ghost: false,
        emitting: true,
        signalTimer: 0,
      });
    }
    this.beams = snap.beams.map((b) => ({ a: b.a, b: b.b, rest: b.rest }));
    this.nextId = snap.nextId;
    this.reindex();
  }

  neighbors(id: number): readonly Beam[] {
    return this.beamsByNode.get(id) ?? EMPTY_BEAMS;
  }

  degree(id: number): number {
    return this.neighbors(id).length;
  }

  connected(a: number, b: number): boolean {
    for (const beam of this.neighbors(a)) {
      if ((beam.a === a && beam.b === b) || (beam.a === b && beam.b === a)) {
        return true;
      }
    }
    return false;
  }

  centroid(): { x: number; y: number } {
    if (this.nodes.size === 0) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    for (const n of this.nodes.values()) {
      x += n.pos.x;
      y += n.pos.y;
    }
    return { x: x / this.nodes.size, y: y / this.nodes.size };
  }

  forEachNear(
    x: number,
    y: number,
    radius: number,
    cb: (node: Node) => void,
  ): void {
    const cell = Math.max(this.maxRadius * 2, 1);
    const grid = new Map<number, Node[]>();
    for (const n of this.nodes.values()) {
      const key = cellKey(Math.floor(n.pos.x / cell), Math.floor(n.pos.y / cell));
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(n);
    }

    const range = Math.ceil(radius / cell);
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const r2 = radius * radius;

    for (let ox = -range; ox <= range; ox++) {
      for (let oy = -range; oy <= range; oy++) {
        const bucket = grid.get(cellKey(cx + ox, cy + oy));
        if (!bucket) continue;
        for (const n of bucket) {
          const dx = n.pos.x - x;
          const dy = n.pos.y - y;
          if (dx * dx + dy * dy <= r2) cb(n);
        }
      }
    }
  }

  step(dt: number): void {
    const { damping, maxVelocity } = this.params;

    for (const n of this.nodes.values()) {
      if (n.invMass === 0 || n.ghost) {
        n.prev.x = n.pos.x;
        n.prev.y = n.pos.y;
        n.accel.x = 0;
        n.accel.y = 0;
        continue;
      }

      let vx = (n.pos.x - n.prev.x) * damping;
      let vy = (n.pos.y - n.prev.y) * damping;

      const speed = Math.hypot(vx, vy);
      if (speed > maxVelocity) {
        const k = maxVelocity / speed;
        vx *= k;
        vy *= k;
      }

      n.prev.x = n.pos.x;
      n.prev.y = n.pos.y;
      n.pos.x += vx + n.accel.x * dt * dt;
      n.pos.y += vy + n.accel.y * dt * dt;
      n.accel.x = 0;
      n.accel.y = 0;
    }

    for (let i = 0; i < this.params.iterations; i++) this.solveBeams();
    this.solveSeparation();
    this.solveBeamCollision();
    this.solveBeamCollision();
  }

  private solveBeams(): void {
    const k = this.params.stiffness;
    for (const beam of this.beams) {
      const a = this.nodes.get(beam.a);
      const b = this.nodes.get(beam.b);
      if (!a || !b) continue;

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - beam.rest) / d;

      const total = a.invMass + b.invMass;
      if (total === 0) continue;

      const cx = dx * diff * k;
      const cy = dy * diff * k;
      const aw = a.invMass / total;
      const bw = b.invMass / total;

      a.pos.x += cx * aw;
      a.pos.y += cy * aw;
      b.pos.x -= cx * bw;
      b.pos.y -= cy * bw;
    }
  }

  private solveBeamCollision(): void {
    if (this.beams.length === 0) return;

    const cell = Math.max(this.maxRadius * 2, 1);
    const expand = this.maxRadius + BEAM_RADIUS + 2;
    const beamGrid = new Map<number, number[]>();

    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i];
      const a = this.nodes.get(beam.a);
      const b = this.nodes.get(beam.b);
      if (!a || !b) continue;

      const cx0 = Math.floor((Math.min(a.pos.x, b.pos.x) - expand) / cell);
      const cx1 = Math.floor((Math.max(a.pos.x, b.pos.x) + expand) / cell);
      const cy0 = Math.floor((Math.min(a.pos.y, b.pos.y) - expand) / cell);
      const cy1 = Math.floor((Math.max(a.pos.y, b.pos.y) + expand) / cell);

      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = cellKey(cx, cy);
          let list = beamGrid.get(key);
          if (!list) {
            list = [];
            beamGrid.set(key, list);
          }
          list.push(i);
        }
      }
    }

    for (const node of this.nodes.values()) {
      if (node.invMass === 0 || node.ghost) continue;

      const key = cellKey(
        Math.floor(node.pos.x / cell),
        Math.floor(node.pos.y / cell),
      );
      const list = beamGrid.get(key);
      if (!list) continue;

      const isLoose = this.onAbsorb !== null && this.degree(node.id) === 0;

      for (const bi of list) {
        const beam = this.beams[bi];
        if (beam.a === node.id || beam.b === node.id) continue;

        const a = this.nodes.get(beam.a);
        const b = this.nodes.get(beam.b);
        if (!a || !b) continue;

        const ex = b.pos.x - a.pos.x;
        const ey = b.pos.y - a.pos.y;
        const len2 = ex * ex + ey * ey || 1e-6;

        let t = ((node.pos.x - a.pos.x) * ex + (node.pos.y - a.pos.y) * ey) / len2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const cxp = a.pos.x + ex * t;
        const cyp = a.pos.y + ey * t;

        let dx = node.pos.x - cxp;
        let dy = node.pos.y - cyp;
        let d = Math.hypot(dx, dy);
        const min = node.radius + BEAM_RADIUS;
        if (d >= min) continue;

        if (isLoose && this.onAbsorb && this.onAbsorb(node.id, beam, t)) {
          break;
        }

        if (d < 1e-4) {
          const inv = 1 / Math.sqrt(len2);
          dx = -ey * inv;
          dy = ex * inv;
          d = 1e-4;
        }

        const push = min - d;
        node.pos.x += (dx / d) * push;
        node.pos.y += (dy / d) * push;
      }
    }
  }

  private solveSeparation(): void {
    const cell = Math.max(this.maxRadius * 2, 1);
    const grid = new Map<number, Node[]>();

    for (const n of this.nodes.values()) {
      const key = cellKey(Math.floor(n.pos.x / cell), Math.floor(n.pos.y / cell));
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(n);
    }

    for (const a of this.nodes.values()) {
      const cx = Math.floor(a.pos.x / cell);
      const cy = Math.floor(a.pos.y / cell);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(cellKey(cx + ox, cy + oy));
          if (!bucket) continue;
          for (const b of bucket) {
            if (b.id <= a.id) continue;
            if (a.ghost || b.ghost) continue;

            const dx = b.pos.x - a.pos.x;
            const dy = b.pos.y - a.pos.y;
            const d2 = dx * dx + dy * dy;
            const min = a.radius + b.radius;
            if (d2 >= min * min || d2 === 0) continue;

            if (this.onAbsorbNode) {
              const aDeg = this.degree(a.id);
              const bDeg = this.degree(b.id);
              if (aDeg === 0 && bDeg > 0 && this.onAbsorbNode(a.id, b.id)) {
                continue;
              }
              if (bDeg === 0 && aDeg > 0 && this.onAbsorbNode(b.id, a.id)) {
                continue;
              }
            }

            const total = a.invMass + b.invMass;
            if (total === 0) continue;

            const d = Math.sqrt(d2);
            const overlap = (min - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            const aw = a.invMass / total;
            const bw = b.invMass / total;

            a.pos.x -= nx * overlap * aw;
            a.pos.y -= ny * overlap * aw;
            b.pos.x += nx * overlap * bw;
            b.pos.y += ny * overlap * bw;
          }
        }
      }
    }
  }
}
