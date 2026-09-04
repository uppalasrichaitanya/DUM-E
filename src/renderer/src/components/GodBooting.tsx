import { PixelPanel } from '@/components/PixelPanel';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

/**
 * Loader shown on the empty floor while the god agent is powering up on
 * launch. Replaces the "add agent" prompt so a returning user doesn't see the
 * empty-floor call-to-action before god has booted.
 *
 * Rendered while `agentCount === 0` — before the store has god's live agent
 * object (and so before `agent.name` exists anywhere to read) — so this reads
 * the persisted name directly, the same way useHive.ts's spawn effect does,
 * rather than assuming the default.
 *
 * The mini arc-reactor replaces the old four blinking blocks — two counter-
 * turning squares around a pulsing core:
 *   frame   — 44px reactor-blue square with ONE DUM-E-gold corner, ticking
 *             clockwise in 45° steps. The gold corner is what makes the
 *             rotation readable: a uniformly-bordered square has 90°
 *             symmetry, so 45° ticks would only flip between two looks. A
 *             distinct corner sweeps the compass like an orbiting spark
 *             (the splash's reactor sparks, in miniature).
 *   diamond — 34px gold square locked at 45° with one BLUE corner, ticking
 *             counter-clockwise: the inner ring winding against the frame.
 *   core    — 16px, pulsing blue↔gold on steps(1): the reactor's charge.
 * Every motion is stepped, never eased — glides are against the pixel
 * aesthetic. Keyframes live in the <style> tag below (prefixed `gb-`) because
 * global.css is shared and this is loader-local imagery. No box-shadow on the
 * turning squares: var(--cth-shadow-hard) is a fixed top-left light, and
 * rotating an element that carries it would swing the light source around
 * the room — only the static core gets the hard shadow.
 */
export function GodBooting() {
  const godName = useResolvedGodName();
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none'
    }}>
      <style>{`
        /* 0→360 and 45→-315: both a full turn in their own direction, so the
           infinite loop is seamless (no snap back to the start angle). */
        @keyframes gb-tick     { from { transform: rotate(0deg); }  to { transform: rotate(360deg); } }
        @keyframes gb-tick-rev { from { transform: rotate(45deg); } to { transform: rotate(-315deg); } }
        @keyframes gb-core {
          0%, 39%   { transform: scale(1);    background: var(--cth-arc, #266FD6); }
          40%, 59%  { transform: scale(0.72); background: var(--cth-dume-gold, #F4D35E); }
          60%, 100% { transform: scale(1);    background: var(--cth-arc, #266FD6); }
        }
      `}</style>
      <div style={{ pointerEvents: 'auto', width: 360 }}>
        <PixelPanel variant="dialog" title="POWERING UP" noPadding>
          <div style={{
            padding: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14
          }}>
            {/* Mini arc-reactor. The 64px stage fits both squares' corners:
                44px half-diagonal 31px, 34px half-diagonal 24px — inside 32px.
                `inset: 0; margin: auto` centers the fixed-size layers. */}
            <div style={{
              position: 'relative', width: 64, height: 64,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {/* frame: blue square, gold corner sweeping clockwise */}
              <div style={{
                position: 'absolute', inset: 0, margin: 'auto',
                width: 44, height: 44,
                border: '4px solid var(--cth-arc, #266FD6)',
                borderTopColor: 'var(--cth-dume-gold, #F4D35E)',
                animation: 'gb-tick 2.4s steps(8, end) infinite'
              }} />
              {/* diamond: gold square at 45°, blue corner winding counter */}
              <div style={{
                position: 'absolute', inset: 0, margin: 'auto',
                width: 34, height: 34,
                border: '3px solid var(--cth-dume-gold, #F4D35E)',
                borderTopColor: 'var(--cth-arc, #266FD6)',
                animation: 'gb-tick-rev 4.8s steps(8, end) infinite'
              }} />
              {/* core: pulses blue↔gold — the only hard-shadowed piece */}
              <div style={{
                width: 16, height: 16,
                boxShadow: 'var(--cth-shadow-hard)',
                animation: 'gb-core 1.2s steps(1, end) infinite'
              }} />
            </div>
            <p style={{
              margin: 0, fontSize: 13, lineHeight: '20px', textAlign: 'center',
              color: 'var(--cth-ink-700)'
            }}>
              {godName} is docking into the charging bay and getting the lab
              ready. Hang tight…
            </p>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
