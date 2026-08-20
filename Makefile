.PHONY: build

# One VSIX for every platform. Nothing in it is machine-specific: the extension
# is JavaScript, the server is Python, and uv — the one native thing involved —
# is fetched for whatever machine the extension finds itself on, at the same
# moment it fetches the interpreter and the wheels.

node_modules: package.json
	npm install
	@touch node_modules

# The bump rewrites package.json and the lock file, which would otherwise look
# like a dependency change and force a reinstall on the next build.
#
# `--no-rewrite-relative-links` leaves the readme pointing at the screenshots
# packaged beside it. Left to itself vsce rewrites every relative link to a raw
# URL on the repository, which needs that repository to be public to render at
# all — and it rewrites the examples inside code fences on the way past.
build: node_modules
	npm version patch --no-git-tag-version
	@touch node_modules
	npm run package
	npx @vscode/vsce package --no-dependencies --skip-license --no-rewrite-relative-links --out dist/authorship.vsix
