/**
 * Shared layout rules for every block (1 unit ≈ 5 cm). All blocks derive their spacing from here, so no
 * module can drift from the design system.
 *
 *   ┌──────────────────────────────┐  ← top border (local −z edge)
 *   │         EDGE                 │
 *   │   · · · · · · · · · ·        │  ← status LEDs, centred in the LED band
 *   │         EDGE                 │
 *   │  ┌────────────────────────┐  │  ← content starts at LED_BAND
 *   │  │ screen / buttons       │  │
 *   │  └────────────────────────┘  │
 *   │             nicque / NAME    │  ← badge, BADGE_INSET from the bottom border
 *   └──────────────────────────────┘
 */

/** Uniform margin between a block's border and anything printed or cut into its cover. */
export const EDGE = 0.14;

/** Distance from the top border to the centre of the status LEDs (equal for every module). */
export const LED_INSET = EDGE;

/** Depth of the strip along the top border that belongs to the LEDs (EDGE above and EDGE below them). */
export const LED_BAND = EDGE * 2;

/** Centre-to-centre spacing of the LEDs, identical on every module. */
export const LED_PITCH = 0.136;

/** Distance from a block's side border to its first / last LED. */
export const LED_END_MARGIN = 0.32;

/** Distance from the bottom border to the centre of the printed badge. */
export const BADGE_INSET = 0.2;

/** Local z of the LED row's centre line for a block of the given depth. */
export const ledRowZ = (depth: number) => -depth / 2 + LED_INSET;

/** Local z where a block's content (screen, buttons) may start below the LED band. */
export const contentTopZ = (depth: number) => -depth / 2 + LED_BAND;

/** Local z of the badge's centre line for a block of the given depth. */
export const badgeZ = (depth: number) => depth / 2 - BADGE_INSET;

/** Number of LEDs and total span of a block's LED row: fixed pitch, centred, equal end margins. */
export function ledRowLayout(width: number) {
  const count = Math.max(1, Math.floor((width - 2 * LED_END_MARGIN) / LED_PITCH + 1e-6) + 1);
  return { count, span: (count - 1) * LED_PITCH };
}

/** Width of a screen window that sits EDGE away from both side borders. */
export const windowWidth = (blockWidth: number) => blockWidth - 2 * EDGE;
