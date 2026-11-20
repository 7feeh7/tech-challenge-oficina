import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { TipoPedidoSaga } from '@/shared/generated/prisma/enums';

export interface RegistrarPedidoEmitidoInput {
  ordemServicoId: string;
  rodada: number;
  tipo: TipoPedidoSaga;
  destino: string;
  eventId: string;
}

export interface PedidoEmitidoGateway {
  registrar(
    contexto: ContextoTransacao,
    input: RegistrarPedidoEmitidoInput,
  ): Promise<void>;

  existeEmitido(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    tipo: TipoPedidoSaga,
  ): Promise<boolean>;

  marcarConcluidoPorTipo(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    rodada: number,
    tipo: TipoPedidoSaga,
  ): Promise<void>;
}
