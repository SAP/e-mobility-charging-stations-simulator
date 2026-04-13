#!/usr/bin/env sh
# install.sh — build and install evse-cli to ~/.local/bin
set -eu

BINARY_NAME="evse-cli"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILT_FILE="$SCRIPT_DIR/dist/cli.js"
SKIP_BUILD=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    -b|--bin-dir)
      [ "$#" -ge 2 ] || { printf 'ERROR: --bin-dir requires a value\n' >&2; exit 1; }
      BIN_DIR="$2"; shift 2 ;;
    --no-build)    SKIP_BUILD=1; shift ;;
    -h|--help)
      printf 'Usage: %s [--bin-dir <dir>] [--no-build]\n' "$0"
      printf '  --bin-dir <dir>  Install directory (default: %s)\n' "$BIN_DIR"
      printf '  --no-build       Skip build step\n'
      exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
done

info()  { printf '\033[1;32m>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
error() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || error "node is not installed (required: >=22)"
NODE_MAJOR=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
[ "$NODE_MAJOR" -ge 22 ] || error "Node.js >=22 required, found $(node --version)"

if [ "$SKIP_BUILD" -eq 0 ]; then
  command -v pnpm >/dev/null 2>&1 || error "pnpm is not installed"
  info "Installing dependencies..."
  (cd "$SCRIPT_DIR" && pnpm install --frozen-lockfile)
  info "Building evse-cli..."
  (cd "$SCRIPT_DIR" && pnpm build)
fi

[ -f "$BUILT_FILE" ] || error "Built file not found: $BUILT_FILE"

mkdir -p "$BIN_DIR"
cp "$BUILT_FILE" "$BIN_DIR/$BINARY_NAME"
chmod +x "$BIN_DIR/$BINARY_NAME"
info "Installed $BINARY_NAME → $BIN_DIR/$BINARY_NAME"

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG_DIR="$XDG_CONFIG_HOME/evse-cli"
CONFIG_FILE="$CONFIG_DIR/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" << 'CONF'
{
  "uiServer": {
    "host": "localhost",
    "port": 8080,
    "protocol": "ui",
    "version": "0.0.1",
    "secure": false
  }
}
CONF
  info "Created default config → $CONFIG_FILE"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    warn "$BIN_DIR is not in your \$PATH"
    warn "Add to your shell profile (~/.bashrc, ~/.zshrc, ~/.profile):"
    printf '\n    export PATH="%s:$PATH"\n\n' "$BIN_DIR"
    ;;
esac

info "Done! Run: $BINARY_NAME --help"
