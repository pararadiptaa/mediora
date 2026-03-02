FROM node:20-alpine

WORKDIR /app

# Only install axios — no Playwright/Chromium overhead
COPY api-package.json package.json
RUN npm install --omit=dev

COPY api-bot.js .

CMD ["node", "api-bot.js"]
