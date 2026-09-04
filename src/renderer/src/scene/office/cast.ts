// The Stark-lab cast — roster metadata + sprite frames.
//
// DUM-E runs a robotics lab, not a paper company: the roster is Tony-inspired
// robot agents. Both the static portraits (cards / picker) and the in-scene
// walking sprites are custom-drawn from the same per-character recipes in
// portraitArt.ts: the scene sprite reuses the portrait's exact head/face and
// adds legs, so an agent on the lab floor looks identical to its card.
//
// The names are Marvel references kept for the team's internal tool — swap for
// original robot names before any public distribution.

import { Texture } from 'pixi.js';
import { paintPortrait, sceneFrameBufs, SCENE_W, SCENE_H } from './portraitArt';

export type OfficeCharacterName =
  | 'dume' | 'herbie' | 'butterfingers' | 'doombot' | 'sentinel'
  | 'rover' | 'vision' | 'ultron' | 'ultronbot' | 'modok'
  | 'veronica' | 'edith' | 'lyla';

export interface CastMember {
  name: OfficeCharacterName;
  displayName: string;
  /** Signature accent color (hex) — used for the in-scene selection glow. */
  shirt: string;
  /** Blurb shown when this character is picked / has no description yet. */
  blurb: string;
}

/** Selectable roster, in display order. */
export const OFFICE_CAST: CastMember[] = [
  { name: 'dume',          displayName: 'DUM-E',          shirt: '#266FD6', blurb: 'The arm that runs the lab' },
  { name: 'herbie',        displayName: 'H.E.R.B.I.E',   shirt: '#8FD14F', blurb: 'Researcher, librarian of the hive' },
  { name: 'butterfingers', displayName: 'Butterfingers', shirt: '#F4A259', blurb: 'Sandbox tinkerer, drops things' },
  { name: 'doombot',       displayName: 'Doombot',       shirt: '#5B6E7A', blurb: 'General-purpose worker' },
  { name: 'sentinel',      displayName: 'Sentinel',     shirt: '#9B6BDC', blurb: 'Watchful general worker' },
  { name: 'rover',         displayName: 'Rover',        shirt: '#C97B3D', blurb: 'Web explorer, fetches things' },
  { name: 'vision',        displayName: 'Vision',        shirt: '#B03060', blurb: 'Planner, sees the whole board' },
  { name: 'ultron',        displayName: 'Ultron',        shirt: '#D64541', blurb: 'Relentless heavy builder' },
  { name: 'ultronbot',     displayName: 'Ultron-bot',    shirt: '#8A3130', blurb: 'Ephemeral parallel worker' },
  { name: 'modok',         displayName: 'MODOK',        shirt: '#E8B93E', blurb: 'Analyst, counts the tokens' },
  { name: 'veronica',      displayName: 'VERONICA',     shirt: '#3E8EDE', blurb: 'Rescue agent, fixes broken builds' },
  { name: 'edith',         displayName: 'EDITH',        shirt: '#4DB6AC', blurb: 'Integrations, eyes everywhere' },
  { name: 'lyla',          displayName: 'LYLA',         shirt: '#E06FA8', blurb: 'Scheduler, keeps the beat' },
];

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> =
  Object.fromEntries(OFFICE_CAST.map((c) => [c.name, c])) as Record<OfficeCharacterName, CastMember>;

export const DEFAULT_CHARACTER: OfficeCharacterName = 'doombot';

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// ─── scene frames ────────────────────────────────────────────────────────────
const frameCache = new Map<OfficeCharacterName, Texture[][]>();

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W; canvas.height = SCENE_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SCENE_W, SCENE_H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/**
 * Frame grid CharacterSprite expects: 3 rows (down, up, right) × 7 frames
 * [walk1, walk2, walk3, type1, type2, read1, read2]. We provide a front view
 * (down — and reused for the side row, so left/right walkers still show a face)
 * and a back view (up — agents seated facing their desk show their back). The
 * three walk frames are stand / step-left / step-right.
 */
export async function getCastFrames(name: OfficeCharacterName): Promise<Texture[][]> {
  const cached = frameCache.get(name);
  if (cached) return cached;
  const { front, back } = sceneFrameBufs(name);
  const toRow = (bufs: Uint8ClampedArray[]): Texture[] => {
    const [stand, stepL, stepR] = bufs.map(bufToTexture);
    return [stand, stepL, stepR, stand, stand, stand, stand];
  };
  const frontRow = toRow(front);
  const frames: Texture[][] = [frontRow, toRow(back), frontRow]; // down, up, right
  frameCache.set(name, frames);
  return frames;
}

/**
 * Paint a character's static portrait for cards / the picker (delegates to the
 * custom procedural composer in portraitArt.ts).
 */
export async function paintCastPortrait(
  ctx: CanvasRenderingContext2D,
  name: OfficeCharacterName,
  scale = 2,
): Promise<void> {
  paintPortrait(ctx, name, scale);
}
