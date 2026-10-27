# ---- Stage 1: build the frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
# `npm install`, not `npm ci` — see the root Dockerfile for why (lockfile
# generated on a different OS than this image resolves on).
RUN npm install
COPY frontend/ ./
# Frontend and backend share one origin in this deployment — leave this empty so
# API calls resolve as plain relative paths against whatever host serves the app.
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---- Stage 2: build the Spring Boot backend ----
FROM maven:3.9-eclipse-temurin-17 AS backend-build
WORKDIR /app
COPY backend-java/pom.xml ./
# Resolve dependencies in their own layer so a source-only change doesn't
# re-download the whole dependency tree on every build.
RUN mvn -B -q dependency:go-offline
COPY backend-java/src ./src
# The built frontend + the existing admin panel land in Spring Boot's static
# resources before packaging — same "one process serves everything" shape as the
# Node version's backend/public, just assembled at build time instead of via a
# COPY --from in the final stage (Maven needs them present for the jar to embed).
COPY --from=frontend-build /app/frontend/dist/. ./src/main/resources/static/
COPY backend/public/admin.html backend/public/admin.js ./src/main/resources/static/
RUN mvn -B -q -DskipTests package

# ---- Stage 3: the runtime image ----
FROM eclipse-temurin:17-jre-alpine AS app
WORKDIR /app
COPY --from=backend-build /app/target/ai-tutor-backend.jar ./app.jar

ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport"
EXPOSE 4000
CMD ["java", "-jar", "app.jar"]
