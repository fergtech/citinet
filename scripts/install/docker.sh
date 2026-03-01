#!/bin/bash
# Docker installation script for Linux/macOS

set -e

echo "🐳 Installing Docker..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected Linux"
    
    # Check for package manager
    if command -v apt-get &> /dev/null; then
        echo "Using apt package manager"
        sudo apt-get update
        sudo apt-get install -y docker.io docker-compose
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker $USER
        echo "✓ Docker installed. Log out and back in for group changes to take effect."
    elif command -v yum &> /dev/null; then
        echo "Using yum package manager"
        sudo yum install -y docker docker-compose
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker $USER
        echo "✓ Docker installed. Log out and back in for group changes to take effect."
    else
        echo "❌ Unsupported package manager"
        echo "Please install Docker manually: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
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
