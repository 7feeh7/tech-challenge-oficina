export function safeTelemetry(action: () => void): void {
  try {
    action();
  } catch {
    // Telemetria não deve alterar fluxo de negócio quando o coletor falha.
  }
}

export async function safeTelemetryAsync(
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch {
    // Telemetria não deve alterar fluxo de negócio quando o coletor falha.
  }
}
