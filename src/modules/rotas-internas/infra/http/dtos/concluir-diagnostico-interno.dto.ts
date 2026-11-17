import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class ItemDiagnosticoDto {
  @IsIn(['PECA', 'SERVICO'])
  tipo!: 'PECA' | 'SERVICO';

  @IsUUID()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantidade!: number;
}

export class ConcluirDiagnosticoInternoDto {
  @IsInt()
  @Min(1)
  rodada!: number;

  @IsUUID()
  tarefaId!: string;

  @IsString()
  laudo!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemDiagnosticoDto)
  itens!: ItemDiagnosticoDto[];
}
