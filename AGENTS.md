# Grey Goo

Project folder: `C:\Users\phili\Desktop\vs code workspace\greygoo`

World of Goo–inspired browser game: build a biological cell out of blocks in an
editor, then launch it into a zero-g environment where it navigates to a goal
autonomously.

## Stack

- Vite + vanilla TypeScript (no framework), Canvas 2D rendering.
- Custom Verlet physics with soft distance constraints (no external physics lib).
- No runtime dependencies.

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
- Blocks: **Goo ball**, **Thruster**, **Sensor**.
- Beams auto-form between blocks within the connect radius; soft/wobbly and
  **non-breaking**.
- **Thruster thrust vector is derived live from its connected neighbours**: it
  points toward the (normalized, averaged) connected-neighbour positions and is
  recomputed every frame. A thruster with no neighbours produces no thrust.
- **Sensor** computes the unit vector to the goal and broadcasts it to all
  thrusters in its connected component. Each thruster fires along its own
  neighbour-derived direction, weighted by `max(0, dot(dir, goalDir))`
  (orientation-weighted) times thrust power.
- Stage 1 = **Editor**; Stage 2 = **Simulation**. Stage 2 is fully autonomous.
- **Win** when any block touches the goal radius. Goal is a fixed marker at
  world `(760, 0)`, radius `72`.
- No build limits (unlimited blocks).
- New game starts with **one sensor** pre-placed at the origin.
- **Reset** restores every block to the position it had in the editor at the
  moment Launch was pressed (snapshot taken on launch), and recenters camera.

## Controls

- Palette / keys `1` Goo, `2` Thruster, `3` Sensor, `4` Pan.
- Left-click on empty space starts **ghost placement**: a translucent preview
  with the connections it would form; release to commit, `Escape` to cancel.
- Drag an existing block to move it (re-runs auto-connect on release).
- Right / middle mouse drag, or Pan tool + left drag, to pan. Wheel to zoom.
- `Delete` / `Backspace` removes the selected block; `Space` launches / resets.

## File map

```
index.html            HUD markup (palette, actions, sliders, stats, banner)
src/main.ts           bootstrap, game loop (fixed 1/60), stage machine, input
src/style.css         dark HUD styling
src/core/vec2.ts      vector helpers
src/core/types.ts     BlockType, Node, Beam, Ghost, Goal, Stage, Tool
src/core/physics.ts   World: Verlet integration, beam constraints, separation
src/core/cell.ts      connectivity BFS, autoConnect, previewConnections, thrustDirection
src/game/level.ts     goal definition
src/game/editor.ts    BLOCK_RADIUS, placeBlock
src/game/simulation.ts applyGuidance (sensor->thrusters), checkWin
src/render/camera.ts  pan/zoom, world<->screen, follow
src/render/renderer.ts grid, goal, beams, blocks, ghost preview
src/ui/hud.ts         DOM wiring for palette/sliders/stats, hint text
```

## How to continue in a new session

1. Open opencode in `C:\Users\phili\Desktop\vs code workspace\greygoo` (or cd
   there). This `AGENTS.md` is loaded automatically — no need to re-explain.
2. Run `npm install` if `node_modules` is missing, then `npm run dev`.
3. Optionally resume the prior chat: opencode keeps sessions in
   `C:\Users\phili\.local\share\opencode\opencode.db`; use the session picker /
   `--continue` in opencode. The DB also records the earlier planning session.

## Possible next steps

- Goal placement in the editor (drag the goal marker) instead of fixed `(760,0)`.
- Multiple levels / moving or finishing targets; obstacles and collision terrain.
- Breakable beams under stress (World of Goo style) — currently soft but permanent.
- Thruster power / fuel budget and per-level build limits.
- Save/load cell designs (JSON / localStorage).
- Sound and visual polish (trails, particles, win animation).
