import { ErroMensagemPermanente } from '../../domain/mensageria.errors';
import type { ProcessadorMensagem } from '../ports/processador-mensagem.port';
import { RoteadorProcessadoresMensagemService } from './roteador-processadores-mensagem.service';

describe('RoteadorProcessadoresMensagemService', () => {
  it('encaminha ao processador registrado', async () => {
    const processar = jest.fn().mockResolvedValue(undefined);
    const processador: ProcessadorMensagem = {
      eventType: 'billing.teste.v1',
      processar,
    };
    const roteador = new RoteadorProcessadoresMensagemService([processador]);

    await roteador.processar({} as never, {
      eventType: 'billing.teste.v1',
    } as never);

    expect(processar).toHaveBeenCalled();
  });

  it('rejeita tipo sem processador', async () => {
    const roteador = new RoteadorProcessadoresMensagemService([]);
    await expect(
      roteador.processar({} as never, {
        eventType: 'desconhecido.v1',
      } as never),
    ).rejects.toThrow(ErroMensagemPermanente);
  });
});