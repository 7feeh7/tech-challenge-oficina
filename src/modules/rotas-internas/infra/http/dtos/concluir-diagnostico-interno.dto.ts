import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

// O Execution identifica a tarefa por `<osId>#<rodada>#DIAGNOSTICO`; o UUID
// puro continua aceito por ser o formato anterior do contrato.
const TAREFA_ID_DIAGNOSTICO = new RegExp(
  `^(?:${UUID}#[1-9]\\d{0,8}#DIAGNOSTICO|${UUID})$`,
  'i',
);

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

  @Matches(TAREFA_ID_DIAGNOSTICO, {
    message:
      'tarefaId deve ser um UUID ou o identificador <osId>#<rodada>#DIAGNOSTICO.',
  })
  tarefaId!: string;

  @IsString()
  laudo!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemDiagnosticoDto)
  itens!: ItemDiagnosticoDto[];
}
