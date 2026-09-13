import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { PrismaService } from '@/shared/database/prisma.service';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: o processo está de pé' })
  @ApiResponse({ status: 200, description: 'Aplicação viva.' })
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: a aplicação consegue atender' })
  @ApiResponse({ status: 200, description: 'Pronta para receber tráfego.' })
  @ApiResponse({ status: 503, description: 'Banco de dados indisponível.' })
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível.');
    }

    return { status: 'ok' };
  }
}
