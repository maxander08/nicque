import { TextBlockView } from './TextBlockView';

/** The Boolean Block looks exactly like the Integer Block: same housing, buttons and connectors, only the printed name and the gray BOOL box differ. */
export function BooleanBlockView({ moduleId }: { moduleId: string }) {
  return <TextBlockView moduleId={moduleId} badge="Boolean" typeLabel="BOOL" />;
}
