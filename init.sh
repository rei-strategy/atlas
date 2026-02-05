#!/bin/bash
#
# Atlas - Travel Agency Management Platform
# Development Environment Setup & Startup Script
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
CLIENT_DIR="$PROJECT_ROOT/client"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Atlas - Travel Agency Platform Setup  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js v18+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js v18+ required. Current version: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} npm $(npm -v)"

echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"

# Install server dependencies
echo -e "${BLUE}[1/2]${NC} Installing server dependencies..."
cd "$SERVER_DIR"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  Server dependencies already installed. Run 'npm install' to update."
fi

# Install client dependencies
echo -e "${BLUE}[2/2]${NC} Installing client dependencies..."
cd "$CLIENT_DIR"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  Client dependencies already installed. Run 'npm install' to update."
fi

cd "$PROJECT_ROOT"

echo ""
echo -e "${YELLOW}Setting up database...${NC}"

# Initialize database if it doesn't exist
if [ ! -f "$SERVER_DIR/atlas.db" ]; then
    echo "  Creating SQLite database and applying schema..."
    cd "$SERVER_DIR"
    node src/config/initDb.js
    echo -e "${GREEN}[OK]${NC} Database initialized"
else
    echo -e "${GREEN}[OK]${NC} Database already exists"
fi

cd "$PROJECT_ROOT"

echo ""
echo -e "${YELLOW}Starting services...${NC}"

# Kill any existing processes on our ports
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Start backend server
echo -e "${BLUE}[1/2]${NC} Starting backend server on port 3001..."
cd "$SERVER_DIR"
node src/index.js &
SERVER_PID=$!

# Wait for server to be ready
sleep 3

# Check if server started
if kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Backend server running (PID: $SERVER_PID)"
else
    echo -e "${RED}Error: Backend server failed to start${NC}"
    exit 1
fi

# Start frontend dev server
echo -e "${BLUE}[2/2]${NC} Starting frontend dev server on port 3000..."
cd "$CLIENT_DIR"
npm start &
CLIENT_PID=$!

cd "$PROJECT_ROOT"

sleep 3

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Atlas is running!                     ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Frontend: ${BLUE}http://localhost:3000${NC}"
echo -e "  Backend:  ${BLUE}http://localhost:3001${NC}"
echo -e "  Health:   ${BLUE}http://localhost:3001/api/health${NC}"
echo ""
echo -e "  Server PID: $SERVER_PID"
echo -e "  Client PID: $CLIENT_PID"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop both services"
echo ""

# Wait for both processes
wait
