# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix client ci
COPY . .
RUN npm --prefix client run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js db.js ws.js ./
COPY lib ./lib
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
