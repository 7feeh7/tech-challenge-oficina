import type { TestingModule } from '@nestjs/testing';

export async function fecharModuloIntegracao(
  modulo?: TestingModule,
): Promise<void> {
  if (!modulo) return;
  await modulo.close();
}
