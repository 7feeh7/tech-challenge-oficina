import { randomUUID } from 'node:crypto';
import type { StatusOS } from '@/shared/generated/prisma/enums';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';
import type { AmbienteBdd, Catalogo } from './ambiente-bdd';
import { CaixaDeSaida } from './caixa-de-saida';
import { BillingSimulado, ExecutionSimulado } from './servicos-simulados';

export interface PedidoDeOrdem {
  descricaoProblema: string;
  pecas?: { pecaId: string; quantidade: number }[];
  servicos?: { servicoId: string; quantidade: number }[];
}

/** Uma ordem de serviço acompanhada de ponta a ponta, com os dois serviços simulados nas portas. */
export class JornadaOs {
  readonly caixa: CaixaDeSaida;
  readonly billing: BillingSimulado;
  readonly execution: ExecutionSimulado;
  readonly entregues: EnvelopeMensagem[] = [];

  private constructor(
    readonly ambiente: AmbienteBdd,
    readonly ordemServicoId: string,
    readonly correlationId: string,
  ) {
    this.caixa = new CaixaDeSaida(ambiente.prisma, correlationId);
    this.billing = new BillingSimulado(this);
    this.execution = new ExecutionSimulado(this);
  }

  static async abrir(
    ambiente: AmbienteBdd,
    catalogo: Catalogo,
    pedido: PedidoDeOrdem,
  ): Promise<JornadaOs> {
    const resposta = await ambiente
      .atendente()
      .post('/v1/ordens-servico')
      .send({
        clienteId: catalogo.clienteId,
        veiculoId: catalogo.veiculoId,
        descricaoProblema: pedido.descricaoProblema,
        pecas: pedido.pecas,
        servicos: pedido.servicos,
      })
      .expect(201);
    const criada = resposta.body as { id: string; correlationId: string };
    return new JornadaOs(ambiente, criada.id, criada.correlationId);
  }

  /** Abre a ordem, conclui o diagnóstico, gera o orçamento e reserva o estoque (aprovação do cliente). */
  static async ateAprovacaoDoOrcamento(
    ambiente: AmbienteBdd,
    catalogo: Catalogo,
    peca: { id: string },
    unidades: number,
  ): Promise<JornadaOs> {
    const jornada = await JornadaOs.abrir(ambiente, catalogo, {
      descricaoProblema: 'Barulho ao frear',
      pecas: [{ pecaId: peca.id, quantidade: unidades }],
    });
    await jornada.execution.iniciarDiagnostico();
    await jornada.execution.concluirDiagnostico(
      [
        { tipo: 'SERVICO', itemId: catalogo.servicoId, quantidade: 1 },
        { tipo: 'PECA', itemId: peca.id, quantidade: unidades },
      ],
      'Pastilhas gastas',
    );
    await jornada.billing.gerarOrcamento();
    await jornada.billing.aprovarOrcamento();
    return jornada;
  }

  get prisma() {
    return this.ambiente.prisma;
  }

  /** Entrega pela porta de entrada (a mesma que o consumidor SQS usa). */
  async entregar(mensagem: EnvelopeMensagem): Promise<void> {
    this.entregues.push(mensagem);
    await this.ambiente.processar.executar(JSON.stringify(mensagem));
  }

  async reentregar(mensagem: EnvelopeMensagem): Promise<void> {
    await this.ambiente.processar.executar(JSON.stringify(mensagem));
  }

  async status(): Promise<StatusOS> {
    const ordem = await this.prisma.ordemServico.findUniqueOrThrow({
      where: { id: this.ordemServicoId },
      select: { status: true },
    });
    return ordem.status;
  }

  async rodadaVigente(): Promise<number> {
    const ordem = await this.prisma.ordemServico.findUniqueOrThrow({
      where: { id: this.ordemServicoId },
      select: { rodadaVigente: true },
    });
    return ordem.rodadaVigente;
  }

  async detalhe() {
    const resposta = await this.ambiente
      .atendente()
      .get(`/v1/ordens-servico/${this.ordemServicoId}`)
      .expect(200);
    return resposta.body as {
      status: StatusOS;
      rodadaVigente: number;
      servicos: {
        servico: { id: string };
        quantidade: number;
        precoUnitario: number;
      }[];
      pecas: {
        peca: { id: string };
        quantidade: number;
        precoUnitario: number;
      }[];
      resumoFinanceiro: {
        orcamento: { orcamentoId: string; valorCentavos: number | null } | null;
        pagamento: { orderId: string; linkPagamento: string | null } | null;
      };
    };
  }

  async desistir(motivo: string): Promise<void> {
    await this.ambiente
      .atendente()
      .post(`/v1/ordens-servico/${this.ordemServicoId}/desistencia`)
      .send({ motivo })
      .expect(200);
  }

  async retirarVeiculo(): Promise<void> {
    await this.ambiente
      .atendente()
      .post(`/v1/ordens-servico/${this.ordemServicoId}/retirada`)
      .expect(200);
  }

  async historicoDeStatus(): Promise<string[]> {
    const historico = await this.prisma.historicoStatusOS.findMany({
      where: { ordemServicoId: this.ordemServicoId },
      orderBy: { ocorridoEm: 'asc' },
      select: { statusNovo: true },
    });
    return historico.map((linha) => linha.statusNovo);
  }

  novoIdDeMensagem(): string {
    return randomUUID();
  }
}
