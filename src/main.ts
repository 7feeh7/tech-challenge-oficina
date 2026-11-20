import '@/tracer';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '@/app.module';
import { JsonLoggerService } from '@/shared/observability/json-logger.service';
import { registerRequestObservabilityHook } from '@/shared/observability/request-observability.hook';
import { validarConfiguracaoOs } from '@/shared/config/validar-configuracao-os';
import { configurarAplicacaoHttp } from '@/shared/http/configurar-aplicacao-http';

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  validarConfiguracaoOs();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  const logger = app.get(JsonLoggerService);
  app.useLogger(logger);
  app.enableShutdownHooks();
  registerRequestObservabilityHook(app.getHttpAdapter().getInstance(), logger);

  configurarAplicacaoHttp(app);

  await app.listen(PORT ?? 3000, '0.0.0.0');
  logger.log(`HTTP server running on port ${PORT}`, 'Bootstrap');
}

bootstrap();
