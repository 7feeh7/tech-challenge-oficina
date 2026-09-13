import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_SCOPE_KEY = 'idempotentScope';

export const Idempotent = (scope: string) =>
  SetMetadata(IDEMPOTENT_SCOPE_KEY, scope);
