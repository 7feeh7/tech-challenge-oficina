import { Module } from '@nestjs/common';
import { TokenChamadorInternoGuard } from './guards/token-chamador-interno.guard';
import { IdempotencyKeyInternaGuard } from './guards/idempotency-key-interna.guard';

@Module({
  providers: [TokenChamadorInternoGuard, IdempotencyKeyInternaGuard],
  exports: [TokenChamadorInternoGuard, IdempotencyKeyInternaGuard],
})
export class RotasInternasModule {}
