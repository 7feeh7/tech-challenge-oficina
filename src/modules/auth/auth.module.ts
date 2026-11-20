import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OwnershipGuard } from './guards/ownership.guard';
import { UsuariosModule } from '@/modules/usuarios/usuarios.module';

@Module({
  imports: [
    UsuariosModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        privateKey: configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
        publicKey: configService.getOrThrow<string>('JWT_PUBLIC_KEY'),
        signOptions: {
          expiresIn: '8h',
          algorithm: 'RS256',
          issuer: configService.get<string>('JWT_ISSUER'),
          audience: configService.get<string>('JWT_AUDIENCE'),
        },
        verifyOptions: {
          algorithms: ['RS256'],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, OwnershipGuard],
  exports: [JwtAuthGuard, RolesGuard, OwnershipGuard, JwtModule],
})
export class AuthModule {}
