import type { Vec2 } from "../core/vec2";

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  width = 0;
  height = 0;

  toWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.width / 2) / this.scale + this.x,
      y: (sy - this.height / 2) / this.scale + this.y,
    };
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.scale = Math.max(0.2, Math.min(4, this.scale * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  follow(target: Vec2, t: number): void {
    this.x += (target.x - this.x) * t;
    this.y += (target.y - this.y) * t;
  }
}
