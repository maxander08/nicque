import { connectionId } from '@/connections/validate';
import { DOCK_GAP, SQUARE, createModule } from '@/modules/definitions';
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
  const powerZ = -(SQUARE / 2 + DOCK_GAP + 0.5);

  const modules = [
    createModule('power', 'power-1', { x: 0, z: powerZ }),
    createModule('text', 'text-1', { x: -half, z: 0 }),
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
