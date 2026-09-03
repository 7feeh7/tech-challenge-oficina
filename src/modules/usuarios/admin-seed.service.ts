import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/shared/database/prisma.service';
import { PerfilUsuario } from '@/shared/generated/prisma/enums';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminJaExiste = await this.prismaService.usuario.findFirst({
      where: { perfil: PerfilUsuario.ADMINISTRADOR },
    });

    if (adminJaExiste) {
      return;
    }

    const nome =
      this.configService.get<string>('ADMIN_NOME') ?? 'Administrador';
    const email =
      this.configService.get<string>('ADMIN_EMAIL') ?? 'admin@oficina.com';
    const senha = this.configService.get<string>('ADMIN_SENHA') ?? 'admin12345';

    const senhaHash = await bcrypt.hash(senha, 10);

    try {
      await this.prismaService.usuario.create({
        data: {
          nome,
          email,
          senhaHash,
          perfil: PerfilUsuario.ADMINISTRADOR,
        },
      });
    } catch (erro) {
      // Várias réplicas sobem juntas: todas podem passar pela verificação acima
      // antes que qualquer uma insira. Quem perder a corrida recebe violação da
      // constraint única de e-mail — o admin já existe, então não é erro. Sem
      // isto, o pod perdedor quebraria o bootstrap e entraria em CrashLoopBackOff.
      if (this.ehEmailDuplicado(erro)) {
        return;
      }

      throw erro;
    }

    this.logger.log(
      `Usuário administrador inicial criado com o e-mail "${email}". ` +
        'Altere a senha após o primeiro login.',
    );
  }

  private ehEmailDuplicado(erro: unknown): boolean {
    return (
      typeof erro === 'object' &&
      erro !== null &&
      'code' in erro &&
      erro.code === 'P2002'
    );
  }
}
