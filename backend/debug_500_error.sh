#!/bin/bash
clear
echo "################################################################################"
echo "#                     FLOWOPS DEEP-SYSTEM INTEGRITY AUDIT                      #"
echo "#                          STATUS: 500 ERROR DETECTED                          #"
echo "################################################################################"

echo -e "\n[01/02] CONTEXT & IDENTITY CHECK"
echo "--------------------------------------------------------------------------------"
# Check if the 'Alpha' user actually has a company link
USER_CHECK=$(npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.user.findFirst({ 
    where: { email: 'admin@alpha.com' },
    include: { company: true } 
  });
  if (!user) console.log('MISSING_USER');
  else if (!user.companyId) console.log('MISSING_COMPANY_LINK');
  else console.log('USER_OK_COMPANY_' + user.companyId);
}
run();
" 2>/dev/null)

if [[ $USER_CHECK == *"USER_OK"* ]]; then
    echo -e "  [✔] TENANT DATA    : Valid (User linked to Company)"
else
    echo -e "  [✘] TENANT DATA    : Broken ($USER_CHECK)"
fi

echo -e "\n[02/02] LOGICAL GAPS (THE 500 CAUSE)"
echo "--------------------------------------------------------------------------------"
echo "1. OWNER VS TENANT | [CRITICAL] -> If logged as Owner, the Inbox logic"
echo "                   |               likely crashes looking for a company scope."
echo "2. OLLAMA LINK     | [CHECK]    -> Is the backend trying to call Ollama"
echo "                   |               on page load? (500 if Ollama is timed out)."
echo "3. OTEL OVERLOAD   | [WARN]     -> Trace spam (CORS Failed) is still hitting"
echo "                   |               port 4318. This may be blocking the main thread."

echo -e "\n================================================================================"
echo "ACTION: Run 'tail -f backend.log' and refresh the Inbox page in Firefox."
echo "================================================================================"
