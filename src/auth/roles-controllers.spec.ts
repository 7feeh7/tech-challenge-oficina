import { Reflector } from '@nestjs/core';
import { PerfilUsuario } from '@/generated/prisma/enums';
import { ROLES_KEY } from './decorators/roles.decorator';
import { ClientesController } from '@/clientes/infra/http/controllers/clientes.controller';
import { VeiculosController } from '@/veiculos/infra/http/controllers/veiculos.controller';
import { UsuariosController } from '@/usuarios/infra/http/controllers/usuarios.controller';
import { OrdensServicoController } from '@/ordens-servico/ordens-servico.controller';
import { OrcamentosController } from '@/orcamentos/orcamentos.controller';
import { MovimentacoesEstoqueController } from '@/movimentacoes-estoque/movimentacoes-estoque.controller';
import { ServicosController } from '@/servicos/infra/http/controllers/servicos.controller';
import { PecasController } from '@/pecas/pecas.controller';

describe('Controle de acesso por perfil (@Roles)', () => {
  const reflector = new Reflector();

  it('ClientesController deve exigir ADMINISTRADOR ou ATENDENTE', () => {
    const roles = reflector.get<PerfilUsuario[]>(ROLES_KEY, ClientesController);
    expect(roles).toEqual([
      PerfilUsuario.ADMINISTRADOR,
      PerfilUsuario.ATENDENTE,
    ]);
  });

  it('VeiculosController deve exigir ADMINISTRADOR ou ATENDENTE', () => {
    const roles = reflector.get<PerfilUsuario[]>(ROLES_KEY, VeiculosController);
    expect(roles).toEqual([
      PerfilUsuario.ADMINISTRADOR,
      PerfilUsuario.ATENDENTE,
    ]);
  });

  it('UsuariosController deve exigir ADMINISTRADOR', () => {
    const roles = reflector.get<PerfilUsuario[]>(ROLES_KEY, UsuariosController);
    expect(roles).toEqual([PerfilUsuario.ADMINISTRADOR]);
  });

  it('OrdensServicoController deve aceitar ADMIN, ATENDENTE e MECANICO', () => {
    const roles = reflector.get<PerfilUsuario[]>(
      ROLES_KEY,
      OrdensServicoController,
    );
    expect(roles).toEqual([
      PerfilUsuario.ADMINISTRADOR,
      PerfilUsuario.ATENDENTE,
      PerfilUsuario.MECANICO,
    ]);
  });

  it('OrcamentosController deve aceitar ADMIN e ATENDENTE', () => {
    const roles = reflector.get<PerfilUsuario[]>(
      ROLES_KEY,
      OrcamentosController,
    );
    expect(roles).toEqual([
      PerfilUsuario.ADMINISTRADOR,
      PerfilUsuario.ATENDENTE,
    ]);
  });

  it('MovimentacoesEstoqueController deve aceitar ADMIN e ALMOXARIFE', () => {
    const roles = reflector.get<PerfilUsuario[]>(
      ROLES_KEY,
      MovimentacoesEstoqueController,
    );
    expect(roles).toEqual([
      PerfilUsuario.ADMINISTRADOR,
      PerfilUsuario.ALMOXARIFE,
    ]);
  });

  it('ServicosController.create deve exigir ADMINISTRADOR', () => {
    const roles = reflector.get<PerfilUsuario[]>(
      ROLES_KEY,
      ServicosController.prototype.create,
    );
    expect(roles).toEqual([PerfilUsuario.ADMINISTRADOR]);
  });

  it('PecasController.create deve aceitar ADMIN e ALMOXARIFE', () => {
    const roles = reflector.get<PerfilUsuario[]>(
      ROLES_KEY,
      PecasController.prototype.create,
    );
    expect(roles).toEqual([
      PerfilUsuario.ADMINISTRADOR,
      PerfilUsuario.ALMOXARIFE,
    ]);
  });
});
