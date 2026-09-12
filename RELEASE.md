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

## v0.1.1 — the first mission's fix

**Fixes agents spawning dead on Windows when using the qwen engine.**

- The qwen-code Windows install ships as a self-contained tree (its own
  node.exe + entry script behind a two-hop `.cmd` launcher) — not an npm
  shim. DUM-E's old launcher decoder rejected it, and the cmd.exe fallback
  truncated the hive protocol at its first newline: agents started
  identity-less and exited while the floor still showed "idle".
- DUM-E now decodes that launcher family and spawns the bundled node
  directly, protocol intact (found live during the first real mission —
  see docs/MISSION-LOG.md in the repo).

**Install:** run the setup exe for a normal install (Start-menu shortcut +
`dum-e://` deep links), or the portable exe to run without installing.
Requirements: Windows 10+ x64 and internet on first use (DUM-E installs Node
and the missing agent CLIs itself, via nodejs.org / npm).

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
