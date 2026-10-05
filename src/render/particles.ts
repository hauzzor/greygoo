import { sprites } from "./sprites";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  drag: number;
  glow: boolean;
  alpha: number;
}

export interface EmitOptions {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  color?: [number, number, number];
  drag?: number;
  glow?: boolean;
  alpha?: number;
}

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MOTE_WHITE: [number, number, number] = [234, 251, 224];
const DOT_SIZE = 16;

function dotSprite(r: number, g: number, b: number): HTMLCanvasElement {
  return sprites.get(`dot|${r}|${g}|${b}`, DOT_SIZE, DOT_SIZE, (ctx) => {
    const half = DOT_SIZE / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.5)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DOT_SIZE, DOT_SIZE);
  });
}

export class Particles {
  private items: Particle[] = [];

  constructor(private readonly max = 1200) {}

  emit(opts: EmitOptions): void {
    if (this.items.length >= this.max) this.items.shift();
    const color = opts.color ?? MOTE_WHITE;
    const life = opts.life ?? 1.4;
    this.items.push({
      x: opts.x,
      y: opts.y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      life,
      maxLife: life,
      size: opts.size ?? 2,
      r: color[0],
      g: color[1],
      b: color[2],
      drag: opts.drag ?? 0.98,
      glow: opts.glow ?? false,
      alpha: opts.alpha ?? 0.8,
    });
  }

  burst(
    x: number,
    y: number,
    count: number,
    opts: Partial<EmitOptions> = {},
  ): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 18 + Math.random() * 42;
      this.emit({
        ...opts,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
      });
    }
  }

  update(dt: number): void {
    const items = this.items;
    let write = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life > 0) items[write++] = p;
    }
    items.length = write;
  }

  draw(ctx: CanvasRenderingContext2D, view?: View): void {
    let glowed = false;
    for (const p of this.items) {
      if (
        view &&
        (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1)
      ) {
        continue;
      }

      const t = p.life / p.maxLife;
      const fade = t > 0.85 ? (1 - t) / 0.15 : t / 0.85;
      const a = p.alpha * Math.max(0, Math.min(1, fade));
      if (a <= 0.01) continue;

      if (p.glow !== glowed) {
        ctx.globalCompositeOperation = p.glow ? "lighter" : "source-over";
        glowed = p.glow;
      }

      const size = p.size * (1.5 + t * 1.5);
      ctx.globalAlpha = a;
      ctx.drawImage(dotSprite(p.r, p.g, p.b), p.x - size, p.y - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    if (glowed) ctx.globalCompositeOperation = "source-over";
  }

  clear(): void {
    this.items.length = 0;
  }

  get count(): number {
    return this.items.length;
  }
}
