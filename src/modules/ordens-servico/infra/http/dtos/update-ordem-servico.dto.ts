import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateOrdemServicoDto {
  @ApiPropertyOptional({
    description: 'Descrição do problema relatado pelo cliente',
  })
  @IsString()
  @IsOptional()
  descricaoProblema?: string;
}
