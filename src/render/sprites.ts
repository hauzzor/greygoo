const DPR = 2;

export class SpriteCache {
  private items = new Map<string, HTMLCanvasElement>();

  get(
    key: string,
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): HTMLCanvasElement {
    const existing = this.items.get(key);
    if (existing) return existing;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * DPR));
    canvas.height = Math.max(1, Math.ceil(height * DPR));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(DPR, DPR);
      draw(ctx);
    }
    this.items.set(key, canvas);
    return canvas;
  }
}

export const sprites = new SpriteCache();
