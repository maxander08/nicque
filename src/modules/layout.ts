/**
 * Shared layout rules for every block (1 unit ≈ 5 cm). All blocks derive their spacing from here, so no
 * module can drift from the design system.
 *
 *   ┌──────────────────────────────────────┐  ← top border (local −z edge)
 *   │  ●                      [clear] [⏻]  │  ← HEADER: status LED left, small control buttons right
 *   │  ┌────────────────────────────────┐  │  ← content starts at HEADER
 *   │  │ screen / keys / buttons        │  │
 *   │  └────────────────────────────────┘  │
 *   │              nicque / NAME           │  ← FOOTER: badge, BADGE_INSET above the bottom border
 *   └──────────────────────────────────────┘
 *
 * The header is the one strip every block shares: the LED and the control buttons are centred on the same
 * line, and both sit EDGE (visually) from the nearest border, so the corner reads as one composed unit.
 */

/** Uniform margin between a block's border and anything printed or cut into its cover. */
export const EDGE = 0.14;

/** Radius of the small control buttons (power, clear) that live in a block's header. */
export const CONTROL_RADIUS = 0.12;

/** Air gap between a button cap and the edge of its opening in the cover (mirrors ButtonCap). */
export const CONTROL_CLEARANCE = 0.014;

/** Outer radius of a control button's opening. */
export const CONTROL_HOLE_RADIUS = CONTROL_RADIUS + CONTROL_CLEARANCE;

/** Gap between two neighbouring control openings. */
export const CONTROL_GAP = 0.06;

/** Horizontal distance between the centres of two neighbouring control buttons. */
export const CONTROL_PITCH = CONTROL_HOLE_RADIUS * 2 + CONTROL_GAP;

/**
 * Depth of the header strip: the control opening plus EDGE of cover above and below it
 * (0.14 + 0.268 + 0.14 = 0.548). The status LED is centred in this strip, too.
 */
export const HEADER = EDGE * 2 + CONTROL_HOLE_RADIUS * 2;

/** Depth of the strip below the content that holds the printed badge. */
export const FOOTER = 0.36;

/** Depth of the slim header of the Power Block, whose only control is its big central button. */
export const LED_BAND = EDGE * 2;

/** Distance from the top border to the centre of the power LED (headers are centred on it). */
export const LED_INSET = EDGE;

/** Radius of the power LED lens. */
export const LED_RADIUS = 0.03;

/**
 * Distance from the left border to the centre of the power LED: its left edge lines up with the left edge
 * of the screen window (EDGE from the border), so the LED and the content share one vertical line.
 */
export const LED_SIDE_INSET = EDGE + LED_RADIUS;

/** Distance from the bottom border to the centre of the printed badge. */
export const BADGE_INSET = 0.2;

/** Local (x, z) of the single power LED: top-left corner of the cover, centred in the header. */
export const powerLedPosition = (width: number, depth: number, header = HEADER) => ({
  x: -width / 2 + LED_SIDE_INSET,
  z: -depth / 2 + header / 2,
});

/** Local z where a block's content (screen, keys, buttons) may start below the header. */
export const contentTopZ = (depth: number) => -depth / 2 + HEADER;

/** Local z where a block's content must end above the footer. */
export const contentBottomZ = (depth: number) => depth / 2 - FOOTER;

/** Local z of the badge's centre line for a block of the given depth. */
export const badgeZ = (depth: number) => depth / 2 - BADGE_INSET;

/** Width of a screen window that sits EDGE away from both side borders. */
export const windowWidth = (blockWidth: number) => blockWidth - 2 * EDGE;

/** Block depth that fits a content window of the given depth between the header and the footer. */
export const depthForWindow = (windowDepth: number) => HEADER + windowDepth + FOOTER;

/** Local z of the centre line of the header controls. */
export const controlZ = (depth: number) => -depth / 2 + HEADER / 2;

/**
 * Local x of the header control in `slot` (0 = the rightmost, which is always the power button).
 * Controls hug the right border, EDGE away from it, and step left by CONTROL_PITCH.
 */
export const controlX = (width: number, slot: number) =>
  width / 2 - EDGE - CONTROL_HOLE_RADIUS - slot * CONTROL_PITCH;
