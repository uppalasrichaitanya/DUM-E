# DUM-E Mission Log — first real missions

**Date:** 2026-09-08 · **Build:** dev (post v0.1.0, single-commit `33342a7e` line) · **Engine:** qwen-only · **Floor:** the Stark Workshop (40×26, 1525 tile sprites rendered — confirmed in dev log)

Mission A goal: prove the full delegation chain end-to-end (god spawns → reads board → delegates → worker executes → task done → reactor pulse). These are the findings, verbatim, in order of discovery.

---

## Finding 1 — qwen spawns dead on Windows (CRITICAL, fixed in-session)

**Symptom:** god (DUM-E, provider qwen) auto-spawned after onboarding; the floor showed it BOSS/idle; `window.cth.listPtys()` returned `{}` — the pty was already gone. The standup mission mail from the scheduler sat unread in god's inbox.

**Dev log (verbatim):**
```
[pty] Windows: "C:\Users\srich\AppData\Local\qwen-code\bin\qwen.cmd" could not be decoded as an npm shim — falling back to cmd.exe. A MULTI-LINE ARGUMENT IS PRESENT AND WILL BE TRUNCATED AT ITS FIRST NEWLINE. The agent will start and look healthy without ever receiving the hive protocol.
```

**Root cause chain (traced by reading the actual files):**
1. `qwen.cmd` (outer): `@echo off` + `call "…\qwen-code\bin\qwen.cmd" %*` — a launcher stub
2. Inner `qwen.cmd`: sets ROOT, then runs `"%ROOT%\node\node.exe" "%ROOT%\lib\cli-entry.js" %*` — a **self-contained install bundling its own Node**, not an npm shim
3. `pty.ts parseNpmCmdShim` correctly rejects it (it isn't an npm shim) → falls back to `cmd.exe /d /s /c` with the full argv string → cmd.exe **truncates at the first newline** → the multi-line hive protocol injection dies → qwen session starts identity-less (or exits) → pty dead while the floor/registry still show "idle"

**Fix (applied):** `parseBundledNodeCmd` in `pty.ts` — a second decoder that reads a .cmd looking for the `"<path>\node.exe" "<path>\entry.js"` invocation pattern, resolves both paths, and spawns them directly as an argv array (node.exe [entry.js] [args]) with the protocol intact — bypassing cmd.exe entirely. Registered before the generic fallback. (The pre-existing `withHiveRuntimeFallback` PATH logic already handles the bundled node's exec-ability.)

**Verification:** god re-spawned after fix — qwen TUI booted with the full hive protocol (identity block + inbox read visible in the PTY), pty stays alive in `listPtys()`, standup mail drains. Details below.

---

## Verified working (before the fix, via window.cth / CDP port 9222)

- **The workshop floor renders in the real app**: `[OfficeFloor] map 40x26, 1525 tile sprites rendered` (dev log)
- **Onboarding → qwen-first defaults**: fresh-state onboarding completed with `godProvider: qwen` written to config
- **God auto-spawn flow**: DUM-E registered in the hive as god (`hiveRegistry()`: name DUM-E, provider qwen, role orchestrator (god))
- **The scheduler is alive**: `OPS_STANDUP_MISSION` fired on its own cron and delivered "Hourly ops standup" mail into god's inbox (conversation conv-34458e) — the missions/triggers subsystem works unattended
- **The preload bridge + CDP debugging** work for deterministic UI/state inspection (191 cth methods reachable)
