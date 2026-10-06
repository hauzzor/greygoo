import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const root = process.cwd();
const outfile = path.join(
  os.tmpdir(),
  `greygoo-simtest-${process.pid}-${Date.now()}.mjs`,
);

await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "scripts", "simtest.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  logLevel: "warning",
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
