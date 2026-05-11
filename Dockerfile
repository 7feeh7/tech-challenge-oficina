FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" yarn prisma generate
RUN yarn build

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json yarn.lock ./
EXPOSE 3000
CMD ["node", "dist/main.js"]