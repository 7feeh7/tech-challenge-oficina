import { SetMetadata } from '@nestjs/common';

export enum OwnershipResource {
  ORDEM_SERVICO = 'ordem-servico',
}

export const OWNERSHIP_KEY = 'ownership';

export const RequireOwnership = (resource: OwnershipResource) =>
  SetMetadata(OWNERSHIP_KEY, resource);
