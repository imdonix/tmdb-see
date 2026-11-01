BINARY := tmdb-see
IMAGE ?= imdonix/tmdb-see

.PHONY: all install build dev start test typecheck smoke docker helm helm-template clean

all: build

install:
	bun install

build: install
	bun run build

dev: install
	bun run dev

start:
	bun run start

test:
	bun test

smoke:
	bun run scripts/smoke.ts

typecheck:
	bun run typecheck

docker:
	docker build --build-arg APP_VERSION=$$(git describe --tags --always 2>/dev/null || echo 0.1.0) -t $(IMAGE):latest .

helm:
	helm lint k8s/tmdb-see

helm-template:
	helm template tmdb-see k8s/tmdb-see

clean:
	rm -rf apps/server/public/web apps/server/public/widget
