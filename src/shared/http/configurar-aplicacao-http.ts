import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const PREFIXO_GLOBAL = 'v1';
const PREFIXO_ROTAS_INTERNAS = '/internal';

function configurarPrefixoGlobal(app: NestFastifyApplication): void {
  app.setGlobalPrefix(PREFIXO_GLOBAL, {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
      { path: 'internal', method: RequestMethod.ALL },
      { path: 'internal/(.*)', method: RequestMethod.ALL },
    ],
  });
}

function configurarSwagger(app: NestFastifyApplication): void {
  const configuracao = new DocumentBuilder()
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

  const documento = SwaggerModule.createDocument(app, configuracao);
  for (const caminho of Object.keys(documento.paths)) {
    if (caminho.startsWith(PREFIXO_ROTAS_INTERNAS)) {
      delete documento.paths[caminho];
    }
  }

  SwaggerModule.setup('docs', app, documento, {
    customSiteTitle: 'Oficina API Docs',
  });
}

/** Configuração HTTP compartilhada entre o `main.ts` e os testes e2e. */
export function configurarAplicacaoHttp(app: NestFastifyApplication): void {
  configurarPrefixoGlobal(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  configurarSwagger(app);
}
