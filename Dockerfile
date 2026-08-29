FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto-cjk \
    fonts-mplus \
    fonts-vlgothic \
    fonts-ipafont-gothic \
    fonts-ipafont-mincho \
    fonts-morisawa-bizud-gothic \
    fonts-morisawa-bizud-mincho \
    ca-certificates \
 && fc-cache -f -v >/dev/null 2>&1 || true \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/public/renders /tmp/m3-shorts

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
