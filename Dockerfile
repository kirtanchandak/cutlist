FROM node:20-slim

# Install ffmpeg and yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 python3-pip python3-venv && \
    python3 -m venv /opt/yt-dlp-venv && \
    /opt/yt-dlp-venv/bin/pip install yt-dlp && \
    ln -s /opt/yt-dlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
