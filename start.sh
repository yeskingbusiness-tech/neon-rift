#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it free at https://nodejs.org then run this again."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --no-audit --no-fund
fi
echo
echo "Server starting — open http://localhost:8000 in your browser."
echo "Friends on your network join via http://YOUR-IP:8000 (find it with: ip a  or  ifconfig)"
echo
node server.js
