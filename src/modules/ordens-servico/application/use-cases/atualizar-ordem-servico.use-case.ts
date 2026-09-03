import { OrdemServicoNaoEncontradaError } from '../../domain/errors/ordem-servico.errors';
import { StatusOS } from '../../domain/status-os';
import {
  OrdemServicoOutput,
  OrdemServicoOutputMapper,
} from '../mappers/ordem-servico-output.mapper';
import { CatalogoGateway } from '../ports/catalogo.gateway';
import { NotificadorDeStatusGateway } from '../ports/notificador-status.gateway';
import {
  OrdemServicoGateway,
  RegistroDeStatus,
} from '../ports/ordem-servico.gateway';
import {
  adicionarItensNaOrdem,
  ItemPecaInput,
  ItemServicoInput,
} from './montar-itens';

export interface AtualizarOrdemServicoInput {
  status?: StatusOS;
  descricaoProblema?: string;
  diagnostico?: string;
  servicos?: ItemServicoInput[];
  pecas?: ItemPecaInput[];
}

export class AtualizarOrdemServicoUseCase {
  constructor(
    private readonly ordens: OrdemServicoGateway,
    private readonly catalogo: CatalogoGateway,
    private readonly notificador: NotificadorDeStatusGateway,
  ) {}

  async execute(
    id: string,
    input: AtualizarOrdemServicoInput,
  ): Promise<OrdemServicoOutput> {
    const ordem = await this.ordens.buscarPorId(id);
    if (!ordem) {
      throw new OrdemServicoNaoEncontradaError(id);
    }

    const statusAnterior = ordem.status;

    if (input.status !== undefined) {
      ordem.alterarStatus(input.status);
    }
    if (input.descricaoProblema !== undefined) {
      ordem.alterarDescricaoProblema(input.descricaoProblema);
    }
    if (input.diagnostico !== undefined) {
      ordem.alterarDiagnostico(input.diagnostico);
    }

    await adicionarItensNaOrdem(
      ordem,
      this.catalogo,
      input.servicos,
      input.pecas,
    );

    const registro: RegistroDeStatus | undefined =
      ordem.status === statusAnterior
        ? undefined
        : { statusAnterior, statusNovo: ordem.status };

    const detalhe = await this.ordens.atualizar(id, ordem, registro);

    if (registro) {
      await this.notificador.notificarMudancaDeStatus({
        destinatario: {
          nome: detalhe.cliente.nome,
          email: detalhe.cliente.email ?? '',
        },
        numeroOS: detalhe.ordem.numero,
        statusAnterior: registro.statusAnterior,
        statusNovo: registro.statusNovo,
      });
    }

    return OrdemServicoOutputMapper.toOutput(detalhe);
  }
}
