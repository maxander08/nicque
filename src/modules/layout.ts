/**
 * Shared layout rules for every block (1 unit ≈ 5 cm). All blocks derive their spacing from here, so no
 * module can drift from the design system.
 *
 *   ┌──────────────────────────────┐  ← top border (local −z edge)
 *   │  ●      EDGE                 │  ← single power LED, top-left, centred in the LED band
 *   │  ┌────────────────────────┐  │  ← content starts at LED_BAND
 *   │  │ screen / buttons       │  │
 *   │  └────────────────────────┘  │
 *   │             nicque / NAME    │  ← badge, BADGE_INSET from the bottom border
 *   └──────────────────────────────┘
 */

/** Uniform margin between a block's border and anything printed or cut into its cover. */
export const EDGE = 0.14;

/** Distance from the top border to the centre of the power LED (equal for every module). */
export const LED_INSET = EDGE;

/** Depth of the strip along the top border that belongs to the LED (EDGE above and EDGE below it). */
export const LED_BAND = EDGE * 2;

/** Radius of the power LED lens. */
export const LED_RADIUS = 0.03;

/**
 * Distance from the left border to the centre of the power LED: its left edge lines up with the left edge
 * of the screen window (EDGE from the border), so the LED and the content share one vertical line.
 */
export const LED_SIDE_INSET = EDGE + LED_RADIUS;

/** Distance from the bottom border to the centre of the printed badge. */
export const BADGE_INSET = 0.2;

/** Local (x, z) of the single power LED: top-left corner of the cover, centred in the LED band. */
export const powerLedPosition = (width: number, depth: number) => ({
  x: -width / 2 + LED_SIDE_INSET,
  z: -depth / 2 + LED_INSET,
});

/** Local z where a block's content (screen, buttons) may start below the LED band. */
export const contentTopZ = (depth: number) => -depth / 2 + LED_BAND;

/** Local z of the badge's centre line for a block of the given depth. */
export const badgeZ = (depth: number) => depth / 2 - BADGE_INSET;

/** Width of a screen window that sits EDGE away from both side borders. */
export const windowWidth = (blockWidth: number) => blockWidth - 2 * EDGE;
