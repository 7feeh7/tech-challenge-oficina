import { IsCpfCnpjConstraint } from './cpf-cnpj.validator';

describe('IsCpfCnpjConstraint', () => {
  let constraint: IsCpfCnpjConstraint;

  beforeEach(() => {
    constraint = new IsCpfCnpjConstraint();
  });

  describe('defaultMessage', () => {
    it('deve retornar mensagem de erro padrão', () => {
      // Arrange & Act
      const message = constraint.defaultMessage();

      // Assert
      expect(message).toBe('CPF ou CNPJ inválido.');
    });
  });

  describe('validate — CPF', () => {
    it('deve aceitar CPF válido sem formatação', () => {
      // Arrange
      const cpfValido = '52998224725';

      // Act & Assert
      expect(constraint.validate(cpfValido)).toBe(true);
    });

    it('deve aceitar CPF válido com formatação', () => {
      // Arrange
      const cpfFormatado = '529.982.247-25';

      // Act & Assert
      expect(constraint.validate(cpfFormatado)).toBe(true);
    });

    it('deve rejeitar CPF com todos os dígitos iguais', () => {
      // Arrange
      const cpfRepeticao = '111.111.111-11';

      // Act & Assert
      expect(constraint.validate(cpfRepeticao)).toBe(false);
    });

    it('deve rejeitar CPF com dígito verificador errado', () => {
      // Arrange
      const cpfInvalido = '52998224700';

      // Act & Assert
      expect(constraint.validate(cpfInvalido)).toBe(false);
    });

    it('deve rejeitar CPF com segundo dígito verificador errado', () => {
      // Arrange
      // Primeiro dígito correto (7), segundo errado (0 em vez de 5)
      const cpfInvalido = '52998224720';

      // Act & Assert
      expect(constraint.validate(cpfInvalido)).toBe(false);
    });

    it('deve rejeitar CPF com comprimento errado', () => {
      // Arrange
      const cpfCurto = '1234567890';

      // Act & Assert
      expect(constraint.validate(cpfCurto)).toBe(false);
    });
  });

  describe('validate — CNPJ', () => {
    it('deve aceitar CNPJ válido sem formatação', () => {
      // Arrange
      const cnpjValido = '11222333000181';

      // Act & Assert
      expect(constraint.validate(cnpjValido)).toBe(true);
    });

    it('deve aceitar CNPJ válido com formatação', () => {
      // Arrange
      const cnpjFormatado = '11.222.333/0001-81';

      // Act & Assert
      expect(constraint.validate(cnpjFormatado)).toBe(true);
    });

    it('deve rejeitar CNPJ com todos os dígitos iguais', () => {
      // Arrange
      const cnpjRepeticao = '11.111.111/1111-11';

      // Act & Assert
      expect(constraint.validate(cnpjRepeticao)).toBe(false);
    });

    it('deve rejeitar CNPJ com primeiro dígito verificador errado', () => {
      // Arrange
      const cnpjInvalido = '11222333000100';

      // Act & Assert
      expect(constraint.validate(cnpjInvalido)).toBe(false);
    });

    it('deve rejeitar CNPJ com segundo dígito verificador errado', () => {
      // Arrange
      // Primeiro dígito correto (8), segundo errado (0 em vez de 1)
      const cnpjInvalido = '11222333000180';

      // Act & Assert
      expect(constraint.validate(cnpjInvalido)).toBe(false);
    });

    it('deve rejeitar CNPJ com comprimento errado', () => {
      // Arrange
      const cnpjCurto = '1122233300018';

      // Act & Assert
      expect(constraint.validate(cnpjCurto)).toBe(false);
    });
  });

  describe('validate — casos extremos', () => {
    it('deve rejeitar valor vazio', () => {
      // Arrange & Act & Assert
      expect(constraint.validate('')).toBe(false);
    });

    it('deve rejeitar valor com comprimento diferente de 11 ou 14', () => {
      // Arrange & Act & Assert
      expect(constraint.validate('123456789012')).toBe(false);
    });

    it('deve tratar valor nulo sem lançar exceção', () => {
      // Arrange & Act & Assert
      expect(constraint.validate(null as unknown as string)).toBe(false);
    });

    it('deve tratar valor undefined sem lançar exceção', () => {
      // Arrange & Act & Assert
      expect(constraint.validate(undefined as unknown as string)).toBe(false);
    });
  });
});
