import type { Stage, Tool } from "../core/types";

export interface HudParams {
  power: number;
  drag: number;
  stiffness: number;
  connectRadius: number;
}

export interface HudHandlers {
  onTool: (tool: Tool) => void;
  onLaunch: () => void;
  onReset: () => void;
  onClear: () => void;
}

export interface Hud {
  setStage: (stage: Stage) => void;
  setStats: (nodes: number, beams: number, distance: number | null) => void;
  banner: (text: string | null) => void;
  setToolActive: (tool: Tool) => void;
  getTool: () => Tool;
  params: () => HudParams;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function createHud(handlers: HudHandlers): Hud {
  const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tool"));
  const stagePill = el<HTMLDivElement>("stage-pill");
  const bannerEl = el<HTMLDivElement>("banner");
  const bannerText = el<HTMLSpanElement>("banner-text");
  const hint = el<HTMLDivElement>("hint");

  const power = el<HTMLInputElement>("power");
  const drag = el<HTMLInputElement>("drag");
  const stiff = el<HTMLInputElement>("stiff");
  const connect = el<HTMLInputElement>("connect");
  const powerVal = el<HTMLElement>("power-val");
  const dragVal = el<HTMLElement>("drag-val");
  const stiffVal = el<HTMLElement>("stiff-val");
  const connectVal = el<HTMLElement>("connect-val");

  const statNodes = el<HTMLElement>("stat-nodes");
  const statBeams = el<HTMLElement>("stat-beams");
  const statDist = el<HTMLElement>("stat-dist");

  let activeTool: Tool = "goo";

  const syncLabel = (): void => {
    powerVal.textContent = power.value;
    dragVal.textContent = Number(drag.value).toFixed(1);
    stiffVal.textContent = Number(stiff.value).toFixed(2);
    connectVal.textContent = connect.value;
  };
  power.addEventListener("input", syncLabel);
  drag.addEventListener("input", syncLabel);
  stiff.addEventListener("input", syncLabel);
  connect.addEventListener("input", syncLabel);
  syncLabel();

  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      activeTool = button.dataset.tool as Tool;
      hud.setToolActive(activeTool);
      handlers.onTool(activeTool);
    });
  }

  el<HTMLButtonElement>("launch").addEventListener("click", handlers.onLaunch);
  el<HTMLButtonElement>("reset").addEventListener("click", handlers.onReset);
  el<HTMLButtonElement>("clear").addEventListener("click", handlers.onClear);

  const hud: Hud = {
    setStage(stage: Stage) {
      stagePill.textContent = stage === "editor" ? "EDITOR" : "SIMULATION";
      stagePill.classList.toggle("sim", stage === "sim");
      hint.innerHTML =
        stage === "editor"
          ? "Click &amp; release to place (preview shows connections) · drag a block to move · right-drag to pan · wheel to zoom"
          : "Cell is navigating autonomously · <b>Space</b> / Reset to keep building";
    },
    setStats(nodes, beams, distance) {
      statNodes.textContent = String(nodes);
      statBeams.textContent = String(beams);
      statDist.textContent = distance === null ? "–" : `${Math.round(distance)} px`;
    },
    banner(text) {
      if (text === null) {
        bannerEl.classList.add("hidden");
      } else {
        bannerText.textContent = text;
        bannerEl.classList.remove("hidden");
      }
    },
    setToolActive(tool: Tool) {
      activeTool = tool;
      for (const button of toolButtons) {
        button.classList.toggle("active", button.dataset.tool === tool);
      }
    },
    getTool: () => activeTool,
    params: () => ({
      power: Number(power.value),
      drag: Number(drag.value),
      stiffness: Number(stiff.value),
      connectRadius: Number(connect.value),
    }),
  };

  hud.setToolActive("goo");
  return hud;
}
