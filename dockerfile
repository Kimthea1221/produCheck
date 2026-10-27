FROM python:3.12-slim-trixie

WORKDIR /everifymo

# Install libgomp1 required for faiss-cpu OpenMP support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir -r requirements.txt


COPY backend/main.py ./backend/main.py
COPY backend/nlp ./backend/nlp
COPY backend/app ./backend/app
COPY backend/alembic ./backend/alembic
COPY backend/alembic.ini ./backend/alembic.ini

COPY extension ./extension
COPY backend/scripts ./backend/scripts

ENV PYTHONPATH=/everifymo/backend:/everifymo

# Embed deployment build timestamp inside the image
RUN date +%s > /everifymo/.build_id


COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]