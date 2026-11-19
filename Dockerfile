FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libgif7 libjpeg62-turbo libpango-1.0-0 libpangocairo-1.0-0 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ make pkg-config python3 libcairo2-dev libgif-dev libjpeg-dev libpango1.0-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm_config_nodedir=/usr/local npm ci --omit=dev

# Smaller dependency layers are easier to publish over slow connections.
RUN mkdir -p /dependency-layers/1 /dependency-layers/2 /dependency-layers/3 /dependency-layers/4 \
        /dependency-layers/sqlite /dependency-layers/canvas \
    && for module in node_modules/* node_modules/.[!.]* node_modules/..?*; do \
        if [ -e "$module" ] || [ -L "$module" ]; then \
            case "${module##*/}" in \
                better-sqlite3) layer=sqlite ;; \
                canvas) layer=canvas ;; \
                [a-g]*) layer=1 ;; \
                @*|[h-m]*) layer=2 ;; \
                [n-s]*) layer=3 ;; \
                *) layer=4 ;; \
            esac; \
            mv "$module" "/dependency-layers/$layer/"; \
        fi; \
    done

FROM base

COPY --from=dependencies /dependency-layers/1/ ./node_modules/
COPY --from=dependencies /dependency-layers/2/ ./node_modules/
COPY --from=dependencies /dependency-layers/3/ ./node_modules/
COPY --from=dependencies /dependency-layers/4/ ./node_modules/
COPY --from=dependencies /dependency-layers/sqlite/ ./node_modules/
COPY --from=dependencies /dependency-layers/canvas/ ./node_modules/
COPY . .

EXPOSE 3080

CMD ["node", "server.js"]
