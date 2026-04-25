#!/usr/bin/env bash
# Vibe Island - Development Environment Initialization
set -e

echo "=== Vibe Island - Environment Setup ==="

# Frontend dependencies
echo "[1/3] Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Rust backend check
echo "[2/3] Checking Rust toolchain..."
if ! command -v cargo &> /dev/null; then
    echo "ERROR: cargo not found. Install Rust from https://rustup.rs"
    exit 1
fi
cd src-tauri && cargo check 2>&1 | tail -1 && cd ..

# Verify frontend build
echo "[3/3] Verifying frontend build..."
cd frontend && npm run build && cd ..

echo ""
echo "=== Environment Ready ==="
echo "Start dev:  cd src-tauri && cargo tauri dev"
echo "Build prod: cd src-tauri && cargo tauri build"
echo ""
echo "Next task:  python scripts/select_next_task.py"
