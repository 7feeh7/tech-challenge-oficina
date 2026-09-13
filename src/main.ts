import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { registerCorrelationIdHook } from '@/shared/http/correlation-id.hook';

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  registerCorrelationIdHook(app.getHttpAdapter().getInstance());

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sistema de Oficina Mecânica')
    .setDescription(
      'API para gestão de oficina mecânica. Entrada pública via API Gateway. ' +
        'Autenticação interna via POST /v1/auth/login; clientes autenticam por POST /auth/cpf ' +
        '(Function serverless, sem prefixo de versão) e usam o accessToken como Bearer.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addServer(
      process.env.API_GATEWAY_URL ?? 'http://localhost:3000',
      'Gateway',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Oficina API Docs',
  });

  await app.listen(PORT ?? 3000, '0.0.0.0');
  console.log('HTTP server running on port ', PORT);
}

bootstrap();
