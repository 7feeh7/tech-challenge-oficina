import { StatusOS } from '../../domain/status-os';
import { OrdemServicoOutputMapper } from './ordem-servico-output.mapper';
import { criarDetalheFake } from '../use-cases/test-doubles';

describe('OrdemServicoOutputMapper', () => {
  it('monta resumo para listagem', () => {
    const resumo = OrdemServicoOutputMapper.toResumo(criarDetalheFake());

    expect(resumo).toMatchObject({
      id: 'uuid-os1',
      status: StatusOS.RECEBIDA,
      rodadaVigente: 1,
    });
  });

  it('monta detalhe completo com sugestões e correlationId', () => {
    const detalhe = criarDetalheFake({
      correlationId: 'corr-os',
      etapaOrigemCancelamento: StatusOS.EM_EXECUCAO,
      motivoEncerramento: 'Desistiu',
      veiculoLiberadoRetirada: true,
    });
    detalhe.sugestoes = [{ tipo: 'PECA', itemId: 'p1', quantidade: 1 }];

    const output = OrdemServicoOutputMapper.toOutput(detalhe);

    expect(output.correlationId).toBe('corr-os');
    expect(output.sugestoes).toHaveLength(1);
    expect(output.etapaOrigemCancelamento).toBe(StatusOS.EM_EXECUCAO);
    expect(output.motivoEncerramento).toBe('Desistiu');
    expect(output.veiculoLiberadoRetirada).toBe(true);
  });
});
