# Multi-stage: build the static bundle with Node, serve it with nginx.
# VITE_API_URL is inlined into the JS bundle at BUILD time (Vite env vars
# aren't readable at container runtime), so it must be passed as a build arg,
# not a normal `environment:` var - see docker-compose.yml.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
