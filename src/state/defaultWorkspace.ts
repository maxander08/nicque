import { connectionId } from '@/connections/validate';
import { DISPLAY_D, DOCK_GAP, SQUARE, TEXT_D, createModule } from '@/modules/definitions';
import type { ConnectionRecord, PortRef, Workspace } from '@/types';

/**
 * The mandatory initial arrangement (viewed from the default camera):
 *
 *                [ POWER ]
 *   [ TEXT ]                 [ DISPLAY ]
 *
 * The Power Block sits across the back, docked to the top edge of both lower blocks.
 * Initial state: power ON, text "Hello, Nicque".
 */
export function createDefaultWorkspace(): Workspace {
  const half = (SQUARE + DOCK_GAP) / 2;
  // The Text Block is shallower than the Display Block (it has no screen). Their bottom edges line up, so a
  // Keyboard or Keypad can dock in front of the Text Block, and the Text Block's side connector (see
  // TEXT_DATA_Z) meets the Display's. The Power Block docks to the Display and reaches the Text Block by cable.
  const powerZ = -(DISPLAY_D / 2 + DOCK_GAP + 0.5);
  const textZ = (DISPLAY_D - TEXT_D) / 2;

  const modules = [
    createModule('power', 'power-1', { x: 0, z: powerZ }),
    createModule('text', 'text-1', { x: -half, z: textZ }),
    createModule('display', 'display-1', { x: half, z: 0 }),
  ];

  const link = (from: PortRef, to: PortRef, type: ConnectionRecord['type']): ConnectionRecord => ({
    id: connectionId(from, to),
    type,
    from,
    to,
  });

  const connections: ConnectionRecord[] = [
    link(
      { moduleId: 'power-1', portId: 'power-out-a' },
      { moduleId: 'text-1', portId: 'power-in' },
      'power',
    ),
    link(
      { moduleId: 'power-1', portId: 'power-out-b' },
      { moduleId: 'display-1', portId: 'power-in' },
      'power',
    ),
    link(
      { moduleId: 'text-1', portId: 'data-out' },
      { moduleId: 'display-1', portId: 'data-in' },
      'text',
    ),
  ];

  return { modules, connections };
}
