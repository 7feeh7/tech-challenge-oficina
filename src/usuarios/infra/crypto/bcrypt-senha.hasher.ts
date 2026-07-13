import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SenhaHasher } from '../../application/ports/senha-hasher';

@Injectable()
export class BcryptSenhaHasher implements SenhaHasher {
  private static readonly SALT_ROUNDS = 10;

  hash(senha: string): Promise<string> {
    return bcrypt.hash(senha, BcryptSenhaHasher.SALT_ROUNDS);
  }

  comparar(senha: string, senhaHash: string): Promise<boolean> {
    return bcrypt.compare(senha, senhaHash);
  }
}
