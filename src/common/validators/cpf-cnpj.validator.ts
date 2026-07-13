import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ehCpfCnpjValido } from './cpf-cnpj';

@ValidatorConstraint({ name: 'IsCpfCnpj', async: false })
export class IsCpfCnpjConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    return ehCpfCnpjValido(value);
  }

  defaultMessage(): string {
    return 'CPF ou CNPJ inválido.';
  }
}

export function IsCpfCnpj(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsCpfCnpjConstraint,
    });
  };
}
