import { Container, Graphics, Sprite } from 'pixi.js';
import type { TiledMapRenderer } from './TiledMapRenderer';
import type { MonitorConfig } from './themeRegistry';

// The office tileset ships every desk PC twice: a dark, switched-off monitor
// (gids 365/366 + 381/382 — what the map paints) and the SAME monitor with a
// lit blue desktop (367/368 + 383/384). DeskScreen overlays the lit variant on
// a desk's monitor block while its agent is seated, plus a tiny screen-life
// animation (scrolling lines + a blinking cursor) so the PC visibly works when
// its owner does. Hidden, the map's off art shows through — no state to undo.

/** gid of the OFF monitor block's top-left tile, as painted in the office map.
 *  Default for the office theme; a theme supplies its own via MonitorConfig. */
export const MONITOR_OFF_TOPLEFT_GID = 365;
/** Matching ON tiles for the office theme, laid out 2×2 directly right of the
 *  off block — used when no per-theme MonitorConfig is passed. */
const DEFAULT_ON_GIDS: ReadonlyArray<readonly [number, number, number]> = [
  // [gid, dx, dy] in tiles relative to the block's top-left
  [367, 0, 0], [368, 1, 0],
  [383, 0, 1], [384, 1, 1]
];

/** Screen interior of the 2×2-tile monitor block, in local pixels — where
 *  the desktop is drawn in the tile art. Tier 2: the block is 2×2 tiles at
 *  the map's tile size (48×48 at 24px), so the interior scales from the
 *  16px-era 32×32 block by 1.5. The animation stays inside it. */
const SCREEN_16 = { x: 3, y: 5, w: 25, h: 12 };  // original 32×32-block values
const screenFor = (ts: number) => ({
  x: Math.round(SCREEN_16.x * (ts / 16)),
  y: Math.round(SCREEN_16.y * (ts / 16)),
  w: Math.round(SCREEN_16.w * (ts / 16)),
  h: Math.round(SCREEN_16.h * (ts / 16))
});

export class DeskScreen {
  readonly container = new Container();
  private anim = new Graphics();
  private on = false;
  private t = 0;

  constructor(private mapRenderer: TiledMapRenderer, topLeft: { x: number; y: number }, monitor?: MonitorConfig) {
    const ts = mapRenderer.tileSize;
    const onGids = monitor?.onGids ?? DEFAULT_ON_GIDS;
    for (const [gid, dx, dy] of onGids) {
      const tex = mapRenderer.textureForGid(gid);
      if (!tex) continue;
      const s = new Sprite(tex);
      s.x = dx * ts;
      s.y = dy * ts;
      this.container.addChild(s);
    }
    this.anim.eventMode = 'none';
    this.container.addChild(this.anim);
    this.container.x = topLeft.x * ts;
    this.container.y = topLeft.y * ts;
    // Sort with the characters: the block's bottom edge sits above the seated
    // agent's anchor row, so the avatar's head draws over the keyboard, not
    // under it — same painter's order the map art implies.
    this.container.zIndex = (topLeft.y + 2) * ts - 1;
    this.container.visible = false;
    this.container.eventMode = 'none';
  }

  /** Light the screen (agent sat down) or cut it (stood up / left). */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.container.visible = on;
    if (!on) { this.anim.clear(); this.t = 0; }
  }

  update(dt: number): void {
    if (!this.on) return;
    this.t += dt;
    const g = this.anim;
    const S = screenFor(this.mapRenderer.tileSize);
    g.clear();
    // Two faint "output" lines scrolling up the desktop, wrapping around —
    // the eternal build log — plus a cursor blinking in the lower left.
    for (let i = 0; i < 2; i++) {
      const phase = (this.t * 3.2 + i * (S.h / 2)) % S.h;
      const y = S.y + S.h - 1 - phase;
      const w = Math.round((6 + ((i * 7 + Math.floor(this.t / 1.7)) % 9)) * (this.mapRenderer.tileSize / 16));
      g.rect(S.x + 2, Math.round(y), w, 1).fill({ color: 0xcfe6ff, alpha: 0.55 });
    }
    if (Math.floor(this.t / 0.53) % 2 === 0) {
      const cur = Math.round(2 * (this.mapRenderer.tileSize / 16));
      g.rect(S.x + 2, S.y + S.h - 2, cur, cur).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
