import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ResolverPendenciaManualDto,
  TAMANHO_MAXIMO_MOTIVO_RESOLUCAO_MANUAL,
} from './resolver-pendencia-manual.dto';

async function validarMotivo(motivo: unknown) {
  const dto = plainToInstance(ResolverPendenciaManualDto, { motivo });
  return { dto, erros: await validate(dto) };
}

describe('ResolverPendenciaManualDto', () => {
  it('apara o motivo', async () => {
    const { dto, erros } = await validarMotivo('  estorno conferido  ');

    expect(erros).toHaveLength(0);
    expect(dto.motivo).toBe('estorno conferido');
  });

  it.each([undefined, '', '   ', 123])('recusa o motivo %p', async (motivo) => {
    const { erros } = await validarMotivo(motivo);

    expect(erros).toHaveLength(1);
  });

  it('aceita o tamanho máximo e recusa acima dele', async () => {
    const noLimite = 'a'.repeat(TAMANHO_MAXIMO_MOTIVO_RESOLUCAO_MANUAL);

    expect((await validarMotivo(noLimite)).erros).toHaveLength(0);
    expect((await validarMotivo(`${noLimite}a`)).erros).toHaveLength(1);
  });
});
