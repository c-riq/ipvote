.PHONY: build test deploy clean

build:
	./build.sh

test:
	python -m pytest tests/

deploy:
	./build.sh --deploy

clean:
	docker rmi triangulation-lambda:latest || true
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete
