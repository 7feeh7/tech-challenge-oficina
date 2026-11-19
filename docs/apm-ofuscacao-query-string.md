# CPF fora do APM (Datadog)

`GET /internal/clientes?cpf=` (contrato `v1`) leva o CPF na query string. Logs e métricas já não o gravam (`normalizeRoute` descarta a query e `log-sanitizer` mascara `cpf`); o `dd-trace` gravaria a URL inteira em `http.url`, com ofuscação só de padrões de credencial.

## Configuração

- `src/tracer.ts` configura o plugin `http` do `dd-trace` com `queryStringObfuscation` (lado servidor), usando `REGEX_OFUSCACAO_QUERY_STRING_APM` de `src/shared/observability/ofuscacao-query-string-apm.ts`.
- A regex final é a regra padrão do `dd-trace` 6.25.0 (credenciais, `bearer`, JWT, chaves privadas), copiada literalmente de `DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP`, mais uma alternativa para `cpf` (e variações como `cpfCnpj`). Informar uma regex própria substitui a padrão, por isso ela é mantida inteira; o trecho casado vira `<redacted>`.
- A cópia precisa ser revista a cada atualização do `dd-trace`: o spec compara a constante com a regra do pacote instalado e falha se divergirem.
- `tracer.init` do `dd-trace` 6.x ignora `queryStringObfuscation`; por isso a opção vai em `tracer.use('http', { server })`. A alternativa sem código é a variável `DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP`, que não foi adotada para não haver duas fontes de configuração.

## Testes

- `src/shared/observability/ofuscacao-query-string-apm.spec.ts`: CPF, credenciais (`access_token`, `refresh_token`, `client_secret`, `new_password`, `consumer_key`, `bearer`, JWT solto), parâmetros inocentes preservados, igualdade da cópia com a regra do `dd-trace` instalado, equivalência com a regra padrão para as entradas de credencial e tempo de execução com entradas longas (ReDoS: entradas de 100 mil a 250 mil caracteres processadas em poucos milissegundos).
- `src/tracer.spec.ts`: sobe o `src/tracer.ts` real em processo próprio, atende uma requisição `GET /internal/clientes?cpf=...` e lê o `http.url` do span ativo, sem Datadog nem agente.

## Conferência no Datadog (E37, depois do deploy)

1. Chamar `GET /internal/clientes?cpf=<CPF de teste>` com o token da `auth-cpf` (por exemplo, pela autenticação por CPF).
2. No APM, abrir o trace do serviço `oficina-api` e o span `http.request`/`fastify.request` da rota.
3. Conferir que `http.url` está como `.../internal/clientes?<redacted>` e que o CPF de teste não aparece no span, nas tags nem no resource.
4. Se o CPF aparecer, a regra não está aplicada em produção: não liberar o tráfego da `auth-cpf`.
