import { consolidarItensQuantidade } from './consolidar-itens-quantidade';

export const UUID_RE_PECA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_RE = UUID_RE_PECA_ID;

export interface ReservaOriginal {
  pecaId: string;
  quantidade: number;
}

export interface ResultadoCompatibilidadeFatoTardio {
  compativel: boolean;
  motivo?: string;
}

export function avaliarCompatibilidadeFatoTardio(input: {
  reservasOriginais: ReservaOriginal[];
  itensConsumidosResolucao: { itemId: string; quantidade: number }[];
  pecasUtilizadasFato: { itemId: string; quantidade: number }[];
  pecasCatalogoValidas: (pecaId: string) => boolean;
}): ResultadoCompatibilidadeFatoTardio {
  if (input.reservasOriginais.length === 0) {
    return { compativel: false, motivo: 'SEM_RESERVA_ORIGINAL' };
  }

  const reservaPorPeca = new Map(
    input.reservasOriginais.map((r) => [r.pecaId, r.quantidade]),
  );
  const consumoResolucao = new Map(
    consolidarItensQuantidade(input.itensConsumidosResolucao).map((i) => [
      i.itemId,
      i.quantidade,
    ]),
  );
  const utilizadoFato = consolidarItensQuantidade(input.pecasUtilizadasFato);

  for (const item of utilizadoFato) {
    if (!UUID_RE.test(item.itemId)) {
      return { compativel: false, motivo: 'IDENTIFICADOR_INVALIDO' };
    }
    if (!input.pecasCatalogoValidas(item.itemId)) {
      return { compativel: false, motivo: 'PECA_DESCONHECIDA' };
    }
    const reservado = reservaPorPeca.get(item.itemId);
    if (reservado === undefined) {
      return { compativel: false, motivo: 'PECA_FORA_DA_RESERVA' };
    }
    const baixaImplicita = Math.min(item.quantidade, reservado);
    if (item.quantidade > reservado) {
      return { compativel: false, motivo: 'CONSUMO_ACIMA_RESERVA' };
    }
    const esperadoResolucao = consumoResolucao.get(item.itemId) ?? 0;
    if (baixaImplicita !== esperadoResolucao) {
      return { compativel: false, motivo: 'DIVERGENCIA_RESOLUCAO' };
    }
  }

  for (const [pecaId, qtdResolucao] of consumoResolucao) {
    const utilizado = utilizadoFato.find((p) => p.itemId === pecaId);
    const qtdFato = utilizado?.quantidade ?? 0;
    const reservado = reservaPorPeca.get(pecaId) ?? 0;
    const baixaImplicita = Math.min(qtdFato, reservado);
    if (baixaImplicita !== qtdResolucao) {
      return { compativel: false, motivo: 'DIVERGENCIA_RESOLUCAO' };
    }
  }

  return { compativel: true };
}
