# ═══════════════════════════════════════════════════════════════
# KAYS ADMIN PANEL — Multi-stage Dockerfile
#
# Sonuç imaj: ~150MB (Next.js standalone output sayesinde)
#
# BUILD:  docker build -t kays-admin .
# RUN:    docker run -d --name kays-admin -p 3000:3000 --env-file .env --restart unless-stopped kays-admin
# ═══════════════════════════════════════════════════════════════

# ── 1) Bağımlılıklar ──
FROM node:20-alpine AS deps
WORKDIR /app
# Alpine'da bazı native modüller için gerekli
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# package-lock.json varsa ci, yoksa install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ── 2) Derleme ──
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Derleme sırasında env'e ihtiyaç yok — tüm env değerleri RUNTIME'da okunuyor.
# Bu bilinçli: aynı imajı farklı ortamlarda (staging/prod) kullanabilirsin.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3) Çalıştırma ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ★ GÜVENLİK: root olarak çalıştırma
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone output: sadece gerçekten gereken dosyalar
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Container sağlık kontrolü — /api/health 200 dönmezse unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
