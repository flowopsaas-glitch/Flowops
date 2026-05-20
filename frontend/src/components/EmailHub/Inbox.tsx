import React from 'react';
import { Mail, Search, CheckCircle2 } from 'lucide-react';

const EmailHubInbox = () => {
  const emails = [
    { 
      id: 1, 
      sender: 'Dispatch Desk',
      subject: 'Collection request for...',
      summary: 'Collection request with...',
      status: 'Collection Intake',
      confidence: 0.92
    },
    { 
      id: 2, 
      sender: 'Logistics Partner',
      subject: 'New Pickup Request', 
      summary: 'Please arrange a pick...',
      status: 'Pending AI', 
      confidence: null 
    },
  ];

  return (
    <div className="flex h-screen bg-[#050505] text-slate-200 font-sans">
      <main className="flex-1 flex flex-col bg-[#070707]">
        <header className="h-16 border-b border-zinc-800 flex items-center px-6 justify-between bg-[#0a0a0a]">
          <div className="relative w-1/2">
            <Search className="absolute left-3 top-2.5 text-zinc-500" size={18} />
            <input className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm" placeholder="Search..." />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {emails.map((email) => (
            <div key={email.id} className="group border-b border-zinc-800/40 px-6 py-4 flex items-center gap-6 hover:bg-zinc-900/40 cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                   <span className="text-slate-100 font-medium truncate">{email.subject}</span>
                   {email.confidence && email.confidence > 0.9 && (
                     /* Native HTML title on span wrapper */
                     <span title="High AI Confidence">
                       <CheckCircle2 size={14} className="text-emerald-500" />
                     </span>
                   )}
                </div>
                <span className="text-zinc-500 text-sm truncate">{email.summary}</span>
              </div>
              <div className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-md text-[11px] font-bold">
                {email.status}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default EmailHubInbox;
