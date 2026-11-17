import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import type { ItemIndisponivelReserva } from '@/modules/reservas-estoque/domain/errors/reserva-estoque.errors';
import { ErroNegocioInternoError } from './erro-negocio-interno.error';

export class RodadaObsoletaInternaError extends ErroNegocioInternoError {
  constructor(rodadaInformada: number) {
    super(
      'RODADA_OBSOLETA',
      `A rodada ${rodadaInformada} não é a rodada vigente da OS.`,
      409,
    );
  }
}

export class OsEmCancelamentoInternaError extends ErroNegocioInternoError {
  constructor() {
    super('OS_EM_CANCELAMENTO', 'A OS está em cancelamento ou encerrada.', 409);
  }
}

export class EstadoIncompativelInternaError extends ErroNegocioInternoError {
  constructor(mensagem: string, status: StatusOS) {
    super('ESTADO_INCOMPATIVEL', mensagem, 409, { status });
  }
}

export class ConteudoDivergenteInternoError extends ErroNegocioInternoError {
  constructor() {
    super(
      'CONTEUDO_DIVERGENTE',
      'Mesma chave de idempotência com conteúdo diferente.',
      409,
    );
  }
}

export class ItemInvalidoInternoError extends ErroNegocioInternoError {
  constructor(itemId: string) {
    super(
      'ITEM_INVALIDO',
      'O item informado não existe, está inativo ou não pertence ao catálogo.',
      422,
      { itemId },
    );
  }
}

export class EstoqueInsuficienteInternoError extends ErroNegocioInternoError {
  constructor(itens: ItemIndisponivelReserva[]) {
    super(
      'ESTOQUE_INSUFICIENTE',
      'Estoque insuficiente para reservar os itens do orçamento.',
      409,
      {
        itensIndisponiveis: itens.map((i) => ({
          itemId: i.pecaId,
          disponivelAtual: i.disponivelAtual,
          solicitado: i.solicitado,
        })),
      },
    );
  }
}

export class ReservaDuplicadaInternaError extends ErroNegocioInternoError {
  constructor() {
    super(
      'ESTADO_INCOMPATIVEL',
      'Já existe reserva para a mesma peça nesta OS e rodada.',
      409,
    );
  }
}

export class ClienteNaoEncontradoInternoError extends ErroNegocioInternoError {
  constructor() {
    super(
      'CLIENTE_NAO_ENCONTRADO',
      'Nenhum cliente encontrado com o CPF informado.',
      404,
    );
  }
}
