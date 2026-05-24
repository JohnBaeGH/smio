FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG EXPO_PUBLIC_API_URL=/api
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
RUN npx expo export --platform web

FROM nginx:stable-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/og-image.png /usr/share/nginx/html/og-image.png
EXPOSE 3000
