#!/bin/bash

# FlowOps Automated Installer
# This script installs FlowOps dependencies and sets up the environment

echo "Starting FlowOps Installation..."

# Security Check: Only Ultimate Owner can run manual installation
if [ "$FLOWOPS_ROLE" != "ULTIMATE_OWNER" ]; then
    echo "ERROR: Unauthorized access. Only the Ultimate Owner can perform manual installations."
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing pnpm..."
    sudo npm install -g pnpm
fi

# Install Backend Dependencies
echo "Installing Backend dependencies..."
cd backend && pnpm install --legacy-peer-deps

# Generate Prisma Client
echo "Generating Prisma Client..."
npx prisma generate --schema=./prisma/schema.prisma

# Install Frontend Dependencies
echo "Installing Frontend dependencies..."
cd ../frontend && pnpm install

echo "Installation Complete! You can now start the services using 'pnpm start' in backend and 'pnpm dev' in frontend."
