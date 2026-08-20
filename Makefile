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
# vsce rewrites the readme's relative image links to raw URLs on this
# repository, which is the only form the extension pane will draw: it strips
# the src from any image that is not http or https, and its content policy
# then allows only https. So the screenshots have to be fetched from a public
# `main`, and pushing them there is part of releasing.
build: node_modules
	npm version patch --no-git-tag-version
	@touch node_modules
	npm run package
	npx @vscode/vsce package --no-dependencies --skip-license --out dist/authorship.vsix
