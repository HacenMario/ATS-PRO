# Advanced Tasks Supervisor — API (Railway)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Install from the monorepo root lockfile is done at build time on Railway
# (rootDirectory). This Dockerfile assumes it is built from the REPO ROOT:
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install --no-audit --no-fund --workspace @ats/shared --workspace @ats/i18n --workspace @ats/api --include-workspace-root=false \
 && npm run build --workspace @ats/shared --workspace @ats/i18n --workspace @ats/api

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
EXPOSE 3000
WORKDIR /repo/apps/api
# Railway injects PORT; the API reads process.env.PORT
CMD ["node", "dist/server.js"]
