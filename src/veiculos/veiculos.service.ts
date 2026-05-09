import { Injectable } from '@nestjs/common';
import { CreateVeiculoDto } from './dto/create-veiculo.dto';
import { UpdateVeiculoDto } from './dto/update-veiculo.dto';

@Injectable()
export class VeiculosService {
  create(createVeiculoDto: CreateVeiculoDto) {
    return 'This action adds a new veiculo';
  }

  findAll() {
    return `This action returns all veiculos`;
  }

  findOne(id: number) {
    return `This action returns a #${id} veiculo`;
  }

  update(id: number, updateVeiculoDto: UpdateVeiculoDto) {
    return `This action updates a #${id} veiculo`;
  }

  remove(id: number) {
    return `This action removes a #${id} veiculo`;
  }
}
