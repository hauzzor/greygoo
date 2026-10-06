---
name: deploy-after-build
description: >-
  Use after any production build in the Grey Goo project (npm.cmd run build,
  npm run build, vite build, or tsc). Every successful build must be committed
  and pushed to GitHub (origin/main) so GitHub Pages redeploys, then the live
  site is verified. Triggers: build, deploy, push, GitHub, npm run build,
  vite build, ship.
---

# Deploy after build

A build is **not done** until it is pushed to GitHub and the Pages deploy is
verified. Run this workflow every time a production build completes.

Project root: `C:\Users\phili\Desktop\vs code workspace\greygoo`
Remote: `origin` → `https://github.com/hauzzor/greygoo.git` (branch `main`)
Live site: `https://hauzzor.github.io/greygoo/`

## Build command

Node lives at `C:\Program Files\nodejs`; the `.ps1` npm shim is blocked, so use
`npm.cmd` with Node prepended to PATH:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
& "C:\Program Files\nodejs\npm.cmd" run build   # tsc && vite build
```

## After a successful build

1. **Commit if the tree is dirty.** Call the `commit_changes` tool with a
   concise message. If no clear message is available, use `chore: build+deploy`.
   Never push with uncommitted changes left behind.
2. **Push.** Only when on `main`, never force:

   ```powershell
   git -C "C:\Users\phili\Desktop\vs code workspace\greygoo" push origin main
   ```

3. **Verify the deploy.** `push` triggers `.github/workflows/deploy.yml`.
   Poll the run for the pushed SHA until it succeeds, then confirm the live
   site serves the new bundle:

   ```powershell
   $headers = @{ "User-Agent" = "greygoo-deploy-check"; "Accept" = "application/vnd.github+json" }
   $sha = git -C "C:\Users\phili\Desktop\vs code workspace\greygoo" rev-parse --short HEAD
   # poll https://api.github.com/repos/hauzzor/greygoo/actions/runs?per_page=5&branch=main
   #   for a run whose head_sha starts with $sha and status/conclusion == success
   Invoke-WebRequest "https://hauzzor.github.io/greygoo/" -UseBasicParsing
   #   -> status 200 and references the new dist/assets/index-*.js hash
   ```

   Report the run number, conclusion, and the confirmed live bundle hash.

## On failure

- **Build failed** → do **not** commit or push. Fix the error and rebuild.
- **Push failed** (auth/network) → leave the commit in place and surface the
  error; do not retry with `--force`.
- **Deploy run failed** → report the failing step (see the run's jobs URL);
  do not silently ignore it.

## Notes

- GitHub Actions runs its own `npm run build` on push; this skill's workflow is
  local → push → verify, so there is no loop.
- This is guidance, not enforcement. If a hard guarantee is ever needed, add an
  opencode plugin hook on the `bash` tool that performs the push automatically.
