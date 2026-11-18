FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

# O client do Prisma (src/shared/generated/prisma) não é versionado, então precisa ser
# gerado dentro da imagem — senão o build compila contra tipos inexistentes.
# O generate não conecta no banco, mas o prisma.config.ts exige a variável; o
# valor real vem do Secret em runtime. Este ENV vive só no estágio de build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN yarn prisma generate

RUN yarn build

# Só dependências de produção: a imagem final não leva ferramentas de
# desenvolvimento (jest, ts-loader, @nestjs/cli) nem as vulnerabilidades delas.
# prisma e dotenv ficam em dependencies porque o job de migration roda
# "prisma migrate deploy" nesta mesma imagem (o prisma.config.ts importa o dotenv).
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --production

FROM node:24-alpine

WORKDIR /app

# openssl é necessário para o schema engine do Prisma (migrate deploy)
RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist

COPY --from=deps /app/node_modules ./node_modules

# schema e migrations do Prisma são necessários para rodar "migrate deploy" no boot
COPY --from=builder /app/prisma ./prisma

COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY package.json yarn.lock ./

# node:24-alpine ja inclui usuario node (uid 1000) — alinhado ao securityContext do K8s.
RUN chown -R node:node /app

USER node

EXPOSE 3000

# Sobe apenas a API. As migrations NÃO rodam aqui: com o HPA, cada pod novo as
# executaria de novo durante o pico. Em produção elas rodam uma única vez, no Job
# k8s/migration-job.yaml, antes do rollout (a mesma imagem serve aos dois).
# No docker-compose local o comando é sobrescrito para migrar antes de subir.
CMD ["yarn", "start:prod"]