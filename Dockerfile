FROM node:20-bookworm-slim

# ffmpeg (render/transcodificação), python3+pip (yt-dlp), fonts-dejavu-core
# (fonte usada pelo drawtext do FFmpeg em src/lib/ffmpeg.ts — sem ela, o
# editor renderiza sem legendas/overlays queimados).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      fonts-dejavu-core \
      ca-certificates \
      bash \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# DATABASE_URL não precisa ser real durante o build — prisma generate só lê
# o schema, não conecta no banco.
RUN npx prisma generate
RUN npm run build
RUN chmod +x scripts/start.sh

ENV NODE_ENV=production
EXPOSE 3000

# Sobe o painel Next.js e o worker do BullMQ juntos, no mesmo container —
# assim os dois enxergam o mesmo disco (uploads/clips) sem depender de um
# Volume compartilhado entre serviços separados do Railway.
CMD ["bash", "scripts/start.sh"]
