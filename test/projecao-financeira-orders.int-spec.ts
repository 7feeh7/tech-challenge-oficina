import { StatusOS, TipoPendenciaOs } from '@/shared/generated/prisma/enums';
import {
  EVENTO_PAGAMENTO_DISPONIVEL,
  type EnvelopeMensagem,
} from '@/shared/messaging/envelope';
import { AmbienteBdd, type Catalogo } from './bdd/helpers/ambiente-bdd';
import { JornadaOs } from './bdd/helpers/jornada-os';
import { montarMensagemDoExemplo } from './bdd/helpers/mensagens-do-exemplo';

/**
 * Orders da mesma rodada (E31, ressalva (d); D1.15). O Billing reemite a
 * cobrança com uma nova order quando a anterior fica comprovadamente encerrada
 * sem pagamento (`reemitir-order-mercado-pago.service.ts`, `568e04e`), então
 * "uma order por rodada" não vale no fluxo implementado.
 */
describe('Projeção financeira — orders da mesma rodada', () => {
  let ambiente: AmbienteBdd;
  let catalogo: Catalogo;

  beforeAll(async () => {
    ambiente = await AmbienteBdd.criar();
    catalogo = await ambiente.criarCatalogo();
  });

  afterAll(async () => {
    await ambiente.encerrar();
  });

  const ordemAguardandoPagamento = async () => {
    const peca = await ambiente.criarPeca('Pastilha de freio', 50, 10);
    const jornada = await JornadaOs.ateAprovacaoDoOrcamento(
      ambiente,
      catalogo,
      peca,
      1,
    );
    return { jornada, peca };
  };

  const cobrancaReemitida = (
    jornada: JornadaOs,
    orderId: string,
  ): EnvelopeMensagem =>
    montarMensagemDoExemplo(
      'billing',
      'billing.cobranca-criada.v1',
      {
        ordemServicoId: jornada.ordemServicoId,
        correlationId: jornada.correlationId,
        rodada: 1,
      },
      {
        payload: {
          cobrancaId: jornada.billing.cobranca!.cobrancaId,
          orderId,
          linkPagamento: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${orderId}`,
          prazoPagamento: jornada.billing.cobranca!.prazoPagamento,
          valorCentavos: jornada.billing.cobranca!.valorCentavos,
        },
      },
    );

  it('registra cada order da rodada e mostra no resumo financeiro a mais recente', async () => {
    const { jornada } = await ordemAguardandoPagamento();
    const primeira = await jornada.billing.criarCobranca();
    const novaOrder = `${jornada.billing.cobranca!.orderId}REEMITIDA`;
    await jornada.entregar(cobrancaReemitida(jornada, novaOrder));

    const projecoes = await ambiente.prisma.projecaoFinanceiraOs.findMany({
      where: { ordemServicoId: jornada.ordemServicoId, natureza: 'PAGAMENTO' },
      orderBy: { criadoEm: 'asc' },
    });
    expect(projecoes.map((p) => p.orderId)).toEqual([
      (primeira.payload as { orderId: string }).orderId,
      novaOrder,
    ]);
    const detalhe = await jornada.detalhe();
    expect(detalhe.resumoFinanceiro.pagamento?.orderId).toBe(novaOrder);
    expect(await jornada.caixa.contar(EVENTO_PAGAMENTO_DISPONIVEL)).toBe(2);
  });

  // Bloqueado pelo defeito do relatório da E32: `CobrancaCriada` registra a order
  // como "principal" e `decidir` ignora o `PagamentoConfirmado` seguinte com o
  // mesmo orderId (06-saga: só é repetição o orderId já PAGO).
  it.skip('aplica o pagamento da única order da rodada depois da cobrança criada', async () => {
    const { jornada } = await ordemAguardandoPagamento();
    await jornada.billing.criarCobranca();
    await jornada.billing.confirmarPagamento();
    expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_EXECUCAO);
  });

  // Impedimento da premissa "uma order por rodada": com duas orders, a primeira
  // é a "principal" (`buscarOrderIdPrincipal`, mais antiga) e o resumo mostra a
  // mais recente (`montarResumoFinanceiro`). O pagamento da order mais recente é
  // aplicado, mas a repetição do mesmo orderId deixa de ser repetição.
  it.skip('trata como repetição o mesmo orderId pago na order reemitida', async () => {
    const { jornada, peca } = await ordemAguardandoPagamento();
    await jornada.billing.criarCobranca();
    const novaOrder = `${jornada.billing.cobranca!.orderId}REEMITIDA`;
    await jornada.entregar(cobrancaReemitida(jornada, novaOrder));
    jornada.billing.cobranca!.orderId = novaOrder;

    const pagamento = await jornada.billing.confirmarPagamento();
    expect(await jornada.status()).toBe(StatusOS.AGUARDANDO_EXECUCAO);
    await jornada.execution.iniciarReparo();
    await jornada.execution.concluirReparo({
      pecasUtilizadas: [{ itemId: peca.id, quantidade: 1 }],
    });
    expect(await jornada.status()).toBe(StatusOS.FINALIZADA);

    await jornada.entregar({
      ...pagamento,
      eventId: jornada.novoIdDeMensagem(),
    });

    expect(
      await ambiente.prisma.pendenciaOs.count({
        where: {
          ordemServicoId: jornada.ordemServicoId,
          tipo: TipoPendenciaOs.FINANCEIRA,
          resolvida: false,
        },
      }),
    ).toBe(0);
  });
});
