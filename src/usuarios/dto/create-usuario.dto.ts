import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { PerfilUsuario } from '../domain/perfil-usuario';
export class CreateUsuarioDto {
  @ApiProperty({
    example: 'Maria Souza',
    description: 'Nome completo do usuário',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @ApiProperty({
    example: 'maria@oficina.com',
    description: 'E-mail do usuário',
  })
  @IsEmail({}, { message: 'E-mail inválido.' })
  @IsNotEmpty({ message: 'O e-mail é obrigatório.' })
  email!: string;

  @ApiProperty({
    example: 'senhaSegura123',
    description: 'Senha do usuário (mínimo 8 caracteres)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @IsNotEmpty({ message: 'A senha é obrigatória.' })
  senha!: string;

  @ApiProperty({
    enum: PerfilUsuario,
    example: PerfilUsuario.ATENDENTE,
    description: 'Perfil de acesso do usuário',
  })
  @IsEnum(PerfilUsuario, { message: 'Perfil inválido.' })
  @IsNotEmpty({ message: 'O perfil é obrigatório.' })
  perfil!: PerfilUsuario;
}
