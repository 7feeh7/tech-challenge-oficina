// Executado em processo próprio (src/tracer.spec.ts): o dd-trace só instrumenta
// o `http` se for carregado antes dele, o que o ambiente de módulos do Jest impede.
import tracer from '../../src/tracer';
import { createServer, get } from 'node:http';

const CPF = '12345678901';

const servidor = createServer((_requisicao, resposta) => {
  const span = tracer.scope().active();
  resposta.end(String(span?.context()['_tags']['http.url']));
});

servidor.listen(0, () => {
  const { port } = servidor.address() as { port: number };
  get(
    `http://localhost:${port}/internal/clientes?cpf=${CPF}&outro=1`,
    (res) => {
      let corpo = '';
      res.on('data', (parte: Buffer) => (corpo += parte.toString()));
      res.on('end', () => {
        process.stdout.write(`URL_REGISTRADA=${corpo}\n`);
        process.exit(0);
      });
    },
  );
});
