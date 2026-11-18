import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnvelopeMensagem } from '@/shared/messaging/envelope';

export type ServicoContrato = 'billing' | 'execution';

export interface ExemploContrato {
  servico: ServicoContrato;
  nome: string;
  envelope: EnvelopeMensagem<Record<string, unknown>>;
}

const RAIZ_CONTRATOS = join(__dirname, '../contratos');

export function listarExemplos(servico: ServicoContrato): ExemploContrato[] {
  return readdirSync(join(RAIZ_CONTRATOS, servico))
    .filter((arquivo) => arquivo.endsWith('.json'))
    .sort()
    .map((arquivo) => carregarExemplo(servico, arquivo.replace(/\.json$/, '')));
}

export function carregarExemplo(
  servico: ServicoContrato,
  nome: string,
): ExemploContrato {
  const conteudo = readFileSync(
    join(RAIZ_CONTRATOS, servico, `${nome}.json`),
    'utf8',
  );
  return {
    servico,
    nome,
    envelope: JSON.parse(conteudo) as EnvelopeMensagem<Record<string, unknown>>,
  };
}

/**
 * Compara só o formato (chaves e tipos) do que o serviço produz com o exemplo
 * publicado pelo dono do contrato. `null` é compatível com qualquer tipo
 * porque os exemplos trazem apenas uma das variações de campos anuláveis.
 */
export function descreverDiferencaDeFormato(
  referencia: unknown,
  real: unknown,
  caminho = '$',
): string[] {
  if (referencia === null || real === null) {
    return [];
  }
  if (Array.isArray(referencia) || Array.isArray(real)) {
    if (!Array.isArray(referencia) || !Array.isArray(real)) {
      return [`${caminho}: esperado lista`];
    }
    if (referencia.length === 0) {
      return [];
    }
    return real.flatMap((item, indice) =>
      descreverDiferencaDeFormato(referencia[0], item, `${caminho}[${indice}]`),
    );
  }
  if (typeof referencia === 'object' || typeof real === 'object') {
    if (typeof referencia !== typeof real) {
      return [`${caminho}: tipo ${typeof real} difere de ${typeof referencia}`];
    }
    const chavesReferencia = Object.keys(referencia as object).sort();
    const chavesReais = Object.keys(real as object).sort();
    const diferencas: string[] = [];
    for (const chave of chavesReferencia) {
      if (!chavesReais.includes(chave)) {
        diferencas.push(`${caminho}.${chave}: ausente`);
      }
    }
    for (const chave of chavesReais) {
      if (!chavesReferencia.includes(chave)) {
        diferencas.push(`${caminho}.${chave}: não existe no exemplo`);
      }
    }
    for (const chave of chavesReferencia.filter((c) =>
      chavesReais.includes(c),
    )) {
      diferencas.push(
        ...descreverDiferencaDeFormato(
          (referencia as Record<string, unknown>)[chave],
          (real as Record<string, unknown>)[chave],
          `${caminho}.${chave}`,
        ),
      );
    }
    return diferencas;
  }
  return typeof referencia === typeof real
    ? []
    : [`${caminho}: tipo ${typeof real} difere de ${typeof referencia}`];
}
