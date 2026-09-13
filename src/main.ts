import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

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
      'API para gestão de oficina mecânica. Autenticação interna via POST /auth/login; ' +
        'clientes autenticam por POST /auth/cpf (Function serverless) e usam o accessToken como Bearer. ' +
        'Tokens de cliente acessam apenas a própria OS e orçamento.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Oficina API Docs',
  });

  await app.listen(PORT ?? 3000, '0.0.0.0');
  console.log('HTTP server running on port ', PORT);
}

bootstrap();
