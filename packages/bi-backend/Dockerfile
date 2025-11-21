# Use pre-built dist directory from host
FROM node:20-alpine

WORKDIR /app

# Copy package file and install production dependencies only
COPY packages/bi-backend/package*.json ./
RUN npm install --production --ignore-scripts

# Copy pre-built dist directory
COPY packages/bi-backend/dist ./dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/index.js"]
