# ─── Build Stage ───
FROM node:20-slim AS builder

WORKDIR /app

# Install root dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install UI dependencies
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci

# Copy source
COPY . .

# Build UI (Vite production build)
# VITE_API_URL must be empty in production so the React app uses relative /api URLs
# (the ui/.env file has localhost:3001 for local dev, which .dockerignore blocks from here)
RUN cd ui && VITE_API_URL="" npm run build

# ─── Production Stage ───
FROM node:20-slim

WORKDIR /app

# Copy root package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server source (tsx runs TypeScript directly)
COPY server/ ./server/
COPY src/ ./src/
COPY tsconfig.json ./

# Copy built UI
COPY --from=builder /app/ui/dist ./ui/dist

# Install tsx for production TypeScript execution
RUN npm install tsx

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "--import", "tsx", "server/index.ts"]
