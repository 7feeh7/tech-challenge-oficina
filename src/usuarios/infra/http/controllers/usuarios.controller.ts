import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { CreateUsuarioDto } from '@/usuarios/dto/create-usuario.dto';
import { UpdateUsuarioDto } from '@/usuarios/dto/update-usuario.dto';
import { PerfilUsuario } from '@/usuarios/domain/perfil-usuario';
import { AtualizarUsuarioUseCase } from '@/usuarios/application/use-cases/atualizar-usuario.use-case';
import { BuscarUsuarioUseCase } from '@/usuarios/application/use-cases/buscar-usuario.use-case';
import { CriarUsuarioUseCase } from '@/usuarios/application/use-cases/criar-usuario.use-case';
import { ListarUsuariosUseCase } from '@/usuarios/application/use-cases/listar-usuarios.use-case';
import { RemoverUsuarioUseCase } from '@/usuarios/application/use-cases/remover-usuario.use-case';

@ApiTags('Usuários')
@ApiBearerAuth()
@Roles(PerfilUsuario.ADMINISTRADOR)
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly criarUsuario: CriarUsuarioUseCase,
    private readonly listarUsuarios: ListarUsuariosUseCase,
    private readonly buscarUsuario: BuscarUsuarioUseCase,
    private readonly atualizarUsuario: AtualizarUsuarioUseCase,
    private readonly removerUsuario: RemoverUsuarioUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra um novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário cadastrado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado' })
  async create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return await this.criarUsuario.execute(createUsuarioDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista usuários cadastrados' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Número da página',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Itens por página',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Filtro por nome do usuário',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários retornada com sucesso',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return await this.listarUsuarios.execute(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um usuário pelo ID' })
  @ApiParam({ name: 'id', description: 'UUID do usuário', type: String })
  @ApiResponse({ status: 200, description: 'Usuário encontrado' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarUsuario.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza os dados de um usuário' })
  @ApiParam({ name: 'id', description: 'UUID do usuário', type: String })
  @ApiResponse({ status: 200, description: 'Usuário atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  @ApiResponse({ status: 409, description: 'E-mail já está em uso' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
  ) {
    return await this.atualizarUsuario.execute(id, updateUsuarioDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove um usuário' })
  @ApiParam({ name: 'id', description: 'UUID do usuário', type: String })
  @ApiResponse({ status: 200, description: 'Usuário removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.removerUsuario.execute(id);
  }
}
