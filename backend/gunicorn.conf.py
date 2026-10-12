"""Gunicorn configuration for StormRoute (D19: 1 gthread worker, 8 threads)."""

bind = "0.0.0.0:8000"
worker_class = "gthread"
workers = 1
threads = 8
timeout = 120
accesslog = "-"
errorlog = "-"
