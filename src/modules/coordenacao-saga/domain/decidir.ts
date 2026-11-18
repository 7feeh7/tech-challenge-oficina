import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { AcaoDecisao } from './acao-decisao';
import type { OrdemParaDecisao } from './ordem-para-decisao';
import { TipoFatoSaga } from './tipo-fato-saga';

const STATUS_ENCERRADOS_SEM_REGRESSAO: StatusOS[] = [
  StatusOS.FINALIZADA,
  StatusOS.CANCELADA,
  StatusOS.ENTREGUE,
];

function rodadaAntiga(ordem: OrdemParaDecisao): boolean {
  return ordem.rodadaFato < ordem.rodadaVigente;
}

function fatoFinanceiro(fato: TipoFatoSaga): boolean {
  return fato === TipoFatoSaga.PAGAMENTO_CONFIRMADO;
}

function estadoEsperadoPrincipal(
  fato: TipoFatoSaga,
  ordem: OrdemParaDecisao,
): StatusOS | null {
  switch (fato) {
    case TipoFatoSaga.DIAGNOSTICO_INICIADO:
      if (ordem.rodadaFato >= 2 && ordem.status === StatusOS.EM_DIAGNOSTICO) {
        return StatusOS.EM_DIAGNOSTICO;
      }
      return StatusOS.RECEBIDA;
    case TipoFatoSaga.TAREFA_DEVOLVIDA_A_FILA:
      return StatusOS.EM_DIAGNOSTICO;
    case TipoFatoSaga.ORCAMENTO_GERADO:
      return StatusOS.EM_DIAGNOSTICO;
    case TipoFatoSaga.ORCAMENTO_REJEITADO:
      return StatusOS.AGUARDANDO_APROVACAO;
    case TipoFatoSaga.PAGAMENTO_CONFIRMADO:
      return StatusOS.AGUARDANDO_PAGAMENTO;
    case TipoFatoSaga.REPARO_INICIADO:
      return StatusOS.AGUARDANDO_EXECUCAO;
    case TipoFatoSaga.REPARO_CONCLUIDO:
      return StatusOS.EM_EXECUCAO;
    default:
      return null;
  }
}

export function decidir(
  fato: TipoFatoSaga,
  ordem: OrdemParaDecisao,
): AcaoDecisao {
  if (rodadaAntiga(ordem)) {
    return AcaoDecisao.IGNORAR;
  }

  if (
    fato === TipoFatoSaga.PAGAMENTO_CONFIRMADO &&
    ordem.orderIdFato &&
    ordem.ordersPagas.includes(ordem.orderIdFato)
  ) {
    return AcaoDecisao.IGNORAR;
  }

  if (
    fato === TipoFatoSaga.ORCAMENTO_REJEITADO &&
    ordem.status === StatusOS.EM_CANCELAMENTO
  ) {
    return AcaoDecisao.IGNORAR;
  }

  if (
    fato === TipoFatoSaga.PAGAMENTO_TARDIO_REGISTRADO &&
    [StatusOS.CANCELADA, StatusOS.ENTREGUE].includes(ordem.status)
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.SITUACAO_FINANCEIRA &&
    ordem.consultaIdFato &&
    ordem.consultaIdVigente &&
    ordem.consultaIdFato !== ordem.consultaIdVigente
  ) {
    return AcaoDecisao.IGNORAR;
  }

  if (
    fato === TipoFatoSaga.SITUACAO_FINANCEIRA &&
    ordem.status === StatusOS.EM_CANCELAMENTO &&
    ordem.emCompensacaoConsultaE10
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    (fato === TipoFatoSaga.RESPOSTA_CANCELAMENTO ||
      fato === TipoFatoSaga.RESPOSTA_CANCELAMENTO_FINANCEIRO ||
      fato === TipoFatoSaga.REPARO_INTERROMPIDO) &&
    ordem.status === StatusOS.EM_CANCELAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.REPARO_FALHOU &&
    [
      StatusOS.EM_EXECUCAO,
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_CANCELAMENTO,
    ].includes(ordem.status)
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.COBRANCA_EXPIRADA &&
    ordem.status === StatusOS.AGUARDANDO_PAGAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.SITUACAO_FINANCEIRA &&
    ordem.status === StatusOS.AGUARDANDO_PAGAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.COBRANCA_CRIADA &&
    ordem.status === StatusOS.AGUARDANDO_PAGAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.REPARO_INICIADO &&
    ordem.status === StatusOS.EM_CANCELAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    (fato === TipoFatoSaga.ESTORNO_CONCLUIDO ||
      fato === TipoFatoSaga.PENDENCIA_RESOLVIDA) &&
    ordem.status === StatusOS.EM_CANCELAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    (fato === TipoFatoSaga.ESTORNO_CONCLUIDO ||
      fato === TipoFatoSaga.PENDENCIA_RESOLVIDA) &&
    [StatusOS.CANCELADA, StatusOS.ENTREGUE, StatusOS.FINALIZADA].includes(
      ordem.status,
    )
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.PAGAMENTO_CONFIRMADO &&
    ordem.status === StatusOS.EM_CANCELAMENTO
  ) {
    return AcaoDecisao.CONCILIAR;
  }

  if (
    fato === TipoFatoSaga.PAGAMENTO_CONFIRMADO &&
    ordem.orderIdFato &&
    ordem.ordersPagas.length > 0 &&
    [
      StatusOS.AGUARDANDO_EXECUCAO,
      StatusOS.EM_EXECUCAO,
      StatusOS.FINALIZADA,
    ].includes(ordem.status)
  ) {
    return AcaoDecisao.CONCILIAR;
  }

  if (
    fato === TipoFatoSaga.REPARO_CONCLUIDO &&
    ordem.status === StatusOS.EM_CANCELAMENTO
  ) {
    return AcaoDecisao.APLICAR;
  }

  if (
    fato === TipoFatoSaga.REPARO_CONCLUIDO &&
    ordem.status === StatusOS.AGUARDANDO_EXECUCAO
  ) {
    return AcaoDecisao.APLICAR;
  }

  const esperado = estadoEsperadoPrincipal(fato, ordem);
  if (esperado !== null && ordem.status === esperado) {
    return AcaoDecisao.APLICAR;
  }

  if (fatoFinanceiro(fato)) {
    return AcaoDecisao.CONCILIAR;
  }

  if (STATUS_ENCERRADOS_SEM_REGRESSAO.includes(ordem.status)) {
    return AcaoDecisao.IGNORAR;
  }

  return AcaoDecisao.IGNORAR;
}
