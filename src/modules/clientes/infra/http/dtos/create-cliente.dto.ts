import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { IsCpfCnpj } from '@/shared/validators/cpf-cnpj.validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClienteDto {
  @ApiProperty({
    example: 'João da Silva',
    description: 'Nome completo do cliente',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @ApiProperty({
    example: '12345678901',
    description: 'CPF ou CNPJ do cliente',
  })
  @IsCpfCnpj({ message: 'CPF ou CNPJ inválido.' })
  @IsNotEmpty({ message: 'O CPF/CNPJ é obrigatório.' })
  cpfCnpj!: string;

  @ApiProperty({
    example: 'joao@email.com',
    description: 'E-mail do cliente',
    required: false,
  })
  @IsEmail({}, { message: 'E-mail inválido.' })
  @IsNotEmpty({ message: 'O e-mail é obrigatório.' })
  email!: string;

  @ApiProperty({
    example: '11999999999',
    description: 'Telefone do cliente',
    required: false,
  })
  @IsString()
  @Matches(/^\+?[\d\s\-().]{8,20}$/, { message: 'Telefone inválido.' })
  @IsNotEmpty({ message: 'O telefone é obrigatório.' })
  telefone!: string;
}
