#!/bin/bash
clear
echo "################################################################################"
echo "#                     FLOWOPS AI EXTRACTION: DEEP-DIVE                         #"
echo "################################################################################"

echo -e "\n[01/02] OLLAMA VISION HANDSHAKE"
echo "--------------------------------------------------------------------------------"
# Check if the specific model is loaded
MODEL_CHECK=$(curl -s http://localhost:11434/api/tags | grep -i "llava")
if [ -z "$MODEL_CHECK" ]; then
    echo -e "  [✘] MODEL MISSING  : LLaVA (Vision) not found in Ollama."
    echo "      ACTION: Run 'ollama pull llava' or update your env to a model you have."
else
    echo -e "  [✔] MODEL READY    : LLaVA Vision is available."
fi

echo -e "\n[02/02] INBOX FAILURE LOGS"
echo "--------------------------------------------------------------------------------"
echo "Looking for Extraction or AI-Gate errors..."
grep -iE "extraction|vision|ollama|failed" /opt/Flowops/backend/backend.log | tail -n 10

echo -e "\n================================================================================"
echo "RESULT: If logs show 'Connection Refused', Ollama isn't accepting API calls."
echo "================================================================================"
