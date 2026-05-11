#!/bin/sh
set -e

ollama serve &
SERVE_PID=$!

# Wait for the Ollama API to come up
until curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1; do
  sleep 1
done

MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
if ! ollama list | awk '{print $1}' | grep -q "^${MODEL}$"; then
  echo "Pulling model ${MODEL}..."
  ollama pull "${MODEL}"
fi

wait "${SERVE_PID}"
