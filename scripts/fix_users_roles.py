import pathlib

p = pathlib.Path('/home/kakes/FlowOps-Logistics/frontend/src/pages/UsersRoles.tsx')
c = p.read_text()

# 1 -- Add state variables after isSearching
old = '  const [isSearching, setIsSearching] = useState(false);'
new = (
    '  const [isSearching, setIsSearching] = useState(false);\n'
    '  const [showCreate, setShowCreate] = useState(false);\n'
    "  const [cEmail, setCEmail] = useState('');\n"
    "  const [cPassword, setCPassword] = useState('');\n"
    "  const [cRole, setCRole] = useState('DISPATCH');\n"
    "  const [cName, setCName] = useState('');\n"
    '  const [creating, setCreating] = useState(false);\n'
    "  const [createMsg, setCreateMsg] = useState('');"
)
c = c.replace(old, new, 1)

# 2 -- Add createUser function
old2 = '  useEffect(() => { fetchUsers(); }, []);'
new2 = (
    '  useEffect(() => { fetchUsers(); }, []);\n\n'
    '  const createUser = async () => {\n'
    "    if (!cEmail || !cPassword) { setCreateMsg('Email and password required'); return; }\n"
    "    setCreating(true); setCreateMsg('');\n"
    '    try {\n'
    "      await api.post('/users', { email: cEmail.trim(), name: cName || cEmail.split('@')[0], password: cPassword, role: cRole });\n"
    "      setCreateMsg('User created successfully!');\n"
    "      setCEmail(''); setCPassword(''); setCName('');\n"
    '      setTimeout(() => { setShowCreate(false); setCreateMsg(\'\'); fetchUsers(); }, 1200);\n'
    '    } catch (e: any) {\n'
    "      setCreateMsg(e?.response?.data?.message || 'Failed to create user');\n"
    '    } finally { setCreating(false); }\n'
    '  };'
)
c = c.replace(old2, new2, 1)

# 3 -- Wire INVITE AGENT button
lines = c.split('\n')
for i, line in enumerate(lines):
    if '+ INVITE AGENT' in line:
        for j in range(i, max(i-5, 0), -1):
            if '<button ' in lines[j] and 'onClick' not in lines[j]:
                lines[j] = lines[j].replace('<button ', '<button onClick={() => setShowCreate(true)} ', 1)
                break
        break
c = '\n'.join(lines)

# 4 -- Fix pointer-events on front face when flipped (Firefox 3D click-through)
c = c.replace(
    'className="absolute inset-0 backface-hidden bg-white/5',
    'className={`absolute inset-0 backface-hidden bg-white/5',
    1
)
# Also fix the closing quote of that same className
idx = c.find('hover:border-blue-500/30 transition-colors">')
if idx >= 0:
    c = c[:idx] + 'hover:border-blue-500/30 transition-colors${flippedId === user.id ? " pointer-events-none" : ""}` }>' + c[idx + len('hover:border-blue-500/30 transition-colors">'):]

# 5 -- Add modal before final closing
nl = '\n'
modal = (
    nl +
    '      {showCreate && (' + nl +
    "        <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.8)'}}>" + nl +
    "          <div style={{width:'100%',maxWidth:420,borderRadius:28,border:'1px solid rgba(255,255,255,0.1)',background:'#0b1530',padding:32}}>" + nl +
    "            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>" + nl +
    "              <h2 style={{color:'white',fontWeight:900,fontSize:22,margin:0}}>Invite Agent</h2>" + nl +
    "              <button onClick={()=>{setShowCreate(false);setCreateMsg('');}} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:20}}>&#x2715;</button>" + nl +
    '            </div>' + nl +
    "            <div style={{display:'flex',flexDirection:'column',gap:12}}>" + nl +
    "              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Name</div>" + nl +
    "                <input value={cName} onChange={e=>setCName(e.target.value)} placeholder='Display name' style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'12px 14px',color:'white',fontSize:14,outline:'none',boxSizing:'border-box'}} /></div>" + nl +
    "              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Email *</div>" + nl +
    "                <input type='email' value={cEmail} onChange={e=>setCEmail(e.target.value)} placeholder='agent@company.com' style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'12px 14px',color:'white',fontSize:14,outline:'none',boxSizing:'border-box'}} /></div>" + nl +
    "              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Password *</div>" + nl +
    "                <input type='password' value={cPassword} onChange={e=>setCPassword(e.target.value)} placeholder='Min 6 characters' style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'12px 14px',color:'white',fontSize:14,outline:'none',boxSizing:'border-box'}} /></div>" + nl +
    "              <div><div style={{color:'#94a3b8',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:2,marginBottom:4}}>Role</div>" + nl +
    "                <select value={cRole} onChange={e=>setCRole(e.target.value)} style={{width:'100%',borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',background:'#0b1530',padding:'12px 14px',color:'white',fontSize:14,outline:'none'}}>" + nl +
    "                  <option value='DISPATCH'>Dispatch Controller</option>" + nl +
    "                  <option value='WAREHOUSE'>Warehouse Clerk</option>" + nl +
    "                  <option value='DRIVER'>Field Driver</option>" + nl +
    "                  <option value='MANAGER'>Ops Manager</option>" + nl +
    "                  <option value='AGENT'>Sales Agent</option>" + nl +
    "                  <option value='VIEWER'>Finance Viewer</option>" + nl +
    "                  <option value='ADMIN'>Administrator</option>" + nl +
    "                  <option value='COMPANY_ADMIN'>Company Admin</option>" + nl +
    '                </select></div>' + nl +
    "              {createMsg && <div style={{padding:'10px 14px',borderRadius:14,background:createMsg.includes('!')||createMsg.includes('success')?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',color:createMsg.includes('!')||createMsg.includes('success')?'#6ee7b7':'#fca5a5',fontSize:13,fontWeight:700}}>{createMsg}</div>}" + nl +
    "              <button onClick={createUser} disabled={creating} style={{marginTop:8,width:'100%',borderRadius:14,background:'#2563eb',padding:'14px',color:'white',fontWeight:900,fontSize:13,border:'none',cursor:creating?'not-allowed':'pointer',opacity:creating?0.6:1}}>" + nl +
    '                {creating ? \'Deploying...\' : \'Deploy Agent\'}' + nl +
    '              </button>' + nl +
    '            </div>' + nl +
    '          </div>' + nl +
    '        </div>' + nl +
    '      )}'
)

idx = c.rfind('    </div>\n  );\n}')
if idx >= 0:
    c = c[:idx] + modal + '\n' + c[idx:]
else:
    print('WARNING: Could not find insertion point for modal')

p.write_text(c)
print('All fixes applied successfully')
