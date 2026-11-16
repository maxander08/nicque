# Nicque — modular hardware simulator

A real-time 3D, hardware-first visual programming prototype. Four physical modules (Power, Text, Display, Keyboard) sit on an endless gray plane. You move them, link their connectors, switch power and edit text; a deterministic runtime decides what each block does.

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
| Select | click a block (click ground or `Esc` to deselect) |
| Move | drag a block. *Snap* toggles a 0.25 grid; connectors that face each other magnetically dock with a 0.05 gap; housings can never intersect. Arrow keys nudge the selected block, `R` rotates it |
| Link | drag from one connector (status light on the cover edge) to another. Invalid links are refused with an explanation. Click a linked connector to remove its link, or use *Disconnect* / *Link* in the panels |
| Power | the physical button on the Power Block, the switch in the status panel or inspector, or `P` |
| Edit text | select the Text Block and type in the inspector, or press its **Edit** button. The **undo** button restores the sample text |
| Add / remove blocks | *Add block* in the top bar (a Keyboard docks in front of a free Text Block and is powered automatically); *Remove* in the inspector |
| Keyboard | link *Keyboard → Text* (drag connector to connector, or *Link* in the status panel), then press the keys on the Keyboard's LED screen, or select it and type on your own keyboard |
| Workspace | Save / Load (browser storage), Export / Import (JSON file), Reset. The workspace is also autosaved and restored on reload |

**Initial state (deterministic):** power **on**, text `Hello, Nicque`, all three links established, camera at the default view.

## Keyboard Block

A 4×2 block with an LED screen (same LED lattice, colours and typeface as the Display Block) showing a full ANSI QWERTY layout: number row, Tab, Caps Lock, Shift, Enter, Backspace and Space. It has a power input and a **keys** output that links to the new *Keyboard input* connector on the Text Block. Letters follow Shift / Caps Lock live on the screen. While a powered Keyboard is selected, your physical keyboard types through it and the matching keys light up (Escape and arrows still reach the shortcuts).

*Key pressure* (Light / Normal / Firm, in the inspector): touch and pen contacts must reach that force to register a key, keys glow brighter the harder they are pressed, and holding a key repeats it faster with more pressure. A mouse has no force sensor and always counts as a firm press.

Every block carries a small, subtle "nicque" mark with the block's name printed below it.

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
