import { criarOrdemFake } from '@/modules/ordens-servico/application/use-cases/test-doubles';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  COMANDO_CANCELAR_FINANCEIRO,
  COMANDO_CANCELAR_TAREFA,
  COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
  DESTINO_FILA_BILLING,
  DESTINO_FILA_EXECUTION,
} from '@/shared/messaging/envelope';
import {
  ResultadoExecucaoCompensacao,
  TipoPedidoSaga,
} from '@/shared/generated/prisma/enums';
import { FinalidadeConsultaFinanceira } from '../../domain/consulta-financeira';
import { TipoTarefaCancelamento } from '../../domain/resultado-cancelamento-execucao';
import { ComandosSagaOutboxService } from './comandos-saga-outbox.service';

describe('ComandosSagaOutboxService', () => {
  const montar = () => {
    const outbox = { registrar: jest.fn() };
    const pedidos = { registrar: jest.fn() };
    const service = new ComandosSagaOutboxService(outbox, pedidos as never);
    const ordem = criarOrdemFake({
      id: 'os-1',
      correlationId: 'corr-1',
      rodadaVigente: 1,
      etapaOrigemCancelamento: StatusOS.AGUARDANDO_PAGAMENTO,
    });
    const bloqueada = {
      ordem,
      cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
      veiculo: { placa: 'ABC', modelo: 'X' },
    };
    return { service, outbox, pedidos, bloqueada };
  };

  it('emite CancelarTarefa na outbox e em pedidos_emitidos', async () => {
    const { service, outbox, pedidos, bloqueada } = montar();
    await service.emitirCancelarTarefa(
      {} as never,
      bloqueada,
      'caus',
      TipoTarefaCancelamento.REPARO,
      'motivo',
    );
    expect(outbox.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: COMANDO_CANCELAR_TAREFA,
        destino: DESTINO_FILA_EXECUTION,
      }),
    );
    expect(pedidos.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tipo: TipoPedidoSaga.CANCELAR_TAREFA }),
    );
  });

  it('emite ConsultarSituacaoFinanceira para Billing', async () => {
    const { service, outbox, pedidos, bloqueada } = montar();
    await service.emitirConsultarSituacaoFinanceira(
      {} as never,
      bloqueada,
      'caus',
      'consulta-1',
      FinalidadeConsultaFinanceira.EXCECAO_E10,
    );
    expect(outbox.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: COMANDO_CONSULTAR_SITUACAO_FINANCEIRA,
        destino: DESTINO_FILA_BILLING,
      }),
    );
    expect(pedidos.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tipo: TipoPedidoSaga.CONSULTAR_SITUACAO_FINANCEIRA,
      }),
    );
  });

  it('emite CancelarFinanceiro com etapa de origem da OS', async () => {
    const { service, outbox, bloqueada } = montar();
    await service.emitirCancelarFinanceiro(
      {} as never,
      bloqueada,
      'caus',
      ResultadoExecucaoCompensacao.REPARO_NAO_INICIADO,
      'motivo',
    );
    expect(outbox.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: COMANDO_CANCELAR_FINANCEIRO,
        destino: DESTINO_FILA_BILLING,
      }),
    );
  });

  it('usa RECEBIDA quando etapaOrigemCancelamento ausente', async () => {
    const { service, outbox } = montar();
    const ordem = criarOrdemFake({
      id: 'os-2',
      correlationId: 'corr-2',
      etapaOrigemCancelamento: undefined,
    });
    const bloqueada = {
      ordem,
      cliente: { id: 'c1', nome: 'A', email: 'a@b.com' },
      veiculo: { placa: 'ABC', modelo: 'X' },
    };
    await service.emitirCancelarFinanceiro(
      {} as never,
      bloqueada,
      'caus',
      ResultadoExecucaoCompensacao.REPARO_INICIADO,
      'motivo',
    );
    const envelope = outbox.registrar.mock.calls[0][1].envelope as {
      payload: { etapaOrigem: StatusOS };
    };
    expect(envelope.payload.etapaOrigem).toBe(StatusOS.RECEBIDA);
  });
});
