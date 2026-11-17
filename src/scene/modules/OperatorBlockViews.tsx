import { OPERATORS } from '@/modules/definitions';
import type { OperatorType } from '@/types';
import { TextBlockView } from './TextBlockView';

/**
 * Operator blocks look exactly like the Text Block (same housing, buttons, connectors and power LED) and only add the
 * yellow operator box (with the operator's symbol beside it) next to the power LED, plus their own printed name.
 * None of the blocks has a pencil (edit) button: Clear and Undo are the only two buttons.
 */
const operatorView = (type: OperatorType) =>
  function OperatorBlockView({ moduleId }: { moduleId: string }) {
    return <TextBlockView moduleId={moduleId} badge={OPERATORS[type].badge} operator={type} />;
  };

export const AdderBlockView = operatorView('adder');
export const SubtractorBlockView = operatorView('subtractor');
export const MultiplierBlockView = operatorView('multiplier');
export const DivisorBlockView = operatorView('divisor');
