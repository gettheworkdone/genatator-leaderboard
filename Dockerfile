FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json ./
# NOTE: keep npm install (not npm ci) because this flow is known to work on Space.
RUN npm install --no-audit --no-fund --progress=false

COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CONDA_DIR=/opt/conda \
    PATH=/opt/conda/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    bzip2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ./ ./
RUN mkdir -p /app/static
COPY --from=frontend-build /app/frontend/dist /app/static
RUN chmod +x /app/start.sh

EXPOSE 7860

CMD ["/app/start.sh"]
