import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { EstoqueInsuficienteReservaError } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ReservarEstoqueUseCase } from '@/modules/reservas-estoque/application/use-cases/reservar-estoque.use-case';
import {
  EstoqueInsuficienteParaAprovacaoError,
  OrcamentoNaoEncontradoError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { AtualizarOrcamentoUseCase } from './atualizar-orcamento.use-case';
import { criarGatewayMock, criarOrcamentoFake } from './test-doubles';

describe('AtualizarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let transicoes: jest.Mocked<TransicaoOrdemServicoService>;
  let reservarEstoque: jest.Mocked<ReservarEstoqueUseCase>;
  let useCase: AtualizarOrcamentoUseCase;

  beforeEach(() => {
    gateway = criarGatewayMock();
    transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: true }),
    } as unknown as jest.Mocked<TransicaoOrdemServicoService>;
    reservarEstoque = {
      execute: jest.fn().mockResolvedValue({
        grupoReservaId: 'grp-1',
        prazoReferencia: null,
        linhas: [],
        reutilizado: false,
      }),
    } as unknown as jest.Mocked<ReservarEstoqueUseCase>;
    useCase = new AtualizarOrcamentoUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
      reservarEstoque,
    );
    gateway.buscarPorId.mockResolvedValue(
      criarOrcamentoFake({ status: StatusOrcamento.AGUARDANDO_APROVACAO }),
    );
    gateway.atualizar.mockImplementation((_, orcamento) =>
      Promise.resolve(orcamento),
    );
  });

  it('aprova com reserva e move a OS para AGUARDANDO_PAGAMENTO', async () => {
    const result = await useCase.execute('uuid-orc1', {
      status: StatusOrcamento.APROVADO,
    });

    expect(result.status).toBe(StatusOrcamento.APROVADO);
    expect(reservarEstoque.execute).toHaveBeenCalled();
    expect(transicoes.aplicar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        observacao: expect.stringContaining('reserva'),
      }),
    );
  });

  it('rejeita e devolve a OS ao diagnóstico', async () => {
    await useCase.execute('uuid-orc1', {
      status: StatusOrcamento.REJEITADO,
      motivoRejeicao: 'Caro',
    });

    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('mapeia falta de estoque na reserva para erro de aprovação', async () => {
    reservarEstoque.execute.mockRejectedValue(
      new EstoqueInsuficienteReservaError([
        { pecaId: 'p1', disponivelAtual: 1, solicitado: 3 },
      ]),
    );

    await expect(
      useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO }),
    ).rejects.toThrow(EstoqueInsuficienteParaAprovacaoError);
  });

  it('falha quando o orçamento não existe', async () => {
    gateway.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('ausente', { status: StatusOrcamento.APROVADO }),
    ).rejects.toThrow(OrcamentoNaoEncontradoError);
  });

  it('atualiza campos sem mudar status do orçamento', async () => {
    const result = await useCase.execute('uuid-orc1', {
      valorTotal: 500,
      observacoes: 'Revisado',
    });

    expect(result.valorTotal).toBe(500);
    expect(reservarEstoque.execute).not.toHaveBeenCalled();
  });

  it('não reaprova idempotentemente', async () => {
    gateway.buscarPorId.mockResolvedValue(
      criarOrcamentoFake({ status: StatusOrcamento.APROVADO }),
    );

    await useCase.execute('uuid-orc1', { status: StatusOrcamento.APROVADO });

    expect(reservarEstoque.execute).not.toHaveBeenCalled();
  });

  it('não devolve ao diagnóstico quando a OS não está aguardando aprovação', async () => {
    gateway.buscarOrdemParaOrcamento.mockResolvedValue({
      id: 'uuid-os1',
      status: StatusOS.EM_DIAGNOSTICO,
      rodadaVigente: 2,
      pecas: [],
    });

    await useCase.execute('uuid-orc1', {
      status: StatusOrcamento.REJEITADO,
      motivoRejeicao: 'Tarde',
    });

    const aplicar = transicoes.aplicar.mock.calls[0][1];
    const ordemFake = {
      status: StatusOS.EM_DIAGNOSTICO,
      registrarOrcamentoRejeitado: jest.fn(),
    } as never;
    aplicar.aplicar(ordemFake, new Date());
    expect(ordemFake.registrarOrcamentoRejeitado).not.toHaveBeenCalled();
  });
});
