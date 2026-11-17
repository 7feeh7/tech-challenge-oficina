import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import {
  ClienteDaOrdemNaoEncontradoError,
  PecaDaOrdemNaoEncontradaError,
  ServicoDaOrdemNaoEncontradoError,
  VeiculoDaOrdemNaoEncontradoError,
  VeiculoNaoPertenceAoClienteError,
} from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import { TransicaoOrdemServicoService } from '../services/transicao-ordem-servico.service';
import { CriarOrdemServicoUseCase } from './criar-ordem-servico.use-case';
import {
  criarCatalogoMock,
  criarDetalheFake,
  criarGatewayMock,
  criarOrdemFake,
} from './test-doubles';

describe('CriarOrdemServicoUseCase', () => {
  let gateway: ReturnType<typeof criarGatewayMock>;
  let catalogo: ReturnType<typeof criarCatalogoMock>;
  let transicoes: jest.Mocked<TransicaoOrdemServicoService>;
  let useCase: CriarOrdemServicoUseCase;

  const input = { clienteId: 'uuid-c1', veiculoId: 'uuid-v1' };

  beforeEach(() => {
    gateway = criarGatewayMock();
    catalogo = criarCatalogoMock();
    transicoes = {
      abrir: jest.fn().mockResolvedValue({
        ordem: criarOrdemFake({ id: 'uuid-os1' }),
        cliente: { id: 'uuid-c1', nome: 'João', email: 'joao@email.com' },
        veiculo: { placa: 'ABC1D23', modelo: 'Corolla' },
      }),
      registrarMetricasDaAbertura: jest.fn(),
    } as unknown as jest.Mocked<TransicaoOrdemServicoService>;
    useCase = new CriarOrdemServicoUseCase(
      gateway,
      catalogo,
      new UnitOfWorkFake(),
      transicoes,
    );
    gateway.buscarDetalhePorId.mockResolvedValue(criarDetalheFake());
  });

  it('abre a OS como RECEBIDA via serviço de transição', async () => {
    const result = await useCase.execute(input);

    expect(result.status).toBe(StatusOS.RECEBIDA);
    expect(transicoes.abrir).toHaveBeenCalled();
    expect(transicoes.registrarMetricasDaAbertura).toHaveBeenCalled();
  });

  it('registra sugestões sem preço e sem valor total na abertura', async () => {
    await useCase.execute({
      ...input,
      servicos: [{ servicoId: 'uuid-s1', quantidade: 2 }],
      pecas: [{ pecaId: 'uuid-p1', quantidade: 3 }],
    });

    const ordemEnviada = transicoes.abrir.mock.calls[0][1];
    expect(ordemEnviada.sugestoes).toHaveLength(2);
    expect(ordemEnviada.valorTotal()).toBe(0);
  });

  it('recusa OS de cliente inexistente', async () => {
    catalogo.clienteExiste.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(
      ClienteDaOrdemNaoEncontradoError,
    );
    expect(transicoes.abrir).not.toHaveBeenCalled();
  });

  it('recusa OS de veículo inexistente', async () => {
    catalogo.buscarVeiculo.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(
      VeiculoDaOrdemNaoEncontradoError,
    );
  });

  it('recusa veículo que não pertence ao cliente informado', async () => {
    catalogo.buscarVeiculo.mockResolvedValue({
      id: 'uuid-v1',
      clienteId: 'outro-cliente',
    });

    await expect(useCase.execute(input)).rejects.toThrow(
      VeiculoNaoPertenceAoClienteError,
    );
    expect(transicoes.abrir).not.toHaveBeenCalled();
  });

  it('recusa serviço inexistente no catálogo', async () => {
    catalogo.servicoExiste.mockResolvedValue(false);

    await expect(
      useCase.execute({ ...input, servicos: [{ servicoId: 'fantasma' }] }),
    ).rejects.toThrow(ServicoDaOrdemNaoEncontradoError);
    expect(transicoes.abrir).not.toHaveBeenCalled();
  });

  it('recusa peça inexistente no catálogo', async () => {
    catalogo.pecaExiste.mockResolvedValue(false);

    await expect(
      useCase.execute({
        ...input,
        pecas: [{ pecaId: 'fantasma', quantidade: 1 }],
      }),
    ).rejects.toThrow(PecaDaOrdemNaoEncontradaError);
  });
});
