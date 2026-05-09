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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VeiculosService } from './veiculos.service';
import { CreateVeiculoDto } from './dto/create-veiculo.dto';
import { UpdateVeiculoDto } from './dto/update-veiculo.dto';

@ApiTags('Veículos')
@Controller('veiculos')
export class VeiculosController {
  constructor(private readonly veiculosService: VeiculosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra um novo veículo' })
  @ApiResponse({ status: 201, description: 'Veículo cadastrado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @ApiResponse({ status: 409, description: 'Placa já cadastrada' })
  async create(@Body() createVeiculoDto: CreateVeiculoDto) {
    return await this.veiculosService.create(createVeiculoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista veículos cadastrados' })
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
    description: 'Filtro por placa, marca ou modelo',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de veículos retornada com sucesso',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return await this.veiculosService.findAll(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um veículo pelo ID' })
  @ApiParam({ name: 'id', description: 'UUID do veículo', type: String })
  @ApiResponse({ status: 200, description: 'Veículo encontrado' })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.veiculosService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza os dados de um veículo' })
  @ApiParam({ name: 'id', description: 'UUID do veículo', type: String })
  @ApiResponse({ status: 200, description: 'Veículo atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({
    status: 404,
    description: 'Veículo ou cliente não encontrado',
  })
  @ApiResponse({ status: 409, description: 'Placa já está em uso' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateVeiculoDto: UpdateVeiculoDto,
  ) {
    return await this.veiculosService.update(id, updateVeiculoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove um veículo' })
  @ApiParam({ name: 'id', description: 'UUID do veículo', type: String })
  @ApiResponse({ status: 200, description: 'Veículo removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Veículo não encontrado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.veiculosService.remove(id);
  }
}
