import type { ContextoTransacao } from '@/shared/database/unit-of-work.port';
import type { TipoPendenciaOs } from '@/shared/generated/prisma/enums';

export interface PendenciaOsBloqueada {
  id: string;
  ordemServicoId: string;
  tipo: TipoPendenciaOs;
  resolvida: boolean;
  detalhes: Record<string, unknown>;
}

export interface RegistroResolucaoManual {
  pendenciaId: string;
  responsavelId: string;
  resolvidaEm: Date;
  /** Objeto gravado em `detalhes.resolucaoManual`, sem tocar nas demais chaves. */
  resolucaoManual: Record<string, unknown>;
}

export interface PendenciaOsGateway {
  /** Bloqueia a pendência da OS; `null` quando não existe ou pertence a outra OS. */
  bloquearDaOrdem(
    contexto: ContextoTransacao,
    ordemServicoId: string,
    pendenciaId: string,
  ): Promise<PendenciaOsBloqueada | null>;

  registrarResolucaoManual(
    contexto: ContextoTransacao,
    registro: RegistroResolucaoManual,
  ): Promise<void>;
}
