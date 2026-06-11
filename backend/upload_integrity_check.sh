#!/bin/bash
clear
echo "################################################################################"
echo "#                     FLOWOPS UPLOAD PIPELINE INTEGRITY                        #"
echo "#                          DATE: 2026-04-21 | RANDBURG                         #"
echo "################################################################################"

echo -e "\n[01/02] PERMISSIONS & DIRECTORY CHECK"
echo "--------------------------------------------------------------------------------"
UPLOAD_DIR="/opt/Flowops/backend/uploads"
if [ -d "$UPLOAD_DIR" ]; then
    echo -e "  [✔] UPLOAD CACHE   : Directory exists."
    touch "$UPLOAD_DIR/test_write.tmp" && echo "  [✔] WRITE PERM     : Writable" || echo "  [✘] WRITE PERM     : DENIED (Check permissions)"
    rm -f "$UPLOAD_DIR/test_write.tmp"
else
    echo -e "  [✘] UPLOAD CACHE   : MISSING (Run: mkdir -p $UPLOAD_DIR)"
fi

echo -e "\n[02/02] LOG HUNTER (CATCHING THE CRASH)"
echo "--------------------------------------------------------------------------------"
echo "Checking for recent 'Multer' or 'DiskStorage' errors..."
grep -iE "multer|upload|filename|directory" /opt/Flowops/backend/backend.log | tail -n 5

echo -e "\n================================================================================"
echo "ACTION: Run 'tail -f backend.log' and try the upload again in Firefox."
echo "================================================================================"
