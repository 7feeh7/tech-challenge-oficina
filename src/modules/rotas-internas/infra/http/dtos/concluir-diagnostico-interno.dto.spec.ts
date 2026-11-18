import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConcluirDiagnosticoInternoDto } from './concluir-diagnostico-interno.dto';

const OS_ID = '3f2b8c1e-5a4d-4e6f-8a9b-1c2d3e4f5a6b';
const ITEM_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const validar = async (tarefaId: string) =>
  validate(
    plainToInstance(ConcluirDiagnosticoInternoDto, {
      rodada: 1,
      tarefaId,
      laudo: 'Laudo',
      itens: [{ tipo: 'SERVICO', itemId: ITEM_ID, quantidade: 1 }],
    }),
  );

describe('ConcluirDiagnosticoInternoDto.tarefaId', () => {
  it.each([
    ['identificador do Execution', `${OS_ID}#1#DIAGNOSTICO`],
    ['rodada com mais de um dígito', `${OS_ID}#12#DIAGNOSTICO`],
    ['UUID puro (formato anterior)', OS_ID],
  ])('aceita %s', async (_nome, tarefaId) => {
    expect(await validar(tarefaId)).toHaveLength(0);
  });

  it.each([
    ['texto livre', 'qualquer-coisa'],
    ['tipo de tarefa de reparo', `${OS_ID}#1#REPARO`],
    ['rodada zero', `${OS_ID}#0#DIAGNOSTICO`],
    ['rodada com zero à esquerda', `${OS_ID}#01#DIAGNOSTICO`],
    ['rodada não numérica', `${OS_ID}#x#DIAGNOSTICO`],
    ['osId que não é UUID', '123#1#DIAGNOSTICO'],
    ['sufixo extra', `${OS_ID}#1#DIAGNOSTICO#extra`],
    ['prefixo extra', `x${OS_ID}#1#DIAGNOSTICO`],
    ['vazio', ''],
  ])('recusa %s', async (_nome, tarefaId) => {
    const erros = await validar(tarefaId);
    expect(erros.map((e) => e.property)).toEqual(['tarefaId']);
  });
});
