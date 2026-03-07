#!/bin/bash
# Docker installation script for Linux/macOS

set -e

echo "🐳 Installing Docker..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
    echo "Detected Linux"
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    sudo systemctl enable --now docker
    echo "✓ Docker installed. Log out and back in for group changes to take effect."
    
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected macOS"
    
    if command -v brew &> /dev/null; then
        echo "Using Homebrew"
        brew install --cask docker
        echo "✓ Docker Desktop installed. Please start Docker Desktop from Applications."
    else
        echo "❌ Homebrew not found"
        echo "Install Docker Desktop manually: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

echo "✓ Docker installation complete!"
