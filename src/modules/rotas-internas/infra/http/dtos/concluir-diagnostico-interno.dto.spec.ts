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

describe('ConcluirDiagnosticoInternoDto.itens', () => {
  const OUTRO_ITEM_ID = '8d0f7780-8536-41ef-955c-f18ed2a38bf8';

  const validarItens = async (itens: unknown[]) =>
    validate(
      plainToInstance(ConcluirDiagnosticoInternoDto, {
        rodada: 1,
        tarefaId: OS_ID,
        laudo: 'Laudo',
        itens,
      }),
    );

  it('aceita o mesmo itemId com tipos diferentes', async () => {
    const erros = await validarItens([
      { tipo: 'PECA', itemId: ITEM_ID, quantidade: 1 },
      { tipo: 'SERVICO', itemId: ITEM_ID, quantidade: 1 },
    ]);

    expect(erros).toHaveLength(0);
  });

  it('aceita itens distintos do mesmo tipo', async () => {
    const erros = await validarItens([
      { tipo: 'PECA', itemId: ITEM_ID, quantidade: 1 },
      { tipo: 'PECA', itemId: OUTRO_ITEM_ID, quantidade: 1 },
    ]);

    expect(erros).toHaveLength(0);
  });

  it.each([
    ['mesma quantidade', 1, 1],
    ['quantidades diferentes', 1, 3],
  ])(
    'recusa itemId e tipo repetidos com %s',
    async (_nome, primeira, segunda) => {
      const erros = await validarItens([
        { tipo: 'PECA', itemId: ITEM_ID, quantidade: primeira },
        { tipo: 'PECA', itemId: ITEM_ID, quantidade: segunda },
      ]);

      expect(erros.map((e) => e.property)).toEqual(['itens']);
      expect(erros[0].constraints).toHaveProperty('itensSemRepeticao');
    },
  );

  it('recusa itemId repetido que difere só na caixa do UUID', async () => {
    const erros = await validarItens([
      { tipo: 'SERVICO', itemId: ITEM_ID, quantidade: 1 },
      { tipo: 'SERVICO', itemId: ITEM_ID.toUpperCase(), quantidade: 1 },
    ]);

    expect(erros.map((e) => e.property)).toEqual(['itens']);
  });
});
