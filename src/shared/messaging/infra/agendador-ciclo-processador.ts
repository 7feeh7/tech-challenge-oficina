import type { Logger } from '@nestjs/common';

/**
 * Um ciclo por vez: pausa entre ciclos, não durante.
 * Desligamento aguarda o ciclo em andamento e não agenda outro.
 */
export class AgendadorCicloProcessador {
  private timer?: NodeJS.Timeout;
  private cicloEmAndamento?: Promise<void>;
  private encerrando = false;

  constructor(
    private readonly intervaloMs: number,
    private readonly executarCiclo: () => Promise<void>,
    private readonly logger: Logger,
    private readonly rotuloFalha: string,
  ) {}

  iniciar(): void {
    this.encerrando = false;
    this.agendar(0);
  }

  async parar(): Promise<void> {
    this.encerrando = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.cicloEmAndamento) {
      await this.cicloEmAndamento;
    }
  }

  get cicloAtivo(): boolean {
    return this.cicloEmAndamento !== undefined;
  }

  private agendar(atrasoMs: number): void {
    if (this.encerrando) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.rodarCiclo();
    }, atrasoMs);
  }

  private async rodarCiclo(): Promise<void> {
    if (this.cicloEmAndamento) {
      return;
    }
    const promessa = this.executarCiclo().catch((erro) =>
      this.logger.error(this.rotuloFalha, erro),
    );
    this.cicloEmAndamento = promessa;
    try {
      await promessa;
    } finally {
      this.cicloEmAndamento = undefined;
      if (!this.encerrando) {
        this.agendar(this.intervaloMs);
      }
    }
  }
}
