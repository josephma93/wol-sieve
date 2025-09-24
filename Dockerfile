# Stage 1: Install dependencies
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the build output
COPY ./dist ./dist

# Stage 2: Runtime image with matching Node toolchain
FROM node:22-alpine

WORKDIR /app

# Add init binary for proper signal handling
RUN apk add --no-cache dumb-init

# Copy dependencies and build artifacts from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Set environment variables with defaults
ENV NODE_ENV=production
ENV WS_PORT=3389
ENV WS_LOG_LEVEL=info

# Expose the application port
EXPOSE $WS_PORT

# Use the non-root node user provided by the base image
USER node

ENTRYPOINT ["dumb-init", "node", "dist/index.js"]
