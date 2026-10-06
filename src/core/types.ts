import type { Vec2 } from "./vec2";

export type BlockType = "cell" | "thruster" | "sensor" | "camera";

export interface Node {
  id: number;
  type: BlockType;
  pos: Vec2;
  prev: Vec2;
  accel: Vec2;
  radius: number;
  invMass: number;
  firing: number;
  dirX: number;
  dirY: number;
  ghost: boolean;
}

export interface Beam {
  a: number;
  b: number;
  rest: number;
}

export interface Goal {
  pos: Vec2;
  radius: number;
}

export interface NodeSnapshot {
  id: number;
  type: BlockType;
  x: number;
  y: number;
  radius: number;
}

export interface BeamSnapshot {
  a: number;
  b: number;
  rest: number;
}

export interface WorldSnapshot {
  nodes: NodeSnapshot[];
  beams: BeamSnapshot[];
  nextId: number;
}

export type Tool = "select" | "pan" | "delete";
