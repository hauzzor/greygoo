# Grey Goo

Project folder: `C:\Users\phili\Desktop\vs code workspace\greygoo`

World of Goo–inspired browser game: build a biological cell out of blocks
directly in a single, always-running zero-g environment. A Run/Pause button
activates the blocks' abilities (thrusters, sensors) so the cell navigates
toward a goal.

## Stack

- Vite + vanilla TypeScript (no framework), Canvas 2D rendering.
- Custom Verlet physics with stiff distance constraints ("rigid springs", still
  a little wobbly), no external physics lib.
- No runtime dependencies.

## Look & feel

Friendly, organic forest-puddle aesthetic (not scientific). Light forest-green
gradient background with dappled light; soft, glowing organic shapes.

- **Basic Cell** = irregular jelly blob (animated wobbly outline) with gloss and
  velocity-based squash/stretch.
- Thruster = warm firefly/seed that leaves a soft glowing plume.
- Sensor = blossom; draws a faint warm "scent trail" to the goal while running.
- Camera = pale-blue lens; a highlighted ring marks the camera block the locked
  camera is following.
- **Beams = goo/glue ribbons**: tapered, bulging where they meet cells, pinched
  in the middle, translucent with a wet highlight and a strain-driven wobble.
- Goal = pulsing sunbeam patch with expanding ripple rings and a blossom centre
  (no crosshair).
- Ambient life: drifting pollen motes and occasional rising bubbles.
- UI is frosted light-green glass (HUD stays visible), leaf-green accents.

All effects are procedural (Canvas 2D + a small particle pool); no image,
audio, or font assets. Performance matters (target 300+ blocks): soft glows and
the background come from **cached offscreen sprites/tiles**, all `shadowBlur`
is avoided, blocks/beams/particles are **viewport-culled**, the canvas uses a
**pixel budget** (≤2.5M px) to cap fill cost, and the HUD avoids
`backdrop-filter` (which forces a per-frame blur of the animating canvas). A
live **FPS/UPS/ms** tracker sits bottom-right.

## Commands

Node LTS is installed at `C:\Program Files\nodejs`. The `.ps1` npm shim is
blocked by execution policy, so use **`npm.cmd`** and prepend Node to PATH:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run build     # tsc + vite build
& "C:\Program Files\nodejs\npm.cmd" run dev -- --port 5173 --strictPort
```

Dev server PID is written to `%TEMP%\greygoo-dev.pid`; stop with
`taskkill /PID (Get-Content "$env:TEMP\greygoo-dev.pid") /T /F`.

npm 11 flags `esbuild`'s postinstall under its `allow-scripts` gate; build/dev
work regardless. If it ever breaks: `npm approve-scripts esbuild`.

## Game design (locked decisions)

- 2D, top-down, zero-g petri dish with fluid drag (no gravity).
- Blocks: **Basic Cell** (`cell`), **Thruster**, **Sensor**, **Camera**.
- **Single environment — no editor/sim split.** Blocks are placed directly into
  the running world; physics (fluid damping) runs at all times.
- Beams auto-form between blocks within the connect radius (slider, default
  `90`, max `320`); **stiff springs** (Advanced "Beam rigidity", default `0.9`),
  a little wobbly but **non-breaking**.
- Beams are **solid**: a block cannot pass through a beam it is not attached to.
  `World.solveBeamCollision` treats each beam as a capsule and pushes out any
  node intersecting it (endpoints of the beam are ignored), using a spatial grid.
- **Thruster thrust vector is derived live from its connected neighbours**: it
  points toward the (normalized, averaged) connected-neighbour positions. It is
  computed **once per frame** into `node.dirX/dirY` (used by both physics and
  rendering). A thruster with no neighbours produces no thrust.
- **Sensor** computes the unit vector to the goal and broadcasts it to all
  thrusters in its connected component. Each thruster fires along its own
  neighbour-derived direction, weighted by `max(0, dot(dir, goalDir))`
  (orientation-weighted) times thrust power.
- **Run/Pause** button (Space) toggles all abilities (thrusters + sensors)
  globally. Pausing zeroes every block's `firing`.
- **Camera block**: placing one adds it to a dropdown. A dedicated **Camera**
  button (C) locks the view to the selected camera block; unlocked, the view is
  panned by mouse drag.
- **Undo** (button / Ctrl+Z) is snapshot-based and unbounded; it covers every
  edit: placement, drag-move, delete, and clear.
- **Win condition is not implemented yet** (removed pending design). The goal is
  still drawn as a fixed marker at world `(760, 0)`, radius `72`.
- No build limits (unlimited blocks).
- New game starts with **one sensor** pre-placed at the origin (not undoable).

## Controls

- Blocks / keys `1` Basic Cell, `2` Thruster, `3` Sensor, `4` Camera.
- Tools / keys `5` Pan, `6` Select (no-spawn), `7` Delete.
- Left-click on empty space (with a block tool) starts **ghost placement**: a
  translucent preview with the connections it would form; release to commit,
  `Escape` to cancel. **Select** places nothing; **Delete** removes the clicked
  block (single click per block). `Delete` / `Backspace` removes the selected
  block.
- Drag an existing block to move it (re-runs auto-connect on release).
- Right / middle mouse drag, or Pan tool + left drag, to pan. Wheel to zoom.
- `Space` toggles Run/Pause; `C` toggles camera lock; `Ctrl+Z` undoes.

## File map

```
index.html            HUD markup (blocks, tools, actions, advanced sliders, stats)
src/main.ts           bootstrap, fixed 1/60 loop, tools, undo history, camera lock, input
src/style.css         frosted light-green HUD styling
src/core/vec2.ts      vector helpers
src/core/types.ts     BlockType, Node, Beam, Ghost, Goal, Tool, WorldSnapshot
src/core/physics.ts   World: Verlet+stiff constraints, adjacency index, spatial-hash separation, snapshot/restore
src/core/cell.ts      adjacency BFS/autoConnect/preview, thrustDirection + updateThrustDirections
src/game/level.ts     goal definition
src/game/editor.ts    BLOCK_RADIUS, placeBlock
src/game/simulation.ts applyGuidance (sensor->thrusters); checkWin kept for future win logic
src/game/effects.ts   ambient life, thruster exhaust, placement/run/win FX
src/render/camera.ts  pan/zoom, world<->screen, follow, "kick" punch
src/render/sprites.ts offscreen sprite/tile cache (glow, background, particle dots)
src/render/particles.ts pooled particle system (world-space, sprite dots, additive glow)
src/render/renderer.ts cached background, goal, goo-ribbon beams, organic blobs, camera, ghost
src/ui/hud.ts         DOM wiring for tools/actions/sliders/camera dropdown/stats
```

## How to continue in a new session

1. Open opencode in `C:\Users\phili\Desktop\vs code workspace\greygoo` (or cd
   there). This `AGENTS.md` is loaded automatically — no need to re-explain.
2. Run `npm install` if `node_modules` is missing, then `npm run dev`.
3. Optionally resume the prior chat: opencode keeps sessions in
   `C:\Users\phili\.local\share\opencode\opencode.db`; use the session picker /
   `--continue` in opencode. The DB also records the earlier planning session.

## Commits

Every change must end up in git. A project plugin (`.opencode/plugin/auto-commit.js`)
registers a **`commit_changes`** tool:

- At the end of **every logical task**, call `commit_changes` with a concise,
  specific message (what changed and why). This commits all pending changes in
  the repo (local only — **never push** unless the user asks).
- A safety-net fallback commits any leftover changes when opencode exits.

Auto-commit is local-only and respects `.gitignore`. Disable it for a run with
`OPENCODE_AUTOCOMMIT=off`. A `/commit <message>` command is also available.

## Deploy (GitHub Pages)

Remote: `https://github.com/hauzzor/greygoo.git`, branch `main`. Pushing to
`main` triggers `.github/workflows/deploy.yml` (build + deploy). Live at
`https://hauzzor.github.io/greygoo/` — `vite.config.ts` sets `base: /greygoo/`
for builds. Pages must be enabled once in repo Settings → Pages → Source:
**GitHub Actions** (the first workflow run failed at "Setup Pages" before it
was enabled).

## Possible next steps

- Define and implement the **win condition** (currently disabled; `checkWin`
  exists in `simulation.ts` but is not called).
- Goal placement (drag the goal marker) instead of fixed `(760,0)`.
- Multiple levels / moving or finishing targets; obstacles and collision terrain.
- Breakable beams under stress (World of Goo style) — currently soft but permanent.
- Thruster power / fuel budget and per-level build limits.
- Save/load cell designs (JSON / localStorage).
- Sound (procedural Web Audio, no assets) — visuals/particles are done, audio
  is not yet implemented.
