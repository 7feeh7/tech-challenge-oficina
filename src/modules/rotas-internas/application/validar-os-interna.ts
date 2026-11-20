import { OrdemServico } from '@/modules/ordens-servico/domain/entities/ordem-servico.entity';
import {
  estaEncerrada,
  StatusOS,
} from '@/modules/ordens-servico/domain/status-os';
import {
  OsEmCancelamentoInternaError,
  RodadaObsoletaInternaError,
} from '../domain/erros-internos';

export function validarRodadaEVidaOs(
  ordem: OrdemServico,
  rodada: number,
): void {
  if (
    ordem.status === StatusOS.EM_CANCELAMENTO ||
    estaEncerrada(ordem.status)
  ) {
    throw new OsEmCancelamentoInternaError();
  }
  if (ordem.rodadaVigente !== rodada) {
    throw new RodadaObsoletaInternaError(rodada);
  }
}

export function recusarIdempotenciaSeCancelada(ordem: OrdemServico): void {
  if (
    ordem.status === StatusOS.EM_CANCELAMENTO ||
    estaEncerrada(ordem.status)
  ) {
    throw new OsEmCancelamentoInternaError();
  }
}
