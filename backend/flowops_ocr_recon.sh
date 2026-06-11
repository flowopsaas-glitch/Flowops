#!/bin/bash
echo "🔄 REVERTING THE MODULE DAMAGE..."
# If you use git, this safely restores the original OCR module
git restore src/ocr/ocr.module.ts src/ocr/waybill.entity.ts 2>/dev/null

echo ""
echo "📁 CONTENTS OF THE OCR FOLDER:"
ls -1 src/ocr

echo ""
echo "🧠 IDENTIFYING THE REAL ENGINE:"
# This looks for the actual classes inside those files
grep -Hn "export class" src/ocr/*.ts | grep -v "module.ts\|entity.ts"
