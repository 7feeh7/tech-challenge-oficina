import { TransicaoOrdemServicoService } from './transicao-ordem-servico.service';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import {
  COMANDO_GERAR_ORCAMENTO,
  DESTINO_FILA_BILLING,
} from '@/shared/messaging/envelope';
import { PrismaContextoTransacao } from '@/shared/database/prisma-contexto-transacao';

describe('TransicaoOrdemServicoService.registrarGerarOrcamentoNaOutbox', () => {
  it('registra comando billing.gerar-orcamento.v1', async () => {
    const outbox = { registrar: jest.fn() };
    const service = new TransicaoOrdemServicoService(
      {} as never,
      outbox,
      {} as never,
    );
    const ordem = new OrdemServico({
      id: 'os-1',
      clienteId: 'c1',
      veiculoId: 'v1',
      correlationId: 'corr-1',
    });
    const contexto = new PrismaContextoTransacao({} as never);
    await service.registrarGerarOrcamentoNaOutbox(
      contexto,
      { ordem, cliente: { nome: 'n', email: 'e' }, veiculo: {} } as never,
      null,
      [
        {
          tipo: 'SERVICO',
          itemId: 's1',
          nome: 'Troca',
          quantidade: 1,
          precoUnitarioCentavos: 100,
        },
      ],
    );
    expect(outbox.registrar).toHaveBeenCalledWith(
      contexto,
      expect.objectContaining({
        eventType: COMANDO_GERAR_ORCAMENTO,
        destino: DESTINO_FILA_BILLING,
        correlationId: 'corr-1',
      }),
    );
  });
});
