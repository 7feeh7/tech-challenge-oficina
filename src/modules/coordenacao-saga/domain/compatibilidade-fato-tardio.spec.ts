import { avaliarCompatibilidadeFatoTardio } from './compatibilidade-fato-tardio';

const PECA = '11111111-1111-4111-8111-111111111111';
const PECA_B = '22222222-2222-4222-8222-222222222222';

describe('compatibilidade fato tardio', () => {
  const catalogo = (id: string) =>
    id === PECA || id === PECA_B || id.startsWith('1111');

  it('compatível quando consumo bate resolução e reserva', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 4 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 2 }],
      pecasUtilizadasFato: [{ itemId: PECA, quantidade: 2 }],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(true);
  });

  it('compatível com consumo zero omitido no fato', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 2 }],
      itensConsumidosResolucao: [],
      pecasUtilizadasFato: [],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(true);
  });

  it('consolida itens repetidos', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 4 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 3 }],
      pecasUtilizadasFato: [
        { itemId: PECA, quantidade: 1 },
        { itemId: PECA, quantidade: 2 },
      ],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(true);
  });

  it('incompatível quando consumo acima da reserva', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 1 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 1 }],
      pecasUtilizadasFato: [{ itemId: PECA, quantidade: 2 }],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(false);
    expect(out.motivo).toBe('CONSUMO_ACIMA_RESERVA');
  });

  it('incompatível com peça fora da reserva', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 2 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 2 }],
      pecasUtilizadasFato: [{ itemId: PECA_B, quantidade: 1 }],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(false);
    expect(out.motivo).toBe('PECA_FORA_DA_RESERVA');
  });

  it('incompatível com peça desconhecida', () => {
    const desconhecida = '33333333-3333-4333-8333-333333333333';
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 2 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 1 }],
      pecasUtilizadasFato: [{ itemId: desconhecida, quantidade: 1 }],
      pecasCatalogoValidas: () => false,
    });
    expect(out.compativel).toBe(false);
    expect(out.motivo).toBe('PECA_DESCONHECIDA');
  });

  it('incompatível com identificador inválido', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 2 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 1 }],
      pecasUtilizadasFato: [{ itemId: 'nao-uuid', quantidade: 1 }],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(false);
    expect(out.motivo).toBe('IDENTIFICADOR_INVALIDO');
  });

  it('incompatível quando difere da resolução manual', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [{ pecaId: PECA, quantidade: 4 }],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 1 }],
      pecasUtilizadasFato: [{ itemId: PECA, quantidade: 2 }],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(false);
    expect(out.motivo).toBe('DIVERGENCIA_RESOLUCAO');
  });

  it('sem reserva original não presume compatibilidade', () => {
    const out = avaliarCompatibilidadeFatoTardio({
      reservasOriginais: [],
      itensConsumidosResolucao: [{ itemId: PECA, quantidade: 1 }],
      pecasUtilizadasFato: [{ itemId: PECA, quantidade: 1 }],
      pecasCatalogoValidas: catalogo,
    });
    expect(out.compativel).toBe(false);
    expect(out.motivo).toBe('SEM_RESERVA_ORIGINAL');
  });
});
