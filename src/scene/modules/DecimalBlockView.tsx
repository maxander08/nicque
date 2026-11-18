import { TextBlockView } from './TextBlockView';

/** The Decimal Block looks exactly like the Integer Block: same housing, buttons and connectors, only the printed name and the gray DEC box differ. */
export function DecimalBlockView({ moduleId }: { moduleId: string }) {
  return <TextBlockView moduleId={moduleId} badge="Decimal" typeLabel="DEC" />;
}
