# 경제 캘린더 Cron 웹훅 — Node 20
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.mjs ./
EXPOSE 8787
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
