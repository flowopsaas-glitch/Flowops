import pathlib

p = pathlib.Path('/home/kakes/FlowOps-Logistics/frontend/src/pages/UsersRoles.tsx')
c = p.read_text()

if 'pinInputs' in c:
    print('Driver PINs already present — nothing to do')
    exit(0)

# 1 -- Add state
old_state = "  const [createMsg, setCreateMsg] = useState('');"
new_state = (
    "  const [createMsg, setCreateMsg] = useState('');\n"
    "  const [drivers, setDrivers] = useState<any[]>([]);\n"
    "  const [pinInputs, setPinInputs] = useState<Record<string,string>>({});\n"
    "  const [pinSaving, setPinSaving] = useState<string|null>(null);\n"
    "  const [pinMsg, setPinMsg] = useState('');"
)
c = c.replace(old_state, new_state, 1)

# 2 -- Add loadDrivers + PIN handlers before createUser
old_fn = '  const createUser = async () => {'
new_fn = (
    '  const loadDrivers = async () => {\n'
    '    try {\n'
    "      const res: any = await api.get('/drivers');\n"
    '      const list = Array.isArray(res) ? res : (res?.data ?? []);\n'
    '      setDrivers(list.map((d:any) => ({ id: String(d.id), name: d.name||\'Driver\', phone: d.phone, vehicleReg: d.vehicleReg, hasPinSet: !!d.driverPin })));\n'
    '    } catch {}\n'
    '  };\n\n'
    '  const handleSetPin = async (id: string) => {\n'
    "    const pin = (pinInputs[id]||'').trim();\n"
    "    if (!pin || pin.length < 4 || pin.length > 6 || !/^\\d+$/.test(pin)) { setPinMsg('PIN must be 4-6 digits'); return; }\n"
    "    setPinSaving(id); setPinMsg('');\n"
    "    try { await api.patch(`/drivers/${id}/pin`, { pin }); setPinMsg('PIN set!'); setPinInputs(p=>({...p,[id]:''})); loadDrivers(); }\n"
    "    catch { setPinMsg('Failed to set PIN'); }\n"
    '    finally { setPinSaving(null); }\n'
    '  };\n\n'
    '  const handleClearPin = async (id: string) => {\n'
    "    setPinSaving(id); setPinMsg('');\n"
    "    try { await api.patch(`/drivers/${id}/reset-pin`, {}); setPinMsg('PIN cleared.'); loadDrivers(); }\n"
    "    catch { setPinMsg('Failed to clear PIN'); }\n"
    '    finally { setPinSaving(null); }\n'
    '  };\n\n'
    '  const createUser = async () => {'
)
c = c.replace(old_fn, new_fn, 1)

# 3 -- Load drivers on mount
c = c.replace(
    'useEffect(() => { fetchUsers(); }, []);',
    'useEffect(() => { fetchUsers(); loadDrivers(); }, []);',
    1
)

# 4 -- Build Driver PINs section HTML
nl = '\n'
section = (
    nl +
    '        {/* DRIVER PINs */' + nl +
    '        <div style={{marginTop:48}}>' + nl +
    '          <div style={{marginBottom:24}}>' + nl +
    "            <h2 style={{color:'white',fontWeight:900,fontSize:28,margin:0,letterSpacing:'-1px'}}>DRIVER <span style={{color:'#2563eb'}}>PINs</span></h2>" + nl +
    "            <p style={{color:'#475569',fontSize:12,marginTop:6,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.2em'}}>Portal access codes for field drivers</p>" + nl +
    '          </div>' + nl +
    "          {pinMsg && <div style={{marginBottom:16,padding:'10px 16px',borderRadius:16,background:pinMsg.includes('set')||pinMsg.includes('clear')||pinMsg.includes('!')? 'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',color:pinMsg.includes('set')||pinMsg.includes('clear')||pinMsg.includes('!')?'#6ee7b7':'#fca5a5',fontSize:13,fontWeight:700}}>{pinMsg}</div>}" + nl +
    "          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:16}}>" + nl +
    "            {drivers.length===0 && <div style={{color:'#475569',fontSize:14}}>No drivers yet. Add drivers in Driver Dispatch first.</div>}" + nl +
    '            {drivers.map((d:any) => (' + nl +
    "              <div key={d.id} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:24,padding:20,display:'flex',flexWrap:'wrap' as any,alignItems:'center',gap:12}}>" + nl +
    "                <div style={{flex:1,minWidth:0}}>" + nl +
    "                  <div style={{color:'white',fontWeight:900,fontSize:15}}>{d.name}</div>" + nl +
    "                  <div style={{color:'#64748b',fontSize:12,marginTop:2}}>{d.phone||'—'}{d.vehicleReg?` \xb7 ${d.vehicleReg}`:''}</div>" + nl +
    "                </div>" + nl +
    "                <span style={{padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:d.hasPinSet?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)',color:d.hasPinSet?'#6ee7b7':'#fbbf24',border:`1px solid ${d.hasPinSet?'rgba(16,185,129,0.3)':'rgba(245,158,11,0.3)'}`}}>{d.hasPinSet?'PIN SET':'NO PIN'}</span>" + nl +
    "                <div style={{display:'flex',gap:8,alignItems:'center'}}>" + nl +
    "                  <input type='number' value={pinInputs[d.id]||''} onChange={e=>setPinInputs(p=>({...p,[d.id]:e.target.value}))} placeholder='4-6 digit PIN' style={{width:100,borderRadius:12,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,0,0,0.4)',padding:'8px 12px',color:'white',fontSize:13,outline:'none'}} />" + nl +
    "                  <button onClick={()=>handleSetPin(d.id)} disabled={pinSaving===d.id} style={{borderRadius:12,background:'rgba(37,99,235,0.2)',border:'1px solid rgba(37,99,235,0.3)',padding:'8px 14px',color:'#93c5fd',fontSize:12,fontWeight:700,cursor:'pointer'}}>Set</button>" + nl +
    "                  {d.hasPinSet && <button onClick={()=>handleClearPin(d.id)} disabled={pinSaving===d.id} style={{borderRadius:12,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',padding:'8px 14px',color:'#fca5a5',fontSize:12,fontWeight:700,cursor:'pointer'}}>Clear</button>}" + nl +
    "                </div>" + nl +
    "              </div>" + nl +
    '            ))}' + nl +
    '          </div>' + nl +
    '        </div>'
)

# 5 -- Insert before last closing </div>
idx = c.rfind('    </div>\n  );\n}')
if idx >= 0:
    c = c[:idx] + section + '\n' + c[idx:]
else:
    print('WARNING: could not find insertion point - appending')
    c = c.rstrip().rstrip('}') + section + '\n}'

p.write_text(c)
print('Done — Driver PINs section added to User Roles page')
