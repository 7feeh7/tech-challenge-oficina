import type { UnitOfWork } from '@/shared/database/unit-of-work.port';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { TransicaoOrdemServicoService } from '@/modules/ordens-servico/application/services/transicao-ordem-servico.service';
import { Orcamento } from '../../domain/entities/orcamento.entity';
import {
  OrcamentoEmAbertoError,
  OrcamentoForaDeDiagnosticoError,
  OrdemDoOrcamentoNaoEncontradaError,
} from '../../domain/errors/orcamento.errors';
import {
  OrcamentoOutput,
  OrcamentoOutputMapper,
} from '../mappers/orcamento-output.mapper';
import { OrcamentoGateway } from '../ports/orcamento.gateway';

export interface CriarOrcamentoInput {
  ordemServicoId: string;
  valorTotal: number;
  observacoes?: string;
}

export class CriarOrcamentoUseCase {
  constructor(
    private readonly orcamentos: OrcamentoGateway,
    private readonly unitOfWork: UnitOfWork,
    private readonly transicoes: TransicaoOrdemServicoService,
  ) {}

  async execute(input: CriarOrcamentoInput): Promise<OrcamentoOutput> {
    const ordem = await this.orcamentos.buscarOrdemParaOrcamento(
      input.ordemServicoId,
    );
    if (!ordem) {
      throw new OrdemDoOrcamentoNaoEncontradaError(input.ordemServicoId);
    }
    if (ordem.status !== StatusOS.EM_DIAGNOSTICO) {
      throw new OrcamentoForaDeDiagnosticoError();
    }

    const jaTemProposta =
      await this.orcamentos.existeOrcamentoAguardandoAprovacao(
        input.ordemServicoId,
      );
    if (jaTemProposta) {
      throw new OrcamentoEmAbertoError(input.ordemServicoId);
    }

    const orcamento = new Orcamento(input);

    const criado = await this.unitOfWork.executar(async (contexto) => {
      const persistido = await this.orcamentos.criar(contexto, orcamento);
      await this.transicoes.aplicar(contexto, {
        ordemServicoId: input.ordemServicoId,
        aplicar: (os, ocorridoEm) => {
          // Sob o lock da OS: a checagem fora da transação não impede duas
          // requisições simultâneas, e repetir o mesmo status não é erro na entidade.
          if (os.status === StatusOS.AGUARDANDO_APROVACAO) {
            throw new OrcamentoEmAbertoError(input.ordemServicoId);
          }
          os.registrarOrcamentoGerado(ocorridoEm);
        },
        observacao: 'Orçamento gerado',
      });
      return persistido;
    });

    return OrcamentoOutputMapper.toOutput(criado);
  }
}
