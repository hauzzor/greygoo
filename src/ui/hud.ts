import type { Tool } from "../core/types";

export interface HudParams {
  power: number;
  drag: number;
  stiffness: number;
}

export interface CameraOption {
  id: number;
  label: string;
}

export interface HudHandlers {
  onTool: (tool: Tool) => void;
  onToggleRun: () => void;
  onToggleCamera: () => void;
  onSelectCamera: (id: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

export interface Hud {
  setRunning: (running: boolean) => void;
  setCameraLock: (locked: boolean) => void;
  setCameraOptions: (options: CameraOption[], selectedId: number | null) => void;
  setStats: (
    nodes: number,
    beams: number,
    distance: number | null,
    loose: number,
  ) => void;
  setPerf: (fps: number, ups: number, ms: number) => void;
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

  const runBtn = el<HTMLButtonElement>("run");
  const cameraBtn = el<HTMLButtonElement>("camera-toggle");
  const cameraSelect = el<HTMLSelectElement>("camera-select");
  const undoBtn = el<HTMLButtonElement>("undo");
  const clearBtn = el<HTMLButtonElement>("clear");

  const power = el<HTMLInputElement>("power");
  const drag = el<HTMLInputElement>("drag");
  const stiff = el<HTMLInputElement>("stiff");
  const powerVal = el<HTMLElement>("power-val");
  const dragVal = el<HTMLElement>("drag-val");
  const stiffVal = el<HTMLElement>("stiff-val");

  const statNodes = el<HTMLElement>("stat-nodes");
  const statBeams = el<HTMLElement>("stat-beams");
  const statLoose = el<HTMLElement>("stat-loose");
  const statDist = el<HTMLElement>("stat-dist");
  const perfEl = el<HTMLDivElement>("perf");

  let activeTool: Tool = "select";
  let optionsKey = "";

  const syncLabel = (): void => {
    powerVal.textContent = power.value;
    dragVal.textContent = Number(drag.value).toFixed(1);
    stiffVal.textContent = Number(stiff.value).toFixed(2);
  };
  power.addEventListener("input", syncLabel);
  drag.addEventListener("input", syncLabel);
  stiff.addEventListener("input", syncLabel);
  syncLabel();

  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      activeTool = button.dataset.tool as Tool;
      hud.setToolActive(activeTool);
      handlers.onTool(activeTool);
    });
  }

  runBtn.addEventListener("click", handlers.onToggleRun);
  cameraBtn.addEventListener("click", handlers.onToggleCamera);
  undoBtn.addEventListener("click", handlers.onUndo);
  clearBtn.addEventListener("click", handlers.onClear);
  cameraSelect.addEventListener("change", () => {
    if (cameraSelect.value === "") return;
    handlers.onSelectCamera(Number(cameraSelect.value));
  });

  const hud: Hud = {
    setRunning(running: boolean) {
      runBtn.textContent = running ? "Pause" : "Run";
      runBtn.classList.toggle("on", running);
      stagePill.textContent = running ? "RUNNING" : "BUILDING";
      stagePill.classList.toggle("running", running);
    },
    setCameraLock(locked: boolean) {
      cameraBtn.classList.toggle("on", locked);
    },
    setCameraOptions(options, selectedId) {
      const key = options.map((o) => o.id).join(",");
      if (key !== optionsKey) {
        optionsKey = key;
        cameraSelect.innerHTML = "";
        if (options.length === 0) {
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "No camera";
          cameraSelect.appendChild(empty);
        } else {
          for (const option of options) {
            const opt = document.createElement("option");
            opt.value = String(option.id);
            opt.textContent = option.label;
            cameraSelect.appendChild(opt);
          }
        }
      }
      cameraSelect.value = selectedId === null ? "" : String(selectedId);
      cameraSelect.disabled = options.length === 0;
      cameraBtn.disabled = options.length === 0;
    },
    setStats(nodes, beams, distance, loose) {
      statNodes.textContent = String(nodes);
      statBeams.textContent = String(beams);
      statLoose.textContent = String(loose);
      statDist.textContent = distance === null ? "–" : `${Math.round(distance)} px`;
    },
    setPerf(fps, ups, ms) {
      perfEl.textContent =
        `FPS ${Math.round(fps)} · UPS ${Math.round(ups)} · ${ms.toFixed(1)} ms`;
      perfEl.classList.toggle("bad", fps < 35);
      perfEl.classList.toggle("warn", fps >= 35 && fps < 52);
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
    }),
  };

  hud.setToolActive("select");
  return hud;
}
