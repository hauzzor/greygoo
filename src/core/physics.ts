import type { BlockType, Beam, Node } from "./types";
import { v } from "./vec2";

export interface PhysicsParams {
  damping: number;
  stiffness: number;
  iterations: number;
  maxVelocity: number;
}

export class World {
  nodes = new Map<number, Node>();
  beams: Beam[] = [];
  nextId = 1;
  params: PhysicsParams = {
    damping: 0.99,
    stiffness: 0.5,
    iterations: 8,
    maxVelocity: 40,
  };

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
    };
    this.nodes.set(node.id, node);
    return node;
  }

  removeNode(id: number): void {
    this.nodes.delete(id);
    this.beams = this.beams.filter((b) => b.a !== id && b.b !== id);
  }

  clear(): void {
    this.nodes.clear();
    this.beams = [];
    this.nextId = 1;
  }

  connected(a: number, b: number): boolean {
    return this.beams.some(
      (beam) => (beam.a === a && beam.b === b) || (beam.a === b && beam.b === a),
    );
  }

  degree(id: number): number {
    let n = 0;
    for (const beam of this.beams) if (beam.a === id || beam.b === id) n++;
    return n;
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

  step(dt: number): void {
    const { damping, maxVelocity } = this.params;

    for (const n of this.nodes.values()) {
      if (n.invMass === 0) {
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

  private solveSeparation(): void {
    const arr = [...this.nodes.values()];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min || d === 0) continue;

        const total = a.invMass + b.invMass;
        if (total === 0) continue;

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
