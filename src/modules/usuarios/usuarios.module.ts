import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/database/prisma.module';
import { AdminSeedService } from './admin-seed.service';
import { SenhaHasher } from './application/ports/senha-hasher';
import { SENHA_HASHER, USUARIO_GATEWAY } from './application/ports/tokens';
import { UsuarioGateway } from './application/ports/usuario.gateway';
import { AtualizarUsuarioUseCase } from './application/use-cases/atualizar-usuario.use-case';
import { BuscarUsuarioUseCase } from './application/use-cases/buscar-usuario.use-case';
import { CriarUsuarioUseCase } from './application/use-cases/criar-usuario.use-case';
import { ListarUsuariosUseCase } from './application/use-cases/listar-usuarios.use-case';
import { RemoverUsuarioUseCase } from './application/use-cases/remover-usuario.use-case';
import { ValidarCredenciaisUseCase } from './application/use-cases/validar-credenciais.use-case';
import { BcryptSenhaHasher } from './infra/crypto/bcrypt-senha.hasher';
import { UsuariosController } from './infra/http/controllers/usuarios.controller';
import { PrismaUsuarioGateway } from './infra/persistence/prisma-usuario.gateway';

/**
 * Wiring do módulo: liga as portas da camada de aplicação aos adaptadores de
 * infraestrutura. Os casos de uso são classes puras, por isso são instanciados
 * por factory em vez de resolvidos por decorator.
 */
@Module({
  imports: [PrismaModule],
  controllers: [UsuariosController],
  providers: [
    PrismaUsuarioGateway,
    BcryptSenhaHasher,
    { provide: USUARIO_GATEWAY, useExisting: PrismaUsuarioGateway },
    { provide: SENHA_HASHER, useExisting: BcryptSenhaHasher },
    {
      provide: CriarUsuarioUseCase,
      useFactory: (gateway: UsuarioGateway, hasher: SenhaHasher) =>
        new CriarUsuarioUseCase(gateway, hasher),
      inject: [USUARIO_GATEWAY, SENHA_HASHER],
    },
    {
      provide: ListarUsuariosUseCase,
      useFactory: (gateway: UsuarioGateway) =>
        new ListarUsuariosUseCase(gateway),
      inject: [USUARIO_GATEWAY],
    },
    {
      provide: BuscarUsuarioUseCase,
      useFactory: (gateway: UsuarioGateway) =>
        new BuscarUsuarioUseCase(gateway),
      inject: [USUARIO_GATEWAY],
    },
    {
      provide: AtualizarUsuarioUseCase,
      useFactory: (gateway: UsuarioGateway, hasher: SenhaHasher) =>
        new AtualizarUsuarioUseCase(gateway, hasher),
      inject: [USUARIO_GATEWAY, SENHA_HASHER],
    },
    {
      provide: RemoverUsuarioUseCase,
      useFactory: (gateway: UsuarioGateway) =>
        new RemoverUsuarioUseCase(gateway),
      inject: [USUARIO_GATEWAY],
    },
    {
      provide: ValidarCredenciaisUseCase,
      useFactory: (gateway: UsuarioGateway, hasher: SenhaHasher) =>
        new ValidarCredenciaisUseCase(gateway, hasher),
      inject: [USUARIO_GATEWAY, SENHA_HASHER],
    },
    AdminSeedService,
  ],
  exports: [ValidarCredenciaisUseCase],
})
export class UsuariosModule {}
