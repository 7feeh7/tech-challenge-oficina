FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

FROM node:24-alpine

WORKDIR /app

# openssl é necessário para o schema engine do Prisma (migrate deploy)
RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist

COPY --from=builder /app/node_modules ./node_modules

# schema e migrations do Prisma são necessários para rodar "migrate deploy" no boot
COPY --from=builder /app/prisma ./prisma

COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY package.json yarn.lock ./

EXPOSE 3000

# Sobe apenas a API. As migrations NÃO rodam aqui: com o HPA, cada pod novo as
# executaria de novo durante o pico. Em produção elas rodam uma única vez, no Job
# k8s/migration-job.yaml, antes do rollout (a mesma imagem serve aos dois).
# No docker-compose local o comando é sobrescrito para migrar antes de subir.
CMD ["yarn", "start:prod"]