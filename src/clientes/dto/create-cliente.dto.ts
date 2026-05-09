import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { IsCpfCnpj } from '@/common/validators/cpf-cnpj.validator';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  nome!: string;

  @IsCpfCnpj({ message: 'CPF ou CNPJ inválido.' })
  @IsNotEmpty({ message: 'O CPF/CNPJ é obrigatório.' })
  cpfCnpj!: string;

  @IsEmail({}, { message: 'E-mail inválido.' })
  @IsNotEmpty({ message: 'O e-mail é obrigatório.' })
  email!: string;

  @IsString()
  @Matches(/^\+?[\d\s\-().]{8,20}$/, { message: 'Telefone inválido.' })
  @IsNotEmpty({ message: 'O telefone é obrigatório.' })
  telefone!: string;
}
