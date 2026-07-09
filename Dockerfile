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

# Aplica as migrations pendentes e sobe a API.
# O seed do admin roda automaticamente na inicialização da aplicação.
CMD ["sh", "-c", "yarn prisma migrate deploy && yarn start:prod"]