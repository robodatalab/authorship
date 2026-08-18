.PHONY: build uv

# The VS Code platform this VSIX is for. One VSIX per platform, because the uv
# binary that installs the Python side is a native executable and cannot be one
# file for all of them.
TARGET ?= darwin-arm64

# uv publishes an archive per Rust target triple; these are the five that map
# onto the VS Code platforms worth publishing.
TRIPLE_darwin-arm64 = aarch64-apple-darwin
TRIPLE_darwin-x64 = x86_64-apple-darwin
TRIPLE_linux-x64 = x86_64-unknown-linux-gnu
TRIPLE_linux-arm64 = aarch64-unknown-linux-gnu
TRIPLE_win32-x64 = x86_64-pc-windows-msvc
TRIPLE = $(TRIPLE_$(TARGET))

# Pin a release the way the lockfile pins everything else, so that what installs
# the model is as fixed as what it installs:
#	make build UV_RELEASE=download/0.9.29
UV_RELEASE ?= latest/download

node_modules: package.json
	npm install
	@touch node_modules

# Fetched at package time rather than committed: it is a 35 MB executable that
# differs per platform, and nothing in the repository runs it.
uv:
	@test -n "$(TRIPLE)" || { echo "unknown TARGET '$(TARGET)'"; exit 1; }
	rm -rf bin
	mkdir -p bin
ifeq ($(TARGET),win32-x64)
	curl -fsSL -o bin/uv.zip https://github.com/astral-sh/uv/releases/$(UV_RELEASE)/uv-$(TRIPLE).zip
	cd bin && unzip -j -o uv.zip '*uv.exe' && rm uv.zip
else
	curl -fsSL https://github.com/astral-sh/uv/releases/$(UV_RELEASE)/uv-$(TRIPLE).tar.gz \
		| tar -xz -C bin --strip-components=1 uv-$(TRIPLE)/uv
endif

build: node_modules uv
	npm run package
	npx @vscode/vsce package --target $(TARGET) --no-dependencies --skip-license \
		--out dist/authorship-$(TARGET).vsix
