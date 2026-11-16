const mockActive = jest.fn();

jest.mock('@/tracer', () => ({
  __esModule: true,
  default: {
    scope: () => ({
      active: mockActive,
    }),
  },
}));

import { getActiveTraceIds } from './trace-context';

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
