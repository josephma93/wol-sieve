# Stage 1: Build the application
FROM node:21-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm ci --include=prod

# Copy the rest of the application code to the container
COPY ./dist ./dist

# Stage 2: Create a smaller production image
FROM alpine:3.18

# Install necessary packages
RUN apk add --no-cache libstdc++ dumb-init

# Copy the Node.js binary from the builder stage
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=builder /usr/local/include/node /usr/local/include/node
COPY --from=builder /app /app

# Create and set up a non-root user
RUN addgroup -S node && adduser -S -G node node

# Set the working directory inside the container
WORKDIR /app

# Set environment variables with defaults
ENV NODE_ENV=production
ENV WS_PORT=3389
ENV WS_LOG_LEVEL=info

# Expose the application port
EXPOSE $WS_PORT

# Run as non-root user for security
USER node

# Use dumb-init to handle kernel signals and start the application
ENTRYPOINT ["dumb-init", "node", "dist/index.js"]