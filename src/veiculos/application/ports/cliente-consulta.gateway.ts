/**
 * Porta própria do módulo de veículos: tudo o que ele precisa saber sobre
 * clientes é se um id existe. Declarar a interface aqui (em vez de importar o
 * gateway do módulo de clientes) mantém os dois agregados desacoplados.
 */
export interface ClienteConsultaGateway {
  existe(clienteId: string): Promise<boolean>;
}
