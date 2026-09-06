import { Container, Graphics, Texture } from 'pixi.js';
import type { TiledMapRenderer } from './TiledMapRenderer';
import type { AmbientConfig, AmbientSpot } from './themeRegistry';

/**
 * AmbientLayer — the workshop's idle life (Art Bible §6 emissives in motion).
 *
 * Everything here runs on the shared ticker's `update(dt)` and paints OVER
 * the static tile art with translucent additive-feel graphics:
 *
 *  - `led`      : rack LEDs blinking in seeded per-bay patterns (each bay on
 *                 its own phase; a "hot" bay flickers faster than idle ones)
 *  - `strip`    : backlit wall strips breathing on a slow sine (lab lighting)
 *  - `pylon`    : holo-pylon shimmer — the hologram cube's alpha pulses and
 *                 a coolant drip falls from the emitter every few seconds
 *  - `steam`    : 2-3 wisps rising from the arc-ring charger, drifting on a
 *                 sine, fading out before they reach head height
 *  - `beam`     : window light beams — a soft translucent quad angling down
 *                 from each observation window, with dust motes drifting
 *                 inside it
 *  - `pulse`    : the event flourish — when a task completes anywhere on the
 *                 floor, a ring ripples outward from the holo-table once
 *
 * The layer reads its spot list from ThemeConfig.ambient (the map generator
 * prints it from the same layout constants that paint the tiles — regenerate
 * the map and you get the ambient list for free). Spots are tile coords;
 * everything scales with mapRenderer.tileSize.
 */
export class AmbientLayer {
  readonly container = new Container();
  private g = new Graphics();
  private t = 0;

  private spots: AmbientSpot[] = [];
  private tileSize = 24;
  /** pendingPulses: rings queued by task-done events; each animates once. */
  private pulses: Array<{ r: number; alpha: number }> = [];
  private pulseOrigin: { x: number; y: number } = { x: 0, y: 0 };
  private dripTimers: number[] = [];

  constructor(private mapRenderer: TiledMapRenderer, cfg?: AmbientConfig) {
    this.container.eventMode = 'none';
    this.container.addChild(this.g);
    if (cfg) this.applyConfig(cfg);
  }

  applyConfig(cfg: AmbientConfig): void {
    this.spots = cfg.spots;
    this.tileSize = this.mapRenderer.tileSize;
    this.pulseOrigin = cfg.pulseOrigin
      ? { x: cfg.pulseOrigin.x * this.tileSize, y: cfg.pulseOrigin.y * this.tileSize }
      : { x: 0, y: 0 };
    this.dripTimers = this.spots
      .filter((s) => s.kind === 'pylon')
      .map((s, i) => 1.5 + i * 0.9);   // staggered first drips
    this.g.clear();
  }

  /** The event flourish: one ripple from the pulse origin (the holo-table). */
  pulse(): void {
    this.pulses.push({ r: this.tileSize * 0.5, alpha: 0.85 });
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.g;
    const ts = this.tileSize;
    g.clear();

    for (const s of this.spots) {
      switch (s.kind) {
        case 'led': this.drawLed(g, s, ts); break;
        case 'strip': this.drawStrip(g, s, ts); break;
        case 'pylon': this.drawPylon(g, s, ts, dt); break;
        case 'steam': this.drawSteam(g, s, ts); break;
        case 'beam': this.drawBeam(g, s, ts); break;
      }
    }

    // pulse rings — expand + fade; remove finished ones
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.r += dt * ts * 3.2;             // ~3 tiles/sec
      p.alpha -= dt * 0.55;
      if (p.alpha <= 0) { this.pulses.splice(i, 1); continue; }
      g.circle(this.pulseOrigin.x, this.pulseOrigin.y, p.r)
        .stroke({ width: 2, color: 0x7fa8d9, alpha: p.alpha });
      g.circle(this.pulseOrigin.x, this.pulseOrigin.y, Math.max(1, p.r * 0.72))
        .stroke({ width: 1, color: 0xf4d35e, alpha: p.alpha * 0.5 });
    }
  }

  // ── spot painters ───────────────────────────────────────────────────────────
  /** Rack bay LED: blinks on a seeded phase; "hot" bays flicker 2× faster. */
  private drawLed(g: Graphics, s: AmbientSpot, ts: number): void {
    const period = s.hot ? 0.9 : 2.4 + (s.phase ?? 0) * 0.7;
    const on = ((this.t + (s.phase ?? 0) * 1.3) % period) < period * 0.72;
    if (!on) return;
    const x = s.x * ts + ts * 0.22, y = s.y * ts + ts * 0.42;
    g.rect(x, y, Math.max(2, ts * 0.12), Math.max(2, ts * 0.12))
      .fill({ color: s.color ?? 0x4090ff, alpha: s.hot ? 0.95 : 0.7 });
    // §6 halo: one dim pixel-ring at ~35%
    g.rect(x - 1, y - 1, Math.max(4, ts * 0.12) + 2, Math.max(4, ts * 0.12) + 2)
      .fill({ color: s.color ?? 0x4090ff, alpha: 0.22 });
  }

  /** Backlit strip: a slow breathing sine along a horizontal 2px band. */
  private drawStrip(g: Graphics, s: AmbientSpot, ts: number): void {
    const breathe = 0.55 + 0.45 * Math.sin(this.t * 0.9 + (s.phase ?? 0) * 2.1);
    const y = s.y * ts + ts * 0.30;
    const w = (s.len ?? 1) * ts;
    g.rect(s.x * ts + 2, y, w - 4, Math.max(2, ts * 0.1))
      .fill({ color: s.color ?? 0x266fd6, alpha: 0.35 * breathe });
  }

  /** Holo-pylon shimmer + a staggered coolant drip from the emitter. */
  private drawPylon(g: Graphics, s: AmbientSpot, ts: number, dt: number): void {
    const shimmer = 0.5 + 0.5 * Math.sin(this.t * 1.7 + (s.phase ?? 0) * 2.6);
    const cx = s.x * ts + ts / 2;
    // the hologram zone of the pylon tile (upper-middle where the cube floats)
    g.rect(s.x * ts + ts * 0.3, s.y * ts + ts * 0.42, ts * 0.4, ts * 0.34)
      .fill({ color: s.color ?? 0xf4d35e, alpha: 0.14 + 0.10 * shimmer });
    // coolant drip: falls ~1.2 tiles, resets on a per-spot cycle
    const idx = s.phase ?? 0;
    if (idx < this.dripTimers.length) this.dripTimers[idx] -= dt;
    const dripCycle = 3.2;
    const tt = 1 - Math.max(0, (this.dripTimers[idx] ?? 0) % dripCycle) / dripCycle;
    if (tt > 0 && tt < 1) {
      const dy = s.y * ts + ts * 0.30 + tt * ts * 1.2;
      g.rect(cx - 1, dy, 2, Math.max(2, ts * 0.10))
        .fill({ color: 0x7fd4ff, alpha: 0.7 * (1 - tt * 0.6) });
    }
  }

  /** Charger steam: two wisps rising with sine drift, fading by head height. */
  private drawSteam(g: Graphics, s: AmbientSpot, ts: number): void {
    const cx = s.x * ts + ts / 2;
    const baseY = s.y * ts + ts * 0.28;
    for (let i = 0; i < 2; i++) {
      const phase = this.t * 0.8 + i * 1.6;
      const life = (phase % 2.4) / 2.4;          // 0..1 over the wisp's life
      const rise = life * ts * 1.4;
      const drift = Math.sin(phase * 2.2 + i) * ts * 0.14;
      const a = Math.sin(Math.PI * life) * 0.28;
      g.circle(cx + drift + (i - 0.5) * ts * 0.16, baseY - rise, ts * (0.07 + life * 0.06))
        .fill({ color: 0xdfe9f4, alpha: a });
    }
  }

  /** Window beam: soft quad angling down-right, with motes drifting in it. */
  private drawBeam(g: Graphics, s: AmbientSpot, ts: number): void {
    const x0 = s.x * ts + ts * 0.2, y0 = s.y * ts + ts * 0.4;
    const w = ts * 0.9, h = ts * 2.1;
    // the beam — a parallelogram lit slanting into the room
    g.poly([x0, y0, x0 + w, y0, x0 + w + ts * 0.5, y0 + h, x0 + ts * 0.5, y0 + h])
      .fill({ color: 0xbfd8ff, alpha: 0.055 });
    // dust motes: 3 per beam, seeded offsets, slow downward drift in the band
    for (let i = 0; i < 3; i++) {
      const mt = (this.t * 0.11 + i * 0.37 + (s.phase ?? 0) * 0.19) % 1;
      const mx = x0 + w * (0.2 + 0.6 * ((i * 0.61 + (s.phase ?? 0) * 0.23) % 1)) + mt * ts * 0.5;
      const my = y0 + h * mt;
      g.circle(mx, my, Math.max(1, ts * 0.035))
        .fill({ color: 0xffffff, alpha: 0.35 * Math.sin(Math.PI * mt) * (0.5 + 0.5 * Math.sin(this.t * 0.6 + i)) });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
