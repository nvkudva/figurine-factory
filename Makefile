.PHONY: install dev test lint fixtures clean

install:
	python -m pip install -e .

dev:
	python -m pip install -e ".[dev]"
	pre-commit install

test:
	pytest -q

lint:
	ruff check src tests scripts

fixtures:
	python tests/fixtures/make_fixtures.py

clean:
	rm -rf out/ .pytest_cache .ruff_cache
