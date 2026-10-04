import type { Vec2 } from "./vec2";

export type BlockType = "goo" | "thruster" | "sensor";

export interface Node {
  id: number;
  type: BlockType;
  pos: Vec2;
  prev: Vec2;
  accel: Vec2;
  radius: number;
  invMass: number;
  firing: number;
}

export interface Ghost {
  type: BlockType;
  pos: Vec2;
  neighbours: number[];
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

export type Stage = "editor" | "sim";
export type Tool = BlockType | "pan";
