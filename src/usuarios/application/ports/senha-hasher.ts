export interface SenhaHasher {
  hash(senha: string): Promise<string>;
  comparar(senha: string, senhaHash: string): Promise<boolean>;
}
