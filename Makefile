.PHONY: dev test lint typecheck build install

install:
	python -m venv .venv
	. .venv/bin/activate && pip install -r backend/requirements.txt
	cd frontend && npm ci

dev:
	@echo "Start backend:  cd backend && ../.venv/bin/gunicorn config.wsgi:application -c gunicorn.conf.py --reload"
	@echo "Start frontend: cd frontend && npm run dev"

test:
	cd backend && DJANGO_TESTING=1 MAPBOX_TOKEN=test-mapbox-token pytest
	cd frontend && npm run test

lint:
	cd backend && ruff check .
	cd frontend && npm run lint

typecheck:
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build
