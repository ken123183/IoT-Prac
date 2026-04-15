# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime (Nginx)
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# 需要注意 Nginx 預設是 80 端口
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
