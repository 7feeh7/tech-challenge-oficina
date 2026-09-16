import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@/shared/database/prisma.service';
import { ObservabilityModule } from '@/shared/observability/observability.module';
import { AtualizarOrcamentoUseCase } from './application/use-cases/atualizar-orcamento.use-case';
import { CriarOrcamentoUseCase } from './application/use-cases/criar-orcamento.use-case';
import { OrcamentosModule } from './orcamentos.module';

/**
 * Os casos de uso de orçamento dependem do notificador exportado pelo módulo de
 * OS. Um token que deixe de ser exportado só estoura no boot da aplicação —
 * este teste monta o grafo de injeção e falha antes disso.
 */
describe('OrcamentosModule (injeção)', () => {
  it('resolve os casos de uso com o notificador vindo do módulo de OS', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // o AppModule registra o ConfigModule como global; aqui reproduzimos isso
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ObservabilityModule,
        OrcamentosModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(CriarOrcamentoUseCase)).toBeInstanceOf(
      CriarOrcamentoUseCase,
    );
    expect(moduleRef.get(AtualizarOrcamentoUseCase)).toBeInstanceOf(
      AtualizarOrcamentoUseCase,
    );
  });
});
