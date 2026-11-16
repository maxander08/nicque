import { TextBlockView } from './TextBlockView';

/** The Integer Block looks exactly like the Text Block: same housing, buttons and connectors, only the printed name differs. */
export function IntegerBlockView({ moduleId }: { moduleId: string }) {
  return <TextBlockView moduleId={moduleId} badge="Integer" />;
}
