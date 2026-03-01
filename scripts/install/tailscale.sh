#!/bin/bash
# Tailscale installation script for Linux/macOS

set -e

echo "🔗 Installing Tailscale..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected Linux"
    
    # Use official Tailscale install script
    curl -fsSL https://tailscale.com/install.sh | sh
    
    echo "✓ Tailscale installed"
    echo ""
    echo "Next steps:"
    echo "  1. Start Tailscale: sudo tailscale up"
    echo "  2. Authenticate in your browser"
    echo "  3. Enable Funnel: tailscale funnel 9090"
    
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected macOS"
    
    if command -v brew &> /dev/null; then
        echo "Using Homebrew"
        brew install tailscale
        echo "✓ Tailscale installed"
        echo ""
        echo "Next steps:"
        echo "  1. Start Tailscale from Applications or run: sudo tailscale up"
        echo "  2. Authenticate in your browser"
        echo "  3. Enable Funnel: tailscale funnel 9090"
    else
        echo "❌ Homebrew not found"
        echo "Install Tailscale manually: https://tailscale.com/download/macos"
        exit 1
    fi
    
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

echo "✓ Tailscale installation complete!"
