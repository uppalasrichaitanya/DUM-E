# DUM-E release notes

<!-- Release-runner notes (not rendered on GitHub release pages):

  1. Releases are tagged `v<version>` on the `dum-e` branch (e.g. v0.2.0).
  2. Update-checks are DISABLED in-app (src/main/updater.ts, UPDATES_ENABLED=false)
     — the team installs from the repo's release page directly. When a team
     release feed is set up, flip UPDATES_ENABLED and point the REPO constant
     plus electron-builder.yml's publish block at this repository.
  3. Before tagging: run the full battery (typecheck x2, test:focused,
     build, dev smoke) and `npm run dist:win` elevated once for the NSIS
     installer (the unpacked exe needs no elevation).
-->

## v0.1.0 — the first lab

**The agent hub for our team — the Stark Workshop release.**

- The workshop floor: god's enclosed workshop, the central holo-table, the
  server-rack wall with observation windows, and the charging-bay room —
  generated in-repo with self-tests, rendered at 24px tiles with 24x48 robots.
- Engine roster: Qwen Code (default) · Claude Code · Codex · OpenCode.
- The robot cast: DUM-E orchestrates H.E.R.B.I.E, Vision, Ultron, MODOK,
  VERONICA, EDITH, LYLA, Rover, Sentinel, Doombots, and Butterfingers.
- Ambient life: rack LEDs blink, pylons shimmer, the charger steams, robots
  bob and blink, and a reactor pulse ripples from the holo-table when any
  task completes.
- Original art only — cast, tilesets, icons, and the brand mark are all
  generated in this repo (see docs/ART-TECHNIQUES.md).
