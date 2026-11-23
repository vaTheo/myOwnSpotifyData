# The worker built from the Python source (spec 035): docker build worker/
FROM python:3.13-slim-bookworm AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY README.md ./
COPY mix_worker/ mix_worker/
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim-bookworm
LABEL org.opencontainers.image.source="https://github.com/vaTheo/myOwnSpotifyData" \
      org.opencontainers.image.description="mix-worker: identifies the tracks of a mix for myOwnSpotifyData" \
      org.opencontainers.image.licenses="MIT"
RUN groupadd --system --gid 10001 mix-worker \
 && useradd --system --uid 10001 --gid 10001 --create-home mix-worker \
 && install -d -o 10001 -g 10001 /data
COPY --from=build /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    WORKER_SESSION_FILE=/data/session.json \
    WORKER_WORK_DIR=/data/work \
    WORKER_JSON_DIR=/data/results
VOLUME /data
USER mix-worker
WORKDIR /data
STOPSIGNAL SIGINT
ENTRYPOINT ["mix-worker", "--config", "/data/mix-worker.env"]
CMD ["run", "--watch"]
