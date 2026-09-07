# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [DUM-E 0.1.0] — 2026-09-04

DUM-E — the team's own agent hub, reshaped for our lab:

- **Rebranded**: appId `com.dume.hub`, `dum-e://` deep links, Windows pipe
  `dum-e-*`, generated robot-bust logo/icons; upstream marketing site, blog,
  hero card, and PostHog analytics removed entirely (internal tool — no
  telemetry out, update feed off until the team ships its own releases repo).
- **Engine roster trimmed to the team's set**: qwen (default) · claude · codex ·
  opencode · custom. Qwen-first defaults across config, onboarding, and the
  command center; model catalog + hire manifests accept the four engines.
- **Stark-lab floor**: 13-robot cast (DUM-E orchestrates; H.E.R.B.I.E, Vision,
  Ultron, MODOK, VERONICA, EDITH, LYLA, Rover, Sentinel, Doombots,
  Butterfingers), procedural robot sprite pipeline, lab-flavored break-room
  chatter, GodBooting power-up splash.
- **Original art only**: procedurally generated lab tilesets (same grid/gid
  layout as the old maps) replace the LimeZu atlases; the LimeZu license files
  are gone. ATTRIBUTION.md documents the generation tools.
- **Windows-first**: verified on Windows; the node-pty conpty patch + npm-shim
  decoding remain load-bearing.

<!-- DUM-E tracks its own changes from 0.1.0. -->
