const mockActive = jest.fn();

jest.mock('@/tracer', () => ({
  __esModule: true,
  default: {
    scope: () => ({
      active: mockActive,
    }),
  },
}));

import {
  getActiveTraceIds,
  tagActiveSpanWithCorrelation,
} from './trace-context';

describe('getActiveTraceIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna vazio quando não há span ativo', () => {
    mockActive.mockReturnValue(undefined);

    expect(getActiveTraceIds()).toEqual({});
  });

  it('expõe traceId e spanId do span ativo', () => {
    mockActive.mockReturnValue({
      context: () => ({
        toTraceId: () => 'trace-1',
        toSpanId: () => 'span-1',
      }),
    });

    expect(getActiveTraceIds()).toEqual({
      traceId: 'trace-1',
      spanId: 'span-1',
    });
  });
});

describe('tagActiveSpanWithCorrelation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignora tag quando correlation id está ausente', () => {
    tagActiveSpanWithCorrelation(undefined);
    expect(mockActive).not.toHaveBeenCalled();
  });

  it('marca span ativo com correlation_id', () => {
    const setTag = jest.fn();
    mockActive.mockReturnValue({ setTag });

    tagActiveSpanWithCorrelation('550e8400-e29b-41d4-a716-446655440000');

    expect(setTag).toHaveBeenCalledWith(
      'correlation_id',
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });
});
