# Nicque — modular hardware simulator

A real-time 3D, hardware-first visual programming prototype. Six physical modules (Power, Text, Integer, Display, Keyboard, Keypad) sit on an endless plane with selectable lighting atmospheres. You move them, link their connectors, switch power and edit values; a deterministic runtime decides what each block does.

## Commands

```bash
npm install
npm run dev        # development server
npm run build      # production build (single file in dist/index.html)
npm run typecheck  # TypeScript
npm test           # vitest: runtime, connection validation, persistence, placement, text layout
```

## Using it

| Action | How |
| --- | --- |
| Orbit / pan / zoom | drag the ground / right-drag / wheel. *Reset view* animates back to the default camera |
| Select | click a block's **casing** (the black cover around its screen and buttons); click ground or `Esc` to deselect. Pressing *inside* a screen or on the Keyboard's keys never selects the block or opens its panel |
| Move | drag a block. *Snap* toggles a 0.25 grid; connectors that face each other magnetically dock with a 0.05 gap; housings can never intersect. Arrow keys nudge the selected block, `R` rotates it |
| Link | drag from one connector (status light on the cover edge) to another. Invalid links are refused with an explanation. Click a linked connector to remove its link, or use *Disconnect* / *Link* in the panels |
| Power | every block has a small power button in its top-right header (`switchedOff` keeps its wiring while taking it out of service), plus the switch in the status drawer / inspector or `P` |
| Edit text / integers | select a Text or Integer Block and type in the inspector, or press its physical **Clear** / **Undo** buttons (there are no pencil buttons; Undo steps back through the block's previous values one change at a time) (Text and Integer Blocks have no screen—link them to a Display Block to view their value; **Clear** in the Display header clears only the Display until the source changes, while keeping the source's stored data) |
| Add / remove blocks & lighting | use the left-edge toolbar (`LeftToolbar`) to drag blocks directly onto the 3D workspace (with live footprint preview) or switch lighting scenes (from bright studio down to pitch black); *Remove* in the inspector |
| Keyboard | link *Keyboard → Text* (drag connector to connector, or *Link* in the status panel), then press the keys on the Keyboard's LED screen, or select it and type on your own keyboard |
| Workspace | Save / Load (browser storage), Export / Import (JSON file), Reset. The workspace is also autosaved and restored on reload |

**Initial state (deterministic):** power **on**, text `Hello, Nicque`, all three links established, camera at the default view.

## Keyboard & Keypad Blocks

- **Keyboard Block:** A 4×2 block with an LED screen (same LED lattice, colours and typeface as the Display Block) showing a full ANSI QWERTY layout: number row, Tab, Caps Lock, Shift, Enter, Backspace and Space.
- **Keypad Block:** A compact square pad with an LED matrix (`0–9`, `#`, `*`, `+`, `.`, `,` and a **Backspace** key left of `0`, which deletes the last character of the linked Text / Integer Block) that shares the same LED pitch and pressure-sensitive key mechanics.
- The **Text Block** provides **two south `keys` inputs** (`key-in` and `key-in-2`), so a Keyboard Block and a Keypad Block can both be linked into the same Text Block simultaneously. While a powered Keyboard or Keypad is selected, your physical keyboard types through it and the matching keys light up (Escape and arrows still reach the shortcuts).

*Key pressure* (Light / Normal / Firm, in the inspector): touch and pen contacts must reach that force to register a key, keys glow brighter the harder they are pressed, and holding a key repeats it faster with more pressure. A mouse has no force sensor and always counts as a firm press.

Every block carries a small, subtle "nicque" mark with the block's name printed below it.

## Operator Blocks & Node Compatibility

Adder (`+`), Subtractor (`−`), Multiplier (`×`) and Divisor (`÷`) Blocks share the Text Block's housing and power/output geometry, marked by a **yellow operator box + symbol** next to the top-left power LED (the Text and Integer Blocks carry the same box in **gray** with **TXT** / **INT** printed beside it; operators have no south key inputs, since operators hold no editable text of their own; **Clear** blanks the result stored in the operator only, never the Integer / Text Blocks feeding it, and **Undo** restores it). Every connector holds exactly **one wire**. Each operator therefore has **two operand pins** on its west edge (`data-in` and `data-in-2`, spaced with the same plug gap and corner clearance as the Power Block) and **two output pins** on its east edge (`data-out`, `data-out-2`; Text Blocks have the same two). An output pin feeds one block; a second consumer uses the second pin:
- **Subtractor & Divisor:** accept and output integers only (`BigInt` subtraction and integer division truncating toward zero; division by zero reports unavailable).
- **Adder & Multiplier:** accept integers and text (`BigInt` addition/multiplication for integer pairs, string concatenation for Adder when either operand is text, and string repetition for `text × integer` up to 10,000 chars while rejecting negative counts or `text × text`).
- Operators evaluate depth-first across chained operator graphs in `evaluateWorkspace()`, publishing their live result out of `data-out`.
- Full graph compatibility (`src/connections/compat.ts`) prevents cycles and rejects links that would turn an operator's downstream output into a type its existing consumers cannot accept.
- Powered Display Blocks without active text content show a subtle `"Idle"` state.

## Layout and topology

```
              [ POWER ]                 Power Block docks to the top edge of both lower blocks
   [ TEXT ]               [ DISPLAY ]
```

* Power → Text: power link (`power-out-a` → `power-in`)
* Power → Display: power link (`power-out-b` → `power-in`)
* Text → Display: **text** link (`data-out` → `data-in`)

Power and data are separate typed relationships. Proximity never counts as a connection: docked blocks with no link stay inactive, and linked blocks that are pulled apart stay linked and are joined by a link cable that is routed from the real connector positions (arching over housings it would cross).

## Architecture

```
src/types          shared data models (records vs. runtime state)
src/modules        module definitions (dimensions, ports, config), spatial math, text layout policy
src/connections    validation (pure), suggestions, cable/dock geometry (pure)
src/runtime        evaluateWorkspace(): pure, deterministic dependency evaluation
src/state          zustand store (workspace → runtime), default workspace
src/persistence    serialise / validate / load / save (storage abstracted)
src/interactions   placement (snap, magnet, collision) and the pointer controller
src/geometry       procedural bevelled slab geometry with real openings
src/materials      PBR material library, procedural textures, canvas screen painters
src/rendering      quality presets, ray-marched ground occlusion shader
src/scene          canvas, ground, lighting, camera rig, cables, module views and parts
src/ui             minimal HUD: top bar, status panel, inspector, feedback
tests              vitest suites
```

Adding a module type means adding a definition in `src/modules/definitions.ts`, a body in `src/scene/modules/` and registering it in `ModuleView`; the runtime, validation and persistence are data-driven.

### Runtime sequence
1. validate connections, 2. find active Power Blocks, 3. resolve power for Text/Display, 4. read the Text Block if operational, 5. transfer through valid data links, 6. resolve each screen (`off`, `no-source`, `source-off`, `empty`, `text`). Only logic changes (text, power, links) recompute it; moving blocks does not.

### Display policy
Explicit line breaks are kept, lines wrap on words (over-long words by character), the type size shrinks to fit, and text that still does not fit is clipped with `…`. Text is painted into a canvas texture that is used as the emissive map of the real LED-pad surface, behind an LED-lattice mask, so it follows perspective and lighting.

## Rendering — what is real and what is approximate

Implemented:
* PBR materials: bead-blasted anodised metal chassis (brushed roughness map), soft-touch polymer cover, glossy button polymer, gold contacts, steel magnets, rubber foot, silicone LED pad, specular-only glass cover over the Text Block screen.
* Real geometry: swept bevel profiles, hairline seam, openings for screens and buttons, connector inserts with pogo pins/pads/magnets.
* Procedural studio environment probe (PMREM from light-formers), directional key with soft shadow maps, rim and fill.
* **Custom ray-marched ground shader**: housings are passed as signed-distance boxes; each ground fragment sphere-traces toward the key light for a soft contact shadow and samples the field for ambient occlusion. This is software ray marching in a fragment shader.
* N8AO screen-space ambient occlusion, MSAA, ACES tone mapping and a gentle vignette (High quality). *Fast* mode drops post-processing, shadow maps and high DPR.
* Endless ground: a huge disc whose exponential fog matches a sky dome, so no edge/horizon is visible; the camera is clamped.

Not implemented (honest list): hardware ray tracing / ray queries (not available in WebGL), screen-space reflections, temporal accumulation/TAA. Metallic reflections come from the environment probe.

## Layout rules (`src/modules/layout.ts`)

Every block derives its spacing from one module, so the rules hold site-wide:

- `EDGE` (0.14) is the margin between a block's border and anything cut into or printed on its cover; screen windows sit `EDGE` from the side borders.
- Every module has a single round power LED (`PowerLed`, lit soft green while the block is powered) in the top-left corner and header controls (`HeaderControls`) in the top-right corner (power toggle on every block, plus **Clear** on the Display Block).
- Content starts `LED_BAND` (2 × `EDGE`) below the top border; badges are centred `BADGE_INSET` above the bottom border, Display and Keyboard share vertical bezel geometry, and Keyboard and Keypad share a 14-LED-cell key pitch, gap, radius and legend size.
- Link cables route on the ground around module footprints (`src/connections/cable.ts`), never over or through blocks; the Status panel slides out from the right edge on hover.
- The Power Block provides 8 power outputs (1 west, 1 east, and 6 evenly spaced along the south edge, preserving `power-out-a`/`b`/`c` docking positions).
- `tests/layout.test.ts` enforces these rules.
