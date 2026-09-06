import { AnimatedSprite, Container, Graphics, Texture } from 'pixi.js';

export type Direction = 'down' | 'up' | 'right' | 'left';
export type AnimState = 'walk' | 'type' | 'read' | 'idle';

// Output rows from SpriteAdapter: down=0, up=1, right=2 (left = flipped right)
const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

const ANIM_FRAMES: Record<AnimState, number[]> = {
  walk: [0, 1, 2, 1],
  type: [0, 1, 2, 1],
  read: [0, 1, 2, 1],
  idle: [0],
};

// Render characters a bit larger than their native 18×32 so heads/faces read
// clearly on the floor. Applied to the container so the leg-crop mask (a child)
// scales with the sprite and stays aligned.
const CHAR_SCALE = 1.08;

/** Ported from shahar061/the-office (office/characters/CharacterSprite.ts). */
export class CharacterSprite {
  readonly container: Container;
  private sprite: AnimatedSprite;
  private frames: Texture[][];
  private currentDirection: Direction = 'down';
  private currentAnim: AnimState = 'idle';
  private frameSpeed = 0.15;
  private frameW: number;
  private frameH: number;
  private cropMask: Graphics | null = null;

  constructor(frames: Texture[][]) {
    this.frames = frames;
    this.container = new Container();

    const initialFrames = this.getFrames('down', 'idle');
    this.sprite = new AnimatedSprite(initialFrames);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.animationSpeed = this.frameSpeed;
    this.sprite.play();
    // Anchor is (0.5, 1): in container space the sprite spans x∈[-w/2, w/2],
    // y∈[-h, 0] (feet at the origin). Used by the seated leg-crop mask.
    this.frameW = this.sprite.texture.frame.width || this.sprite.width || 16;
    this.frameH = this.sprite.texture.frame.height || this.sprite.height || 32;

    this.container.addChild(this.sprite);
    this.container.scale.set(CHAR_SCALE);
  }

  /**
   * Crop `cropPx` off the bottom of the sprite (the legs) so a seated agent
   * reads as tucked under the desk instead of standing on top of it. Pass 0 to
   * clear the crop (standing / walking). The mask only covers the sprite, so
   * status glyphs / bubbles parented elsewhere are unaffected.
   */
  setSeatedCrop(cropPx: number): void {
    if (cropPx <= 0) {
      if (this.cropMask) {
        this.sprite.mask = null;
        this.cropMask.visible = false;
      }
      return;
    }
    if (!this.cropMask) {
      this.cropMask = new Graphics();
      this.container.addChild(this.cropMask);
    }
    const w = this.frameW;
    const h = this.frameH;
    this.cropMask.clear();
    // Keep the top (h - cropPx) of the sprite; reveal whatever (the desk) is
    // behind where the legs were.
    this.cropMask
      .rect(-w / 2 - 2, -h - 2, w + 4, h - cropPx + 2)
      .fill(0xffffff);
    this.cropMask.visible = true;
    this.sprite.mask = this.cropMask;
  }

  private getFrames(direction: Direction, anim: AnimState): Texture[] {
    const row = DIRECTION_ROW[direction];
    return ANIM_FRAMES[anim].map((col) => this.frames[row][col]);
  }

  // ── idle life ─────────────────────────────────────────────────────────────
  // The frame grid has no dedicated blink frame (frames are shared across the
  // cast), so the blink is a 2px translucent lid painted over the face-screen
  // rows (the top ~40% of the sprite at the 24px Tier 2 dims) for ~130ms,
  // every 2.6-4.2s (seeded per instance so a row of robots doesn't blink in
  // unison). The bob lifts the whole sprite ≤1px on a slow sine while idle —
  // cheap, and it reads as breathing without touching the gait system.
  private blinkGraphics: Graphics | null = null;
  private blinkNext = 2 + Math.random() * 2.2;
  private blinkT = -1;
  private bobT = Math.random() * Math.PI * 2;
  private static readonly BLINK_LID_MS = 0.13;

  update(dt: number): void {
    // bob only while idle — walking/typing animation already moves
    if (this.currentAnim === 'idle' && this.cropMask?.visible !== true) {
      this.bobT += dt * 1.6;
      this.sprite.y = -Math.max(0, Math.sin(this.bobT)) * 1;
    } else {
      this.sprite.y = 0;
    }
    // blink
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > CharacterSprite.BLINK_LID_MS) {
        this.blinkGraphics!.visible = false;
        this.blinkT = -1;
        this.blinkNext = 2.4 + Math.random() * 2.2;
      }
    } else {
      this.blinkNext -= dt;
      if (this.blinkNext <= 0) {
        if (!this.blinkGraphics) {
          this.blinkGraphics = new Graphics();
          this.blinkGraphics.eventMode = 'none';
          this.container.addChild(this.blinkGraphics);
        }
        // lid over the face screen: rows 7-12 of the 48px sprite, inset to
        // the head's screen columns (matches portraitArt's screen bounds)
        const w = this.frameW;
        this.blinkGraphics.clear();
        this.blinkGraphics
          .rect(-w / 2 + w * 0.30, -this.frameH + 7 * (this.frameH / 48), w * 0.42, 6 * (this.frameH / 48))
          .fill({ color: 0x100e1a, alpha: 0.92 });
        this.blinkGraphics.visible = true;
        this.blinkT = 0;
      }
    }
  }

  setAnimation(anim: AnimState, direction: Direction): void {
    if (anim === this.currentAnim && direction === this.currentDirection) return;

    this.currentAnim = anim;
    this.currentDirection = direction;

    this.sprite.textures = this.getFrames(direction, anim);
    this.sprite.scale.x = direction === 'left' ? -1 : 1;
    this.sprite.animationSpeed = anim === 'walk' ? 0.15 : anim === 'idle' ? 0.08 : 0.06;
    this.sprite.play();
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  setAlpha(alpha: number): void {
    this.container.alpha = alpha;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
