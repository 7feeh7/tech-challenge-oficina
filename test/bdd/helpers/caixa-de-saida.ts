import type { PrismaService } from '@/shared/database/prisma.service';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';

/**
 * A outbox é a porta de saída do OS: com o publicador desligado, o que o OS
 * pediria ao Billing e ao Execution fica nela, e é daqui que os serviços
 * simulados "recebem" os comandos.
 */
export class CaixaDeSaida {
  private readonly recebidos = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly correlationId: string,
  ) {}

  async emitidos(eventType?: string): Promise<EnvelopeMensagem[]> {
    const linhas = await this.prisma.outboxMensagem.findMany({
      where: {
        correlationId: this.correlationId,
        ...(eventType ? { eventType } : {}),
      },
      orderBy: { criadoEm: 'asc' },
    });
    return linhas.map((linha) => linha.envelope as unknown as EnvelopeMensagem);
  }

  async contar(eventType: string): Promise<number> {
    return (await this.emitidos(eventType)).length;
  }

  async receberProximo(eventType: string): Promise<EnvelopeMensagem> {
    const pendente = (await this.emitidos(eventType)).find(
      (envelope) => !this.recebidos.has(envelope.eventId),
    );
    if (!pendente) {
      throw new Error(`O OS não emitiu nenhum comando novo ${eventType}.`);
    }
    this.recebidos.add(pendente.eventId);
    return pendente;
  }

  async ordemDeEmissao(eventTypes: string[]): Promise<string[]> {
    const todos = await this.emitidos();
    return todos
      .map((envelope) => envelope.eventType)
      .filter((tipo) => eventTypes.includes(tipo));
  }
}
