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

const MOTE_WHITE: [number, number, number] = [234, 251, 224];

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

  draw(ctx: CanvasRenderingContext2D): void {
    let glowed = false;
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const fade = t > 0.85 ? (1 - t) / 0.15 : t / 0.85;
      const a = p.alpha * Math.max(0, Math.min(1, fade));
      if (a <= 0.01) continue;

      if (p.glow !== glowed) {
        ctx.globalCompositeOperation = p.glow ? "lighter" : "source-over";
        glowed = p.glow;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${a})`;
      ctx.fill();
    }
    if (glowed) ctx.globalCompositeOperation = "source-over";
  }

  clear(): void {
    this.items.length = 0;
  }

  get count(): number {
    return this.items.length;
  }
}
