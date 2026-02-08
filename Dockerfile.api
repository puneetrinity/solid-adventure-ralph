# API Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/

# Copy prisma schema
COPY prisma ./prisma

# Install dependencies
RUN npm ci

# Copy source
COPY packages ./packages
COPY apps/api ./apps/api

# Build
RUN npm run build -w packages/db -w packages/core -w apps/api

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:api"]
