#!/bin/bash

# Script pour lancer Home Assistant en mode développement
# Utilise le répertoire courant comme base

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

docker run --network host --name ha-dev --rm \
  -v "$PROJECT_ROOT/tools/traces.txt:/config/traces.txt" \
  -v "$PROJECT_ROOT/custom_components/:/config/custom_components/" \
  -p 8123:8123 \
  homeassistant/home-assistant
