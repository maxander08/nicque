import { TextBlockView } from './TextBlockView';

/** The Integer Block looks exactly like the Text Block: same housing, buttons and connectors, only the printed name and the gray INT box differ. */
export function IntegerBlockView({ moduleId }: { moduleId: string }) {
  return <TextBlockView moduleId={moduleId} badge="Integer" typeLabel="INT" />;
}
