import { GATES } from '@/modules/definitions';
import type { GateType } from '@/types';
import { TextBlockView } from './TextBlockView';

/**
 * Logic gates look exactly like the operator blocks (same housing, buttons, connectors and power LED). Instead of
 * the yellow operator box they carry a blue square next to the power LED, with the gate's name printed beside it.
 */
const gateView = (type: GateType) =>
  function GateBlockView({ moduleId }: { moduleId: string }) {
    return <TextBlockView moduleId={moduleId} badge={GATES[type].badge} gate={type} />;
  };

export const NotGateView = gateView('not');
export const OrGateView = gateView('or');
export const AndGateView = gateView('and');
export const NorGateView = gateView('nor');
export const NandGateView = gateView('nand');
export const XorGateView = gateView('xor');
export const XnorGateView = gateView('xnor');
