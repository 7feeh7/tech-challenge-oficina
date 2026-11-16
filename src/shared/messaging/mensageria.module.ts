import { Module } from '@nestjs/common';
import {
  FILA_MENSAGENS,
  MENSAGEM_PROCESSADA_GATEWAY,
  OUTBOX_GATEWAY,
  PROCESSADORES_MENSAGEM,
  PUBLICACAO_NOTIFICACAO,
} from './application/ports/tokens';
import { ProcessarMensagemEntradaService } from './application/services/processar-mensagem-entrada.service';
import { RoteadorProcessadoresMensagemService } from './application/services/roteador-processadores-mensagem.service';
import { ConsumidorFilaOsService } from './infra/consumo/consumidor-fila-os.service';
import { PublicadorOutboxService } from './infra/outbox/publicador-outbox.service';
import { PrismaMensagemProcessadaGateway } from './infra/persistence/prisma-mensagem-processada.gateway';
import { PrismaOutboxGateway } from './infra/persistence/prisma-outbox.gateway';
import { FilaSqsGateway } from './infra/sqs/fila-sqs.gateway';
import { TopicoNotificacaoSnsGateway } from './infra/sns/topico-notificacao-sns.gateway';

@Module({
  providers: [
    FilaSqsGateway,
    { provide: FILA_MENSAGENS, useExisting: FilaSqsGateway },
    TopicoNotificacaoSnsGateway,
    {
      provide: PUBLICACAO_NOTIFICACAO,
      useExisting: TopicoNotificacaoSnsGateway,
    },
    PrismaMensagemProcessadaGateway,
    {
      provide: MENSAGEM_PROCESSADA_GATEWAY,
      useExisting: PrismaMensagemProcessadaGateway,
    },
    PrismaOutboxGateway,
    { provide: OUTBOX_GATEWAY, useExisting: PrismaOutboxGateway },
    { provide: PROCESSADORES_MENSAGEM, useValue: [] },
    RoteadorProcessadoresMensagemService,
    ProcessarMensagemEntradaService,
    PublicadorOutboxService,
    ConsumidorFilaOsService,
  ],
  exports: [
    FILA_MENSAGENS,
    PUBLICACAO_NOTIFICACAO,
    MENSAGEM_PROCESSADA_GATEWAY,
    OUTBOX_GATEWAY,
    PublicadorOutboxService,
    ProcessarMensagemEntradaService,
    ConsumidorFilaOsService,
  ],
})
export class MensageriaModule {}
