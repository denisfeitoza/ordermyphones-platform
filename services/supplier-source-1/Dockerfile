# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

# System deps for Scrapling stealth fetchers (camoufox / playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libnss3 libfontconfig1 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --upgrade pip && pip install -e ".[fetchers]"
# Pre-download the stealth browser bundle so the runtime image is ready.
RUN scrapling install || true

FROM python:3.12-slim AS prod
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN addgroup --system app && adduser --system --ingroup app app
WORKDIR /app
COPY --from=build /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /app /app
COPY --from=build /root/.scrapling /home/app/.scrapling
RUN chown -R app:app /home/app
USER app
ENV SCRAPLING_DATA_DIR=/home/app/.scrapling
ENTRYPOINT ["python", "-m", "supplier_source_1"]
CMD ["sync", "--loop"]
