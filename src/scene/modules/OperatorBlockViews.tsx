import { OPERATORS } from '@/modules/definitions';
import type { OperatorType } from '@/types';
import { TextBlockView } from './TextBlockView';

/**
 * Operator blocks look exactly like the Text Block (same housing, buttons, connectors and power LED) and only add the
 * yellow operator box next to the power LED, plus their own printed name.
 */
const operatorView = (type: OperatorType) =>
  function OperatorBlockView({ moduleId }: { moduleId: string }) {
    return <TextBlockView moduleId={moduleId} badge={OPERATORS[type].badge} operator />;
  };

export const AdderBlockView = operatorView('adder');
export const SubtractorBlockView = operatorView('subtractor');
export const MultiplierBlockView = operatorView('multiplier');
export const DivisorBlockView = operatorView('divisor');
