# ---- Build stage ----
FROM node:20-slim AS build
# Using slim (Debian/glibc) instead of alpine (musl) on purpose:
# bcrypt (confirmed — not bcryptjs) ships prebuilt native binaries built
# against glibc, and so does @sentry/profiling-node. On alpine, bcrypt
# would need to compile from source (python3/make/g++ added to the
# image) and profiling-node may not have a musl build at all -> build
# failures or a silent runtime fallback. Since bcrypt is staying, don't
# switch this to alpine later without re-verifying both natives actually
# install cleanly there.

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# ---- Production stage ----
FROM node:20-slim AS production

ENV NODE_ENV=production

# t2/t3.micro = 1GB total RAM, shared with the OS and anything else on
# the box. Capping V8's heap keeps Node inside a predictable ceiling so
# it hits GC pressure instead of getting OOM-killed and hard-restarted.
# 512MB is a starting point — watch actual usage (`docker stats`) and
# adjust once you see real traffic.
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# node:20-slim ships a non-root 'node' user (uid 1000) already — use it
# instead of running the process as root inside the container.
RUN chown -R node:node /app
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node src ./src

# Must match PORT in your env vars (currently 5002). EXPOSE is
# documentation only — it doesn't publish the port by itself, that
# still happens via `-p` / your run config on the instance.
EXPOSE 5002

# Hits your existing GET /api/health route. This is Docker's own
# container-level restart trigger — separate from, and not a
# replacement for, health checks your Nginx LB instance should also run
# against each app instance's /api/health so it knows when to stop
# routing traffic to an unhealthy one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5002/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Calls src/server.js directly rather than `npm start` — one less
# process layer (npm spawns a child process for the script). Keep this
# in sync if you ever rename/move server.js.
CMD ["node", "src/server.js"]