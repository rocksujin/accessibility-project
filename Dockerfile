# Backend (scan server) image.
# Playwright's base image ships Chromium + all required OS libraries, so the
# headless browser launches without "host is missing dependencies" errors.
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Source needed at runtime (tsx runs the TypeScript directly).
COPY tsconfig.json tsconfig.node.json ./
COPY server ./server

# Render injects $PORT; server/index.ts reads process.env.PORT (default 3001).
EXPOSE 3001
CMD ["npm", "start"]
