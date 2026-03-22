FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY index_builder.py correlator.py run.py ./
COPY scoring/ scoring/
COPY alerting/ alerting/
COPY scoring_config.yaml scoring_config_yardeni.yaml ./
COPY alert_config.yaml .

CMD ["python", "run.py"]
