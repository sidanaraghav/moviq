# ==========================================
# Stage 1: Build React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Spring Boot Backend
# ==========================================
FROM maven:3.9.9-eclipse-temurin-21 AS backend-builder
WORKDIR /app

COPY backend/pom.xml ./backend/
# Cache maven dependencies
RUN mvn -f backend/pom.xml dependency:go-offline -B || true

COPY backend/src ./backend/src
# Embed static frontend build directly into Spring Boot classpath
COPY --from=frontend-builder /app/frontend/dist ./backend/src/main/resources/static

RUN mvn -f backend/pom.xml clean package -DskipTests

# ==========================================
# Stage 3: Minimal Production Runtime
# ==========================================
FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app

# Install system dependencies (FFmpeg, yt-dlp, Node.js, Python3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        nodejs \
        curl \
        python3 \
        ca-certificates && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# Point to container system binaries
ENV COZICUT_FFMPEG_EXECUTABLE=/usr/bin/ffmpeg
ENV COZICUT_FFPROBE_EXECUTABLE=/usr/bin/ffprobe
ENV COZICUT_YTDLP_EXECUTABLE=/usr/local/bin/yt-dlp
ENV COZICUT_NODE_EXECUTABLE=/usr/bin/node
ENV SERVER_PORT=8080

EXPOSE 8080

COPY --from=backend-builder /app/backend/target/*.jar /app/app.jar

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
