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
# The readme is packaged from a generated copy carrying its screenshots as
# `data:` URIs, because the extension pane will read an image from nowhere
# else — see bin/readme_for_vsix.py. `--no-rewrite-relative-links` is what
# keeps vsce's hands off those URIs: it reads anything without a `://` as a
# relative link and would prefix every one of them with a repository URL.
build: node_modules
	npm version patch --no-git-tag-version
	@touch node_modules
	npm run package
	python3 bin/readme_for_vsix.py README.md dist/readme.md
	npx @vscode/vsce package --no-dependencies --skip-license --no-rewrite-relative-links \
		--readme-path dist/readme.md --out dist/authorship.vsix
