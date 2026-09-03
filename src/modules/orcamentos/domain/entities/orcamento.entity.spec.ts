import {
  MotivoRejeicaoObrigatorioError,
  ValorOrcamentoInvalidoError,
} from '../errors/orcamento.errors';
import { StatusOrcamento } from '../status-orcamento';
import { Orcamento } from './orcamento.entity';

const props = { ordemServicoId: 'uuid-os1', valorTotal: 350 };

describe('Orcamento', () => {
  it('nasce aguardando aprovação', () => {
    expect(new Orcamento(props).status).toBe(
      StatusOrcamento.AGUARDANDO_APROVACAO,
    );
  });

  it('não instancia orçamento com valor zero ou negativo', () => {
    expect(() => new Orcamento({ ...props, valorTotal: 0 })).toThrow(
      ValorOrcamentoInvalidoError,
    );
  });

  it('aprova carimbando a data', () => {
    const orcamento = new Orcamento(props);
    const agora = new Date('2026-01-01T10:00:00Z');

    orcamento.aprovar(agora);

    expect(orcamento.status).toBe(StatusOrcamento.APROVADO);
    expect(orcamento.aprovadoEm).toEqual(agora);
    expect(orcamento.estaAprovado()).toBe(true);
  });

  it('não reescreve a data de uma aprovação anterior', () => {
    const aprovacaoOriginal = new Date('2026-01-01T10:00:00Z');
    const orcamento = new Orcamento({
      ...props,
      status: StatusOrcamento.APROVADO,
      aprovadoEm: aprovacaoOriginal,
    });

    orcamento.aprovar(new Date());

    expect(orcamento.aprovadoEm).toEqual(aprovacaoOriginal);
  });

  it('rejeita exigindo o motivo', () => {
    const orcamento = new Orcamento(props);

    orcamento.rejeitar('Cliente achou caro');

    expect(orcamento.status).toBe(StatusOrcamento.REJEITADO);
    expect(orcamento.motivoRejeicao).toBe('Cliente achou caro');
    expect(orcamento.rejeitadoEm).not.toBeNull();
  });

  it('recusa rejeição sem motivo', () => {
    const orcamento = new Orcamento(props);

    expect(() => orcamento.rejeitar()).toThrow(MotivoRejeicaoObrigatorioError);
    expect(() => orcamento.rejeitar('   ')).toThrow(
      MotivoRejeicaoObrigatorioError,
    );
    expect(orcamento.status).toBe(StatusOrcamento.AGUARDANDO_APROVACAO);
  });
});
