import { UnitOfWorkFake } from '@/shared/database/unit-of-work-fake';
import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import {
  ItemPecaOrdem,
  ItemServicoOrdem,
} from '../../domain/entities/item-ordem';
import { OrdemServico } from '../../domain/entities/ordem-servico.entity';
import type { OrdemServicoGateway } from '../ports/ordem-servico.gateway';
import { TransicaoOrdemServicoService } from './transicao-ordem-servico.service';

describe('TransicaoOrdemServicoService', () => {
  const outbox = { registrar: jest.fn().mockResolvedValue(undefined) };
  const metricas = {
    recordOsCriada: jest.fn(),
    recordTransicao: jest.fn().mockResolvedValue(undefined),
  };

  const ordens: jest.Mocked<
    Pick<OrdemServicoGateway, 'criar' | 'bloquearParaAtualizacao' | 'salvar'>
  > = {
    criar: jest.fn(),
    bloquearParaAtualizacao: jest.fn(),
    salvar: jest.fn().mockResolvedValue(undefined),
  };

  let service: TransicaoOrdemServicoService;

  const criarBloqueada = () => ({
    ordem: new OrdemServico({
      id: 'os-1',
      numero: 10,
      clienteId: 'c1',
      veiculoId: 'v1',
      correlationId: 'corr-os',
    }),
    cliente: { id: 'c1', nome: 'Cliente', email: 'c@x.com' },
    veiculo: { placa: 'ABC1D23', modelo: 'Gol' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const bloqueada = criarBloqueada();
    ordens.criar.mockImplementation((_ctx, ordem) =>
      Promise.resolve({
        ...bloqueada,
        ordem,
      }),
    );
    ordens.bloquearParaAtualizacao.mockResolvedValue(bloqueada);
    service = new TransicaoOrdemServicoService(
      ordens as never,
      outbox,
      metricas as never,
    );
  });

  it('abre a OS, publica status-changed e IniciarDiagnostico', async () => {
    const ordem = new OrdemServico({
      clienteId: 'c1',
      veiculoId: 'v1',
      correlationId: 'corr-nova',
    });
    ordem.adicionarSugestao({
      tipo: 'SERVICO',
      itemId: 's1',
      quantidade: 1,
    });

    const uow = new UnitOfWorkFake();
    await uow.executar((ctx) => service.abrir(ctx, ordem));

    expect(outbox.registrar).toHaveBeenCalledTimes(2);
    expect(outbox.registrar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ correlationId: 'corr-nova' }),
    );
    expect(metricas.recordOsCriada).not.toHaveBeenCalled();
  });

  it('propaga motivo e observação no histórico', async () => {
    const uow = new UnitOfWorkFake();

    await uow.executar((ctx) =>
      service.aplicar(ctx, {
        ordemServicoId: 'os-1',
        aplicar: (ordem, agora) => ordem.registrarDesistencia('Saiu', agora),
        motivo: 'Saiu',
        observacao: 'Desistência',
      }),
    );

    expect(ordens.salvar).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(OrdemServico),
      expect.objectContaining({ motivo: 'Saiu', observacao: 'Desistência' }),
    );
  });

  it('aplica mudança com transição e outbox', async () => {
    const uow = new UnitOfWorkFake();

    const resultado = await uow.executar((ctx) =>
      service.aplicar(ctx, {
        ordemServicoId: 'os-1',
        aplicar: (ordem, agora) => ordem.registrarDiagnosticoIniciado(agora),
        observacao: 'Diag',
      }),
    );

    expect(resultado.mudouStatus).toBe(true);
    expect(ordens.salvar).toHaveBeenCalled();
    expect(outbox.registrar).toHaveBeenCalled();
  });

  it('aplica mudança sem outbox quando status não muda', async () => {
    const uow = new UnitOfWorkFake();

    await uow.executar((ctx) =>
      service.aplicar(ctx, {
        ordemServicoId: 'os-1',
        aplicar: (ordem) => ordem.alterarDescricaoProblema('Novo problema'),
      }),
    );

    expect(outbox.registrar).not.toHaveBeenCalled();
    expect(ordens.salvar).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(OrdemServico),
      undefined,
    );
  });

  it('falha quando a OS não existe', async () => {
    ordens.bloquearParaAtualizacao.mockResolvedValueOnce(null);
    const uow = new UnitOfWorkFake();

    await expect(
      uow.executar((ctx) =>
        service.aplicar(ctx, {
          ordemServicoId: 'ausente',
          aplicar: () => undefined,
        }),
      ),
    ).rejects.toThrow(OrdemServicoNaoEncontradaError);
  });

  it('honra publicarStatus=false em transição', async () => {
    const uow = new UnitOfWorkFake();
    outbox.registrar.mockClear();

    await uow.executar((ctx) =>
      service.aplicar(ctx, {
        ordemServicoId: 'os-1',
        aplicar: (ordem, agora) => ordem.registrarDiagnosticoIniciado(agora),
        publicarStatus: false,
      }),
    );

    expect(outbox.registrar).not.toHaveBeenCalled();
  });

  it('salva sem mudança de status via salvarSobBloqueio', async () => {
    const uow = new UnitOfWorkFake();
    const retorno = await uow.executar((ctx) =>
      service.salvarSobBloqueio(ctx, 'os-1', (ordem) =>
        ordem.alterarDescricaoProblema('Ajuste'),
      ),
    );
    expect(retorno.ordem).toBeDefined();
    expect(outbox.registrar).not.toHaveBeenCalled();
  });

  it('usa aplicarSobBloqueio como atalho', async () => {
    const uow = new UnitOfWorkFake();
    await uow.executar((ctx) =>
      service.aplicarSobBloqueio(ctx, 'os-1', (ordem) =>
        ordem.registrarDiagnosticoIniciado(),
      ),
    );
    expect(ordens.salvar).toHaveBeenCalled();
  });

  it('pede novo diagnóstico com os itens oficiais quando a recusa abre uma nova rodada', async () => {
    ordens.bloquearParaAtualizacao.mockResolvedValue({
      ...criarBloqueada(),
      ordem: new OrdemServico({
        id: 'os-1',
        numero: 10,
        clienteId: 'c1',
        veiculoId: 'v1',
        correlationId: 'corr-os',
        status: StatusOS.AGUARDANDO_APROVACAO,
        servicos: [
          new ItemServicoOrdem({
            servicoId: 's1',
            quantidade: 1,
            precoUnitario: 50,
          }),
        ],
        pecas: [
          new ItemPecaOrdem({ pecaId: 'p1', quantidade: 2, precoUnitario: 10 }),
        ],
      }),
    });

    const uow = new UnitOfWorkFake();
    await uow.executar((ctx) =>
      service.aplicar(ctx, {
        ordemServicoId: 'os-1',
        aplicar: (ordem, agora) => ordem.registrarOrcamentoRejeitado(agora),
      }),
    );

    expect(outbox.registrar).toHaveBeenCalledTimes(2);
    expect(outbox.registrar).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'execution.iniciar-diagnostico.v1',
        correlationId: 'corr-os',
        envelope: expect.objectContaining({
          rodada: 2,
          payload: expect.objectContaining({
            sugestoes: [
              { tipo: 'SERVICO', itemId: 's1', quantidade: 1 },
              { tipo: 'PECA', itemId: 'p1', quantidade: 2 },
            ],
          }),
        }),
      }),
    );
  });

  it('expõe registrarMetricasDaAbertura', () => {
    service.registrarMetricasDaAbertura();
    expect(metricas.recordOsCriada).toHaveBeenCalled();
  });

  it('registra métricas apenas quando houve transição', async () => {
    await service.registrarMetricasDaMudanca({
      bloqueada: criarBloqueada(),
      statusAnterior: StatusOS.RECEBIDA,
      statusNovo: StatusOS.EM_DIAGNOSTICO,
      mudouStatus: true,
    });
    expect(metricas.recordTransicao).toHaveBeenCalled();

    await service.registrarMetricasDaMudanca({
      bloqueada: criarBloqueada(),
      statusAnterior: StatusOS.RECEBIDA,
      statusNovo: StatusOS.RECEBIDA,
      mudouStatus: false,
    });
    expect(metricas.recordTransicao).toHaveBeenCalledTimes(1);
  });
});
