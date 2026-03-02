FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (use npm install since no lockfile is present)
RUN npm install --only=production

# Copy application
COPY server.js .

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (r) => {if (r.statusCode !== 200) throw new Error('Health check failed')})"

# Run the application
CMD ["npm", "start"]
