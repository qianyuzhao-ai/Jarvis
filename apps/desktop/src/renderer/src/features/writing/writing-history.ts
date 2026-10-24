import { Annotation, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { history } from '@codemirror/commands';
export const writingAgentRun = Annotation.define<string>();
export const finishWritingAgent = StateEffect.define<null>();
export const lastAgentRun = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) =>
    tr.effects.some((e) => e.is(finishWritingAgent))
      ? null
      : tr.docChanged
        ? (tr.annotation(writingAgentRun) ?? null)
        : value,
});
export const writingHistory = [
  lastAgentRun,
  EditorState.transactionExtender.of((tr) =>
    !tr.docChanged && tr.selection && tr.startState.field(lastAgentRun)
      ? { annotations: Transaction.addToHistory.of(false) }
      : null,
  ),
  history({
    joinToEvent: (tr, adjacent) => {
      const run = tr.annotation(writingAgentRun);
      return run
        ? run === tr.startState.field(lastAgentRun)
        : !tr.startState.field(lastAgentRun) && adjacent;
    },
  }),
];
export function agentHistoryAnnotations(runId: string, startedAt: number) {
  return [
    writingAgentRun.of(runId),
    Transaction.userEvent.of('input.type.agent'),
    Transaction.time.of(startedAt),
  ];
}
