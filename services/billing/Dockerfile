FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

EXPOSE ${PORT:-3002}

CMD ["gunicorn", "--preload", "--bind", "0.0.0.0:3002", "--workers", "2", "app:app"]
