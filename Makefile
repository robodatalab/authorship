.PHONY: build

node_modules: package.json
	npm install
	@touch node_modules

build: node_modules
	node esbuild.js
	npx @vscode/vsce package --no-dependencies --skip-license --allow-missing-repository --out dist/
