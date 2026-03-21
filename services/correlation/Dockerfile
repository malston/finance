FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY index_builder.py run.py scoring_config.yaml ./
COPY scoring/ ./scoring/

CMD ["python", "run.py"]
