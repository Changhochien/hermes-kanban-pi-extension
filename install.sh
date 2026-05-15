#!/usr/bin/env bash
#
# hermes-kanban-pi-extension installer
# One-liner: curl -sL https://raw.githubusercontent.com/YOUR_USER/hermes-kanban-pi-extension/main/install.sh | bash
#

set -e

EXTENSION_DIR="${HOME}/.pi/agent/extensions/hermes-kanban"

echo "📋 Installing hermes-kanban-pi-extension..."

# Clone or update
if [ -d "$EXTENSION_DIR/.git" ]; then
    echo "↻ Updating existing installation..."
    cd "$EXTENSION_DIR"
    git pull
else
    echo "⬇️  Cloning extension to $EXTENSION_DIR..."
    rm -rf "$EXTENSION_DIR"
    git clone https://github.com/YOUR_USER/hermes-kanban-pi-extension.git "$EXTENSION_DIR"
    cd "$EXTENSION_DIR"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🔨 Building TypeScript..."
npm run build

echo "✅ hermes-kanban-pi-extension installed!"
echo ""
echo "Restart pi agent to load the extension."
