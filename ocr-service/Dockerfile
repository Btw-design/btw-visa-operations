FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PADDLE_PDX_CACHE_HOME=/models/paddlex PADDLE_HOME=/models/paddle HF_HOME=/models/huggingface MODELSCOPE_CACHE=/models/modelscope XDG_CACHE_HOME=/models/cache
WORKDIR /service
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
COPY app.py ./app.py
RUN useradd --create-home --uid 10001 ocr && mkdir /models && chown -R ocr:ocr /models /service
USER ocr
EXPOSE 8000
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000","--workers","1","--no-access-log","--limit-concurrency","8"]
