FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 AUTH_DB_PATH=/data/auth.sqlite
WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node dist ./dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server/server.mjs"]
