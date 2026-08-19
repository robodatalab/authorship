.PHONY: build

# One VSIX for every platform. Nothing in it is machine-specific: the extension
# is JavaScript, the server is Python, and uv — the one native thing involved —
# is fetched for whatever machine the extension finds itself on, at the same
# moment it fetches the interpreter and the wheels.

node_modules: package.json
	npm install
	@touch node_modules

build: node_modules
	npm run package
	npx @vscode/vsce package --no-dependencies --skip-license --out dist/authorship.vsix
