FROM php:8.3-fpm
RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libpq-dev libzip-dev libicu-dev libpng-dev postgresql-client \
        chromium fonts-noto-core fonts-noto-ui-core nodejs npm \
    && docker-php-ext-install pdo_pgsql bcmath intl zip gd pcntl \
    && rm -rf /var/lib/apt/lists/*
# Headless Chromium for the Arabic PDF renderer (Task 8). Puppeteer is only the Node driver; it uses the system Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN npm install -g puppeteer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/backend
