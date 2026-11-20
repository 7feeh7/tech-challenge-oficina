/**
 * Deadline total da operação (inclui retentativas do SDK), sem Promise.race órfão:
 * o SDK recebe o AbortSignal e interrompe a requisição em curso.
 */
export function sinalOperacaoAws(
  deadlineMs: number,
  sinalExterno?: AbortSignal,
): AbortSignal {
  const deadline = AbortSignal.timeout(deadlineMs);
  if (!sinalExterno) return deadline;
  if (sinalExterno.aborted) return sinalExterno;
  return AbortSignal.any([deadline, sinalExterno]);
}
