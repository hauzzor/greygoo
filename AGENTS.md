# Grey Goo

Project folder: `C:\Users\phili\Desktop\vs code workspace\greygoo`

World of Goo–inspired browser game in a single, always-running zero-g
environment. Building blocks are **lying scattered across the map** — there is
no build-from-nothing. Pick a block up with the mouse and drag it into a
structure; dropping it within the connect radius of another block links it,
otherwise it is simply dropped loose. A Run/Pause button activates the blocks'
abilities (thrusters, sensors) so the cell navigates toward a goal.

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
- Sensor = blossom in its own identity colour (stable palette per sensor id);
  draws a faint "scent trail" to the goal while running. Its **signal blobs** are
  little translucent bubbles in the same colour, each carrying a direction
  chevron.
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
- **Single environment — no editor/sim split.** Physics (fluid damping) runs at
  all times.
- **No spawning.** A fixed pool of blocks is scattered around the origin at game
  start (`scatterBlocks`); the supply is finite.
- **Pick up / drag / connect.** Left-drag a block to pick it up. On release, if
  it is within the connect radius of another block it connects (beams form);
  otherwise it is dropped loose and at rest. Dragging a connected block
  **detaches** it (its beams are removed) — a plain click selects without
  detaching. Loose blocks are dynamic at rest and can be nudged by a moving
  structure.
- **The held ("ghost") block has no physical interaction**: `Node.ghost` makes
  it skip integration, separation, and beam collision, so it never pushes other
  blocks and can be dragged directly over them. It is rendered translucent while
  held.
- **Travellers:** every entity that moves along the structure — absorbed blocks
  (crawlers) and signal blobs. Each traveller picks a block in its own connected
  component as a movement goal (weighted: the more node-jumps away, the more
  likely, so far blocks are favoured) and travels there by the **shortest path**
  (BFS over beams, `nextStepToward`). On arriving it picks a new goal; if its
  goal is removed (or becomes unreachable) it immediately picks another. See
  `src/game/travellers.ts`.
- **Absorb & crawl (World-of-Goo style):** a loose block that collides with the
  structure (a beam or a structure block) is absorbed and then travels
  block-to-block **along the beams** as a kinematic, non-colliding traveller
  (crawler), following the shortest path to its current goal. The player can
  still grab a crawling block and place it. See `src/game/crawl.ts` (hooks
  `World.onAbsorb` / `onAbsorbNode`).
- Beams auto-form between blocks only when they are **50–100 apart**
  (`CONNECT_MIN`/`CONNECT_MAX` in `cell.ts`); **stiff springs** (rigidity `0.9`),
  a little wobbly but **non-breaking**. The settings panel is hidden, so the
  physics params use their defaults (thrust `600`, drag `1.5`).
- Beams are **solid**: a block cannot pass through a beam it is not attached to.
  `World.solveBeamCollision` treats each beam as a capsule and pushes out any
  node intersecting it (endpoints of the beam are ignored), using a spatial grid.
- **Beams never cross** (enforced when building, not during live motion).
  `beamWouldCross` (in `cell.ts`) rejects any connection that would properly
  intersect an existing beam — `autoConnect` and `previewConnections` both apply
  it, so the held preview never shows a crossing link. As a safety net,
  `removeCrossingBeams` deletes the **younger** beam of any crossing pair right
  after a drop (beams are ordered by creation; order survives undo).
- **Thruster direction is fixed at build time**: it points toward the
  (normalized, averaged) connected-neighbour positions **captured when its
  connections change** (`captureThrustDirection`, hooked to
  `World.onTopologyChange`), then frozen — later live motion does not change it.
  It is stored in `node.dirX/dirY` (used by physics and rendering). A thruster
  with no neighbours has no direction. When activated it thrusts **full force**
  along that direction (no goal weighting).
- **Sensor** emits **signal blobs** discretely (not an instant broadcast): every
  second while running, a connected and **emitting** sensor spawns one blob onto
  **each** of its beams. A blob captures the sensor's unit vector to the goal at
  emission (shown as a direction chevron) and moves beam-to-beam as a traveller
  (shortest path to a distance-weighted in-component goal). It **lives until it
  reaches a thruster**, which it fires and then vanishes (if the component has no
  thruster it roams indefinitely; a soft cap limits total blobs). A hit sets the
  thruster's `signalTimer` (`+1s`, capped at `3s`, staking on further hits).
  Pausing clears the blobs.
- **Individual sensor control**: clicking a sensor (select tool, no drag) opens
  a **context menu** next to the block; it lists that block's actions — for a
  sensor, an **Emission: On/Off** toggle that flips its `emitting` flag,
  pausing/resuming its signal emission without affecting other sensors. The menu
  is generic (per-block actions) and closes when clicking anywhere outside it.
  Clicking the same block again toggles the menu closed.
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

- Tools / keys `1` Drag (pick up & move), `2` Pan, `3` Delete.
- Left-drag a block to pick it up; prospective connections show as dashed lines.
  Release within the connect radius of another block to link it, or drop it
  loose. Dragging a connected block detaches it from the structure.
- **Delete** removes the clicked block (single click per block); `Delete` /
  `Backspace` removes the selected block.
- Click a block (select tool, no drag) to open its context menu next to it;
  click outside the menu to dismiss it.
- Right / middle mouse drag, or Pan tool + left drag, to pan. Wheel to zoom.
- `Space` toggles Run/Pause; `C` toggles camera lock; `Ctrl+Z` undoes.
- **Clear** resets the scene to the initial scattered supply.
- **New game** scatters the balanced set: ~14 Basic Cells, 5 Thrusters,
  3 Sensors, 1 Camera.

## File map

```
index.html            HUD markup (blocks, tools, actions, advanced sliders, stats)
src/main.ts           bootstrap, fixed 1/60 loop, tools, undo history, camera lock, input
src/style.css         frosted light-green HUD styling
src/core/vec2.ts      vector helpers
src/core/types.ts     BlockType, Node, Beam, Goal, Tool, WorldSnapshot
src/core/physics.ts   World: Verlet+stiff constraints, adjacency index, spatial-hash separation, snapshot/restore
src/core/cell.ts      adjacency BFS/autoConnect/preview, thrustDirection capture/sync
src/game/level.ts     goal definition
src/game/editor.ts    BLOCK_RADIUS, scatterBlocks (starting supply)
src/game/simulation.ts applyGuidance (signal-driven thruster firing); checkWin kept for future win logic
src/game/effects.ts   ambient life, thruster exhaust, placement/run/win FX
src/game/travellers.ts shared shortest-path movement for travellers (blocks/blobs)
src/game/crawl.ts     absorb-on-contact + traveller crawlers along beams
src/game/signals.ts   sensor signal-blob emission, travel + drawing
src/render/camera.ts  pan/zoom, world<->screen, follow, "kick" punch
src/render/sprites.ts offscreen sprite/tile cache (glow, background, particle dots)
src/render/particles.ts pooled particle system (world-space, sprite dots, additive glow)
src/render/renderer.ts cached background, goal, goo-ribbon beams, organic blobs, camera, held preview
src/ui/hud.ts         DOM wiring for tools/actions/sliders/camera dropdown/stats
src/ui/contextMenu.ts generic per-block context menu (anchored, outside-click dismiss)
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

## Reporting

While building, keep reports short and high-level: no lists of changed files
and no echoed commands. Only give detail when a write targets a path **outside**
the project directory. See the skill
`.opencode/skills/terse-build-reporting/SKILL.md`.

## Build & deploy

After **every successful build** (`npm.cmd run build`), commit any pending
changes (`commit_changes`), push to `origin/main`, and verify the Pages deploy.
See the skill `.opencode/skills/deploy-after-build/SKILL.md` for the full
workflow. A build is not done until it is pushed and the live site is verified.

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
