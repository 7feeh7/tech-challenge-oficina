import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class AlterarStatusClienteDto {
  @ApiProperty({
    example: false,
    description: 'Define se o cliente permanece ativo',
  })
  @IsBoolean()
  ativo: boolean;
}
