# Base Ubuntu + Node.js 20
FROM ubuntu:22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Jakarta

# Node.js 20.x
RUN apt-get update && apt-get install -y curl gnupg ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# OS deps yang dibutuhkan Chromium headless + fonts + Python + LibreOffice
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3 python3-pip libreoffice libreoffice-writer \
    # deps chromium headless:
    ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
    libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release wget xdg-utils \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Biarkan Puppeteer MENGUNDUH Chromium saat npm ci (JANGAN skip)
# (jangan set PUPPETEER_SKIP_DOWNLOAD=1)
# Kalau kamu pernah set sebelumnya, pastikan dihapus.

# Path Python & LibreOffice untuk route upload
ENV PYTHON_BIN=/usr/bin/python3
ENV SOFFICE_BIN=/usr/bin/soffice
ENV SOFFICE_DIR=/usr/bin

WORKDIR /app

# Install deps node (postinstall puppeteer akan download Chromium di sini)
COPY package*.json ./
RUN npm ci

# Install python deps untuk extractor
COPY requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy source dan build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start"]
