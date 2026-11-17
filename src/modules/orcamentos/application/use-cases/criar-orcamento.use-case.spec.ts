import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import {
  OrcamentoEmAbertoError,
  OrcamentoForaDeDiagnosticoError,
  OrdemDoOrcamentoNaoEncontradaError,
  ValorOrcamentoInvalidoError,
} from '../../domain/errors/orcamento.errors';
import { StatusOrcamento } from '../../domain/status-orcamento';
import { CriarOrcamentoUseCase } from './criar-orcamento.use-case';
import { criarGatewayMock, criarOrcamentoFake } from './test-doubles';

describe('CriarOrcamentoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let transicoes: jest.Mocked<TransicaoOrdemServicoService>;
  let useCase: CriarOrcamentoUseCase;

  const input = { ordemServicoId: 'uuid-os1', valorTotal: 350 };

  beforeEach(() => {
    gateway = criarGatewayMock();
    transicoes = {
      aplicar: jest.fn().mockResolvedValue({ mudouStatus: true }),
    } as unknown as jest.Mocked<TransicaoOrdemServicoService>;
    useCase = new CriarOrcamentoUseCase(
      gateway,
      new UnitOfWorkFake(),
      transicoes,
    );
    gateway.criar.mockImplementation((_, orcamento) =>
      Promise.resolve(
        criarOrcamentoFake({
          id: 'uuid-orc1',
          ordemServicoId: orcamento.ordemServicoId,
          valorTotal: orcamento.valorTotal,
          observacoes: orcamento.observacoes,
          status: orcamento.status,
        }),
      ),
    );
  });

  it('persiste observações opcionais', async () => {
    const result = await useCase.execute({
      ...input,
      observacoes: 'Inclui revisão',
    });

    expect(result.observacoes).toBe('Inclui revisão');
  });

  it('cria o orçamento e move a OS para aguardando aprovação', async () => {
    const result = await useCase.execute(input);

    expect(result).toMatchObject({
      ordemServicoId: 'uuid-os1',
      valorTotal: 350,
      status: StatusOrcamento.AGUARDANDO_APROVACAO,
    });
    expect(gateway.criar).toHaveBeenCalled();
    expect(transicoes.aplicar).toHaveBeenCalled();
  });

  it('falha quando a OS não existe', async () => {
    gateway.buscarOrdemParaOrcamento.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      OrdemDoOrcamentoNaoEncontradaError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa orçamento fora de EM_DIAGNOSTICO', async () => {
    gateway.buscarOrdemParaOrcamento.mockResolvedValue({
      id: 'uuid-os1',
      status: StatusOS.RECEBIDA,
      rodadaVigente: 1,
      pecas: [],
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      OrcamentoForaDeDiagnosticoError,
    );
  });

  it('recusa valor inválido', async () => {
    await expect(useCase.execute({ ...input, valorTotal: 0 })).rejects.toThrow(
      ValorOrcamentoInvalidoError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa um segundo orçamento enquanto o atual aguarda aprovação', async () => {
    gateway.existeOrcamentoAguardandoAprovacao.mockResolvedValue(true);

    await expect(useCase.execute(input)).rejects.toThrow(
      OrcamentoEmAbertoError,
    );
    expect(gateway.criar).not.toHaveBeenCalled();
  });

  it('recusa sob o lock da OS quando outra requisição já gerou o orçamento', async () => {
    const ordemJaAguardando = new OrdemServico({
      id: 'uuid-os1',
      clienteId: 'uuid-c1',
      veiculoId: 'uuid-v1',
      status: StatusOS.AGUARDANDO_APROVACAO,
    });
    transicoes.aplicar.mockImplementation((_contexto, entrada) => {
      entrada.aplicar(ordemJaAguardando, new Date());
      return Promise.resolve({} as never);
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      OrcamentoEmAbertoError,
    );
  });
});
