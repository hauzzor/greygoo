import { World } from "../src/core/physics";
import { captureThrustDirection, syncThrustDirections } from "../src/core/cell";
import { applyGuidance, MAX_THRUST } from "../src/game/simulation";
import { clearSignals, updateSignals } from "../src/game/signals";
import {
  clearCrawlers,
  installCrawlHooks,
  isCrawling,
  updateCrawlers,
} from "../src/game/crawl";
import type { Goal } from "../src/core/types";

const DT = 1 / 60;
const POWER = 600;
const RADIUS = 14;

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function setup(world: World): void {
  world.params.damping = Math.exp(-1.5 * DT);
}

function connect(world: World, a: number, b: number): void {
  const na = world.nodes.get(a);
  const nb = world.nodes.get(b);
  if (!na || !nb) return;
  world.addBeam(a, b, Math.hypot(nb.pos.x - na.pos.x, nb.pos.y - na.pos.y));
}

function maxStep(world: World): number {
  let m = 0;
  for (const n of world.nodes.values()) {
    if (n.invMass === 0 || n.ghost) continue;
    m = Math.max(m, Math.hypot(n.pos.x - n.prev.x, n.pos.y - n.prev.y));
  }
  return m;
}

function allFinite(world: World): boolean {
  for (const n of world.nodes.values()) {
    if (!Number.isFinite(n.pos.x) || !Number.isFinite(n.pos.y)) return false;
  }
  return true;
}

function centroid(world: World): { x: number; y: number } {
  return world.centroid();
}

console.log("greygoo simulation tests\n");

// ---------------------------------------------------------------------------
console.log("1. Thrust direction stability");
{
  const w = new World();
  const t = w.addNode("thruster", { x: 0, y: 0 }, RADIUS);
  const a = w.addNode("cell", { x: 60, y: 0 }, RADIUS);
  const b = w.addNode("cell", { x: -30, y: 51.9615 }, RADIUS);
  const c = w.addNode("cell", { x: -30, y: -51.9615 }, RADIUS);
  connect(w, t.id, a.id);
  connect(w, t.id, b.id);
  connect(w, t.id, c.id);
  captureThrustDirection(w, t.id);
  check(
    "three symmetric neighbours cancel to no direction",
    t.dirX === 0 && t.dirY === 0,
    `dir=(${t.dirX},${t.dirY})`,
  );

  const w2 = new World();
  const t2 = w2.addNode("thruster", { x: 0, y: 0 }, RADIUS);
  const l = w2.addNode("cell", { x: -60, y: 0 }, RADIUS);
  const r = w2.addNode("cell", { x: 60, y: 0 }, RADIUS);
  connect(w2, t2.id, l.id);
  connect(w2, t2.id, r.id);
  captureThrustDirection(w2, t2.id);
  check(
    "opposed neighbours cancel to no direction",
    t2.dirX === 0 && t2.dirY === 0,
    `dir=(${t2.dirX},${t2.dirY})`,
  );

  const w3 = new World();
  const t3 = w3.addNode("thruster", { x: 0, y: 0 }, RADIUS);
  const only = w3.addNode("cell", { x: 60, y: 0 }, RADIUS);
  connect(w3, t3.id, only.id);
  captureThrustDirection(w3, t3.id);
  check(
    "single neighbour gives a clean unit direction",
    Math.abs(t3.dirX - 1) < 1e-9 && Math.abs(t3.dirY) < 1e-9,
    `dir=(${t3.dirX},${t3.dirY})`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. Global speed cap (single thruster, chain)");
{
  const w = new World();
  setup(w);
  const t = w.addNode("thruster", { x: 0, y: 0 }, RADIUS);
  let prev = t.id;
  for (let i = 1; i <= 4; i++) {
    const cell = w.addNode("cell", { x: 60 * i, y: 0 }, RADIUS);
    connect(w, prev, cell.id);
    prev = cell.id;
  }
  captureThrustDirection(w, t.id);
  t.signalGoalX = 1;
  t.signalGoalY = 0;

  let peak = 0;
  for (let s = 0; s < 600; s++) {
    t.impulse = true;
    applyGuidance(w, POWER, DT);
    w.step(DT);
    peak = Math.max(peak, maxStep(w));
  }
  const cap = w.params.maxSpeed * DT;
  check(
    "node speed never exceeds the global cap",
    peak <= cap * 1.001,
    `peak=${peak.toFixed(3)} cap=${cap.toFixed(3)}`,
  );
  check("positions stay finite", allFinite(w));
  const c = centroid(w);
  check("structure thrusts in +x", c.x > 20, `centroid.x=${c.x.toFixed(1)}`);
}

// ---------------------------------------------------------------------------
console.log("\n3. MAX_THRUST forces an identical trajectory above the cap");
{
  function run(power: number): { x: number; v: number } {
    const w = new World();
    setup(w);
    const t = w.addNode("thruster", { x: 0, y: 0 }, RADIUS);
    let prev = t.id;
    for (let i = 1; i <= 3; i++) {
      const cell = w.addNode("cell", { x: 60 * i, y: 0 }, RADIUS);
      connect(w, prev, cell.id);
      prev = cell.id;
    }
    captureThrustDirection(w, t.id);
    t.signalGoalX = 1;
    t.signalGoalY = 0;
    for (let s = 0; s < 120; s++) {
      t.impulse = true;
      applyGuidance(w, power, DT);
      w.step(DT);
    }
    return { x: t.pos.x, v: Math.hypot(t.pos.x - t.prev.x, t.pos.y - t.prev.y) };
  }
  const normal = run(POWER);
  const over = run(POWER * 100);
  check(
    "power above MAX_THRUST is clamped",
    Math.abs(normal.x - over.x) < 1e-6 && Math.abs(normal.v - over.v) < 1e-9,
    `x ${normal.x.toFixed(4)} vs ${over.x.toFixed(4)}`,
  );
  check("MAX_THRUST is the documented cap", MAX_THRUST === POWER);
}

// ---------------------------------------------------------------------------
console.log("\n4. Signals fire a single impulse (no sustained burn)");
{
  const w = new World();
  setup(w);
  clearSignals();
  const t = w.addNode("thruster", { x: 0, y: 0 }, RADIUS);
  const sensor = w.addNode("sensor", { x: 60, y: 0 }, RADIUS);
  connect(w, t.id, sensor.id);
  sensor.emitting = true;
  captureThrustDirection(w, t.id);
  const goal: Goal = { pos: { x: 1000, y: 0 }, radius: 72 };

  let firedFrames = 0;
  let run = 0;
  let maxRun = 0;
  let peak = 0;
  for (let s = 0; s < 300; s++) {
    updateSignals(w, goal, DT);
    applyGuidance(w, POWER, DT);
    if (t.firing > 0.01) {
      firedFrames++;
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
    w.step(DT);
    peak = Math.max(peak, maxStep(w));
  }
  check("thruster did fire", firedFrames > 0, `firedFrames=${firedFrames}`);
  check(
    "impulse is brief, not a sustained burn",
    maxRun < 30,
    `maxRun=${maxRun} frames`,
  );
  check("positions stay finite", allFinite(w));
  const cap = w.params.maxSpeed * DT;
  check(
    "impulse respects the global speed cap",
    peak <= cap * 1.001,
    `peak=${peak.toFixed(3)} cap=${cap.toFixed(3)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n4b. Thruster only fires when aimed toward the goal");
{
  const w = new World();
  setup(w);
  const t = w.addNode("thruster", { x: 0, y: 0 }, RADIUS);
  const cell = w.addNode("cell", { x: 60, y: 0 }, RADIUS);
  connect(w, t.id, cell.id);
  captureThrustDirection(w, t.id);
  t.signalGoalX = -1;
  t.signalGoalY = 0;

  for (let s = 0; s < 60; s++) {
    t.impulse = true;
    applyGuidance(w, POWER, DT);
    w.step(DT);
  }
  check(
    "thruster aimed away does not fire",
    t.firing === 0,
    `firing=${t.firing}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. Large looped structure, continuous emission, 60s");
{
  const w = new World();
  setup(w);
  clearSignals();
  const cols = 10;
  const rows = 8;
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push([]);
    for (let c = 0; c < cols; c++) {
      grid[r].push(w.addNode("cell", { x: c * 60, y: r * 60 }, RADIUS).id);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) connect(w, grid[r][c], grid[r][c + 1]);
      if (r + 1 < rows) connect(w, grid[r][c], grid[r + 1][c]);
    }
  }
  const thrusters = [
    w.addNode("thruster", { x: -60, y: -60 }, RADIUS),
    w.addNode("thruster", { x: cols * 60, y: -60 }, RADIUS),
    w.addNode("thruster", { x: -60, y: rows * 60 }, RADIUS),
  ];
  connect(w, thrusters[0].id, grid[0][0]);
  connect(w, thrusters[1].id, grid[0][cols - 1]);
  connect(w, thrusters[2].id, grid[rows - 1][0]);
  const sensor = w.addNode("sensor", { x: 4 * 60, y: 3 * 60 }, RADIUS);
  connect(w, sensor.id, grid[3][4]);
  sensor.emitting = true;
  syncThrustDirections(w);
  const goal: Goal = { pos: { x: 5000, y: 5000 }, radius: 72 };

  let peak = 0;
  let finite = true;
  for (let s = 0; s < 3600; s++) {
    updateSignals(w, goal, DT);
    applyGuidance(w, POWER, DT);
    w.step(DT);
    peak = Math.max(peak, maxStep(w));
    if (s % 600 === 0 && !allFinite(w)) {
      finite = false;
      break;
    }
  }
  const cap = w.params.maxSpeed * DT;
  check("large structure stays finite for 60s", finite && allFinite(w));
  check(
    "large structure never exceeds the global cap",
    peak <= cap * 1.001,
    `peak=${peak.toFixed(3)} cap=${cap.toFixed(3)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n6. Overlapping spawns cannot spike past the cap");
{
  const w = new World();
  setup(w);
  for (let i = 0; i < 10; i++) {
    w.addNode("cell", { x: (i % 3) * 3, y: Math.floor(i / 3) * 3 }, RADIUS);
  }
  let peak = 0;
  for (let s = 0; s < 300; s++) {
    w.step(DT);
    peak = Math.max(peak, maxStep(w));
  }
  const cap = w.params.maxSpeed * DT;
  check(
    "separation solver spikes are clamped",
    peak <= cap * 1.001,
    `peak=${peak.toFixed(3)} cap=${cap.toFixed(3)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. Absorb & crawl still works");
{
  const w = new World();
  setup(w);
  clearCrawlers();
  installCrawlHooks(w);
  const a = w.addNode("cell", { x: 0, y: 0 }, RADIUS);
  const b = w.addNode("cell", { x: 60, y: 0 }, RADIUS);
  connect(w, a.id, b.id);
  const loose = w.addNode("cell", { x: 30, y: 0 }, RADIUS);

  let finite = true;
  for (let s = 0; s < 120; s++) {
    w.step(DT);
    updateCrawlers(w, DT);
    if (!allFinite(w)) {
      finite = false;
      break;
    }
  }
  check("crawl loop runs finite", finite);
  check(
    "loose block was absorbed onto the structure",
    isCrawling(loose.id) || w.degree(loose.id) > 0,
  );
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(`failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("all simulation tests passed");
