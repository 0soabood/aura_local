# Dockerfile for AURA_LOCAL_SYNC - all deps and source inside
FROM node:22-alpine

WORKDIR /app/

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ py3-setuptools

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (skip postinstall to avoid electron-rebuild)
RUN npm install --ignore-scripts

# Rebuild better-sqlite3 for Linux
RUN npm rebuild better-sqlite3

# Copy all source files
COPY . .

# Set environment
ENV NODE_ENV=development
ENV AURA_DB_PATH=/app/data/aura.db
ENV RUNNING_IN_DOCKER=true
ENV VITE_HMR_HOST=0.0.0.0

# Create directories
RUN mkdir -p /app/data /app/.aura/

# Expose ports (3000 for app, 24678 for HMR)
EXPOSE 3000 24678

# Default command
CMD ["npm", "run", "start:docker"]
