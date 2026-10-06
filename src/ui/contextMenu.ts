export interface MenuAction {
  label: string;
  on?: boolean;
  onSelect: () => void;
}

export interface MenuModel {
  title: string;
  actions: MenuAction[];
}

export interface ContextMenu {
  open: (
    sx: number,
    sy: number,
    anchorRadius: number,
    model: () => MenuModel | null,
  ) => void;
  anchor: (sx: number, sy: number, anchorRadius: number) => void;
  close: () => void;
  contains: (target: EventTarget | null) => boolean;
  isOpen: () => boolean;
}

export function createContextMenu(): ContextMenu {
  const root = document.createElement("div");
  root.className = "context-menu hidden";
  document.body.appendChild(root);

  let model: (() => MenuModel | null) | null = null;
  let px = 0;
  let py = 0;
  let pr = 0;

  function position(): void {
    root.style.left = "0px";
    root.style.top = "0px";
    const rect = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = px + pr + 14;
    if (x + rect.width > vw - 8) x = px - pr - 14 - rect.width;
    if (x < 8) x = 8;

    let y = py - rect.height / 2;
    if (y + rect.height > vh - 8) y = vh - 8 - rect.height;
    if (y < 8) y = 8;

    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
  }

  function render(): void {
    if (!model) {
      close();
      return;
    }
    const m = model();
    if (!m) {
      close();
      return;
    }

    root.innerHTML = "";

    const title = document.createElement("div");
    title.className = "context-menu-title";
    title.textContent = m.title;
    root.appendChild(title);

    for (const action of m.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "context-menu-item";
      if (action.on) button.classList.add("on");
      button.textContent = action.label;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        action.onSelect();
        render();
      });
      root.appendChild(button);
    }

    position();
  }

  function open(
    sx: number,
    sy: number,
    anchorRadius: number,
    nextModel: () => MenuModel | null,
  ): void {
    model = nextModel;
    px = sx;
    py = sy;
    pr = anchorRadius;
    root.classList.remove("hidden");
    render();
    position();
  }

  function anchor(sx: number, sy: number, anchorRadius: number): void {
    px = sx;
    py = sy;
    pr = anchorRadius;
    if (isOpen()) position();
  }

  function close(): void {
    model = null;
    root.classList.add("hidden");
  }

  function contains(target: EventTarget | null): boolean {
    return target instanceof Node && root.contains(target);
  }

  function isOpen(): boolean {
    return !root.classList.contains("hidden");
  }

  return { open, anchor, close, contains, isOpen };
}
