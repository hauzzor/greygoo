---
name: terse-build-reporting
description: >-
  Use whenever building or implementing changes in the Grey Goo project (edits,
  builds, commits, deploys). Keep progress and completion reports to a short,
  high-level summary — do NOT list changed files or echo executed commands.
  Only report in detail when a write targets a path outside the project
  directory. Triggers: build, implement, make changes, deploy, report.
---

# Terse build reporting

While building, communicate at a high level. The user does not want a running
log of files or commands.

## Rules

- **Summarise, don't enumerate.** Report progress and completion in 1–3 short
  lines: what changed at a high level and the result (e.g. "Added the reporting
  skill; committed.").
- **Never list changed/created/deleted files** and **never echo the commands**
  that were run, unless the user explicitly asks.
- **No pasted logs.** Do not dump `tsc`/build/test output; just say whether it
  passed.
- **Still do the work.** Verification (`tsc`, build), commits, pushes, and
  deploys all happen as normal (see `deploy-after-build`) — only the *reporting*
  is terse, e.g. "build clean; pushed `abc123`, deployed".
- **One line per milestone**, not per tool call. Multi-step tasks get a few
  short lines, not a transcript.

## The only exception: writes outside the project

Report in detail when a write/edit/bash operation would **create, modify, move,
or delete anything outside the project directory**:

- Project directory: `C:\Users\phili\Desktop\vs code workspace\greygoo`
  (everything under it, including `.opencode`, is *inside*).
- Anything else is *outside* — state the exact path, the operation, and why,
  before proceeding.

Failures are still surfaced, but briefly (what failed, one line) — not with
full logs unless asked.
