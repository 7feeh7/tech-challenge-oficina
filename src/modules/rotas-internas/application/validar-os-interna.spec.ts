import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import {
  OsEmCancelamentoInternaError,
  RodadaObsoletaInternaError,
} from '../domain/erros-internos';
import {
  recusarIdempotenciaSeCancelada,
  validarRodadaEVidaOs,
} from './validar-os-interna';

describe('validar-os-interna', () => {
  const ordem = () =>
    new OrdemServico({
      clienteId: 'c1',
      veiculoId: 'v1',
      status: StatusOS.EM_DIAGNOSTICO,
      rodadaVigente: 2,
    });

  it('recusa rodada obsoleta', () => {
    expect(() => validarRodadaEVidaOs(ordem(), 1)).toThrow(
      RodadaObsoletaInternaError,
    );
  });

  it('recusa status encerrado', () => {
    const encerrada = new OrdemServico({
      clienteId: 'c1',
      veiculoId: 'v1',
      status: StatusOS.CANCELADA,
      rodadaVigente: 2,
    });
    expect(() => validarRodadaEVidaOs(encerrada, 2)).toThrow(
      OsEmCancelamentoInternaError,
    );
  });

  it('recusa cancelamento', () => {
    const cancelada = new OrdemServico({
      clienteId: 'c1',
      veiculoId: 'v1',
      status: StatusOS.EM_CANCELAMENTO,
      rodadaVigente: 2,
    });
    expect(() => validarRodadaEVidaOs(cancelada, 2)).toThrow(
      OsEmCancelamentoInternaError,
    );
    expect(() => recusarIdempotenciaSeCancelada(cancelada)).toThrow(
      OsEmCancelamentoInternaError,
    );
  });

  it('recusarIdempotencia com OS finalizada', () => {
    const finalizada = new OrdemServico({
      clienteId: 'c1',
      veiculoId: 'v1',
      status: StatusOS.FINALIZADA,
    });
    expect(() => recusarIdempotenciaSeCancelada(finalizada)).toThrow(
      OsEmCancelamentoInternaError,
    );
  });
});
