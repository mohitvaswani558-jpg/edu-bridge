import {useEffect,useState,useCallback} from 'react';
import {sb,ist,upload,openFile,enablePush} from './lib';
type Role='teacher'|'student';type Tab='home'|'chat'|'tests'|'files'|'alerts'|'manage';
const ICON:Record<Tab,string>={home:'🏠',chat:'💬',tests:'📝',files:'📚',alerts:'🔔',manage:'⚙️'};

export default function App(){
  const [uid,setUid]=useState<string|null|undefined>(undefined);const [role,setRole]=useState<Role|null>(null);
  useEffect(()=>{sb.auth.getSession().then(({data})=>setUid(data.session?.user.id??null));
    const {data:l}=sb.auth.onAuthStateChange((_,s)=>setUid(s?.user.id??null));return()=>l.subscription.unsubscribe();},[]);
  useEffect(()=>{if(!uid){setRole(null);return;}
    sb.from('teacher_profile').select('id').eq('user_id',uid).maybeSingle().then(({data})=>setRole(data?'teacher':'student'));},[uid]);
  if(uid===undefined)return <p className="p-8 text-center">Loading…</p>;
  if(!uid)return <Login/>;if(!role)return <p className="p-8 text-center">Loading…</p>;
  return <Shell role={role} uid={uid}/>;}

function Login(){
  const [email,setE]=useState('');const [pw,setP]=useState('');const [first,setF]=useState(false);const [msg,setM]=useState('');const [busy,setB]=useState(false);
  async function go(){setB(true);setM('');
    const r=first?await sb.auth.signUp({email,password:pw}):await sb.auth.signInWithPassword({email,password:pw});
    setB(false);if(r.error)setM(r.error.message.includes('not enrolled')?'This email is not enrolled. Contact your teacher.':r.error.message);
    else if(first&&!r.data.session)setM('Check your email to confirm, then log in.');}
  return <div className="min-h-screen flex flex-col justify-center p-6 max-w-sm mx-auto">
    <h1 className="text-3xl font-bold text-brand mb-1">EduBridge</h1>
    <p className="text-gray-500 mb-6">Learn · Practice · <span className="text-green-600 font-semibold">Excel</span></p>
    <div className="card space-y-3">
      <input className="inp" type="email" placeholder="Email" value={email} onChange={e=>setE(e.target.value)}/>
      <input className="inp" type="password" placeholder="Password (min 6)" value={pw} onChange={e=>setP(e.target.value)}/>
      {msg&&<p className="text-sm text-red-600">{msg}</p>}
      <button className="btn w-full" disabled={busy||!email||pw.length<6} onClick={go}>{first?'Set password':'Login'}</button>
      <button className="text-xs text-brand w-full" onClick={()=>setF(!first)}>{first?'Already set? Login':'First time? Set your password (only if your teacher enrolled you)'}</button>
    </div></div>;}

function Shell({role,uid}:{role:Role;uid:string}){
  const [tab,setTab]=useState<Tab>('home');const [unread,setU]=useState(0);const [batches,setBs]=useState<any[]>([]);
  const loadB=useCallback(()=>{sb.from('batches').select('*').order('name').then(({data})=>setBs(data||[]));},[]);
  const loadU=useCallback(()=>{sb.from('notifications').select('id',{count:'exact',head:true}).is('read_at',null).then(({count})=>setU(count||0));},[]);
  useEffect(()=>{loadB();loadU();
    const ch=sb.channel('n-'+uid).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${uid}`},loadU).subscribe();
    return()=>{sb.removeChannel(ch);};},[uid,loadB,loadU]);
  const tabs:Tab[]=role==='teacher'?['home','chat','tests','files','manage']:['home','chat','tests','files','alerts'];
  return <div className="max-w-xl mx-auto min-h-screen pb-24">
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur flex items-center justify-between px-4 py-3 border-b" style={{paddingTop:'max(0.75rem,env(safe-area-inset-top))'}}>
      <b className="text-brand">EduBridge</b>
      <div className="flex items-center gap-3"><button className="relative text-xl" onClick={()=>setTab('alerts')}>🔔{unread>0&&<span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] rounded-full px-1.5">{unread}</span>}</button>
      <button className="text-xs text-gray-500" onClick={()=>sb.auth.signOut()}>Logout</button></div></header>
    <main className="p-4 space-y-4">
      {tab==='home'&&<Home role={role} batches={batches} go={setTab}/>}
      {tab==='chat'&&<Chat role={role} uid={uid} batches={batches}/>}
      {tab==='tests'&&<Tests role={role} batches={batches}/>}
      {tab==='files'&&<Files role={role} batches={batches}/>}
      {tab==='alerts'&&<Alerts go={setTab} reload={loadU}/>}
      {tab==='manage'&&<Manage batches={batches} reload={loadB}/>}
    </main>
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex justify-around" style={{paddingBottom:'env(safe-area-inset-bottom)'}}>
      {tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`flex-1 py-2.5 text-xs capitalize ${tab===t?'text-brand font-bold':'text-gray-400'}`}><div className="text-lg">{ICON[t]}</div>{t}</button>)}
    </nav></div>;}

function BatchPick({batches,v,set}:{batches:any[];v:string;set:(s:string)=>void}){
  useEffect(()=>{if(!v&&batches[0])set(batches[0].id);},[batches,v,set]);
  if(!batches.length)return <p className="card text-sm text-gray-500">No batch yet.</p>;
  return <select className="inp" value={v} onChange={e=>set(e.target.value)}>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>;}

function Home({role,batches,go}:{role:Role;batches:any[];go:(t:Tab)=>void}){
  const [c,setC]=useState<any>({});const [ann,setAnn]=useState<any[]>([]);const [up,setUp]=useState<any[]>([]);
  useEffect(()=>{(async()=>{
    const n=async(t:string)=>(await sb.from(t).select('id',{count:'exact',head:true})).count||0;
    setC({students:role==='teacher'?await n('students'):0,materials:await n('study_materials'),tests:await n('tests')});
    setAnn((await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(3)).data||[]);
    setUp((await sb.from('tests').select('*').gte('ends_at',new Date().toISOString()).order('starts_at').limit(3)).data||[]);})();},[role]);
  return <>
    <h2 className="text-xl font-bold">{role==='teacher'?'Welcome back, Mam! 👋':'Welcome back!'}</h2>
    <div className="grid grid-cols-2 gap-3">
      {role==='teacher'&&<Stat n={c.students} l="Total Students"/>}<Stat n={batches.length} l={role==='teacher'?'Active Batches':'My Batch'}/>
      <Stat n={c.materials} l="Materials"/><Stat n={c.tests} l="Tests"/></div>
    <Section t="Upcoming Tests" onMore={()=>go('tests')}>{up.map(t=><p key={t.id} className="text-sm py-1"><b>{t.title}</b><br/><span className="text-gray-500">{ist(t.starts_at)} · {t.duration_min} min</span></p>)}{!up.length&&<Empty/>}</Section>
    <Section t="Announcements">{ann.map(a=><p key={a.id} className="text-sm py-1"><b>{a.title}</b><br/><span className="text-gray-500">{a.body}</span></p>)}{!ann.length&&<Empty/>}</Section></>;}
const Stat=({n,l}:{n:number;l:string})=><div className="card"><div className="text-2xl font-bold">{n??'–'}</div><div className="text-xs text-gray-500">{l}</div></div>;
const Empty=()=><p className="text-sm text-gray-400">Nothing yet.</p>;
const Section=({t,children,onMore}:any)=><div className="card"><div className="flex justify-between mb-1"><b className="text-sm">{t}</b>{onMore&&<button onClick={onMore} className="text-xs text-brand">View All →</button>}</div>{children}</div>;

function Chat({role,uid,batches}:{role:Role;uid:string;batches:any[]}){
  const [b,setB]=useState('');const [msgs,setM]=useState<any[]>([]);const [t,setT]=useState('');const [err,setErr]=useState('');
  const load=useCallback(()=>{if(b)sb.from('discussions').select('*').eq('batch_id',b).order('created_at').then(({data})=>setM(data||[]));},[b]);
  useEffect(()=>{load();if(!b)return;
    const ch=sb.channel('d-'+b).on('postgres_changes',{event:'*',schema:'public',table:'discussions',filter:`batch_id=eq.${b}`},load).subscribe();
    return()=>{sb.removeChannel(ch);};},[b,load]);
  async function send(file?:File){setErr('');try{
    const attachment_path=file?await upload('chat',b,file):null;
    if(!t.trim()&&!file)return;
    const {error}=await sb.from('discussions').insert({batch_id:b,author_id:uid,body:t.trim()||'📎 Attachment',attachment_path});
    if(error)throw error;setT('');}catch(e:any){setErr(e.message);}}
  const mod=(id:string,p:any)=>sb.from('discussions').update(p).eq('id',id).then(load);
  return <><BatchPick batches={batches} v={b} set={setB}/>
    <div className="space-y-2">{msgs.sort((a,b)=>+b.pinned-+a.pinned).map(m=><div key={m.id} className={`card text-sm ${m.author_id===uid?'bg-mint':''}`}>
      {m.pinned&&<span className="text-xs">📌 Pinned </span>}{m.resolved&&<span className="text-xs text-green-700">✅ Resolved</span>}
      <p>{m.body}</p>{m.attachment_path&&<button className="text-xs text-brand" onClick={()=>openFile('chat',m.attachment_path)}>Open attachment</button>}
      <p className="text-[11px] text-gray-400">{ist(m.created_at)}</p>
      {role==='teacher'&&<div className="flex gap-3 text-xs text-brand mt-1">
        <button onClick={()=>mod(m.id,{pinned:!m.pinned})}>Pin</button><button onClick={()=>mod(m.id,{resolved:!m.resolved})}>Resolve</button>
        <button className="text-red-600" onClick={()=>confirm('Delete message?')&&sb.from('discussions').delete().eq('id',m.id).then(load)}>Delete</button></div>}</div>)}
      {!msgs.length&&<Empty/>}</div>
    {err&&<p className="text-xs text-red-600">{err}</p>}
    <div className="fixed bottom-16 inset-x-0 max-w-xl mx-auto p-3 bg-white border-t flex gap-2 items-center">
      <label className="cursor-pointer">📎<input type="file" hidden accept="image/*,.pdf" onChange={e=>e.target.files?.[0]&&send(e.target.files[0])}/></label>
      <input className="inp" placeholder="Ask your doubt here…" value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/>
      <button className="btn" onClick={()=>send()}>Send</button></div><div className="h-14"/></>;}

function Tests({role,batches}:{role:Role;batches:any[]}){
  const [list,setL]=useState<any[]>([]);const [run,setRun]=useState<any>(null);const [res,setRes]=useState<any>(null);const [err,setErr]=useState('');
  const load=()=>{sb.from('tests').select('*').order('starts_at',{ascending:false}).then(({data})=>setL(data||[]));
    if(role==='student')sb.from('test_attempts').select('*').not('submitted_at','is',null).then(({data})=>setRes(Object.fromEntries((data||[]).map(a=>[a.test_id,a]))));};
  useEffect(load,[role]);
  async function start(t:any){setErr('');const {data,error}=await sb.rpc('start_attempt',{p_test:t.id});
    if(error)return setErr(error.message);setRun({...data,title:t.title,ans:{},i:0});}
  if(run)return <Attempt run={run} setRun={setRun} done={()=>{setRun(null);load();}}/>;
  return <>{err&&<p className="text-sm text-red-600">{err}</p>}
    {list.map(t=>{const now=Date.now(),open=now>=+new Date(t.starts_at)&&now<=+new Date(t.ends_at),r=res?.[t.id];
      return <div key={t.id} className="card"><b>{t.title}</b><p className="text-xs text-gray-500">{ist(t.starts_at)} → {ist(t.ends_at)} · {t.duration_min} min{t.negative_marks>0&&` · −${t.negative_marks} per wrong`}</p>
        {role==='student'&&(r?<p className="text-sm mt-2">Score <b>{r.total_marks}</b> · ✔{r.correct} ✘{r.incorrect} – {r.unanswered} · {r.percentage}%</p>
          :<button className="btn mt-2" disabled={!open} onClick={()=>start(t)}>{open?'Start Test':'Not open'}</button>)}
        {role==='teacher'&&<Results id={t.id}/>}</div>;})}
    {!list.length&&<Empty/>}{role==='teacher'&&<p className="text-xs text-gray-400">Test creation form: next build.</p>}</>;}

function Results({id}:{id:string}){const [r,setR]=useState<any[]|null>(null);
  if(!r)return <button className="text-xs text-brand mt-2" onClick={()=>sb.from('test_attempts').select('*,students(full_name,roll_no)').eq('test_id',id).then(({data})=>setR(data||[]))}>View results</button>;
  return <div className="mt-2 text-xs">{r.map(a=><p key={a.id}>{a.students?.full_name} ({a.students?.roll_no}): {a.total_marks??'in progress'} · {a.percentage??''}%</p>)}{!r.length&&<Empty/>}</div>;}

function Attempt({run,setRun,done}:any){
  const end=+new Date(run.started_at)+run.duration_min*60000;const [left,setL]=useState(end-Date.now());const [busy,setB]=useState(false);
  const submit=useCallback(async()=>{if(busy)return;setB(true);
    const {error}=await sb.rpc('submit_attempt',{p_attempt:run.attempt_id,p_answers:run.ans});if(error)alert(error.message);done();},[run,busy,done]);
  useEffect(()=>{const t=setInterval(()=>{const l=end-Date.now();setL(l);if(l<=0){clearInterval(t);submit();}},1000);return()=>clearInterval(t);});
  const q=run.questions[run.i];const m=Math.max(0,Math.floor(left/60000)),s=Math.max(0,Math.floor(left/1000)%60);
  return <><div className="flex justify-between items-center"><b>{run.title}</b><span className={`font-mono ${left<60000?'text-red-600':''}`}>{m}:{String(s).padStart(2,'0')}</span></div>
    <div className="card"><p className="text-xs text-gray-400">Question {run.i+1}/{run.questions.length} · {q.marks} mark(s)</p><p className="font-medium my-2">{q.text}</p>
      {['a','b','c','d'].map(o=><button key={o} onClick={()=>setRun({...run,ans:{...run.ans,[q.id]:o}})}
        className={`w-full text-left border rounded-xl px-3 py-2.5 mb-2 text-sm ${run.ans[q.id]===o?'border-brand bg-mint':'border-gray-200'}`}>{o.toUpperCase()}. {q[o]}</button>)}</div>
    <div className="flex flex-wrap gap-1.5">{run.questions.map((x:any,i:number)=><button key={x.id} onClick={()=>setRun({...run,i})} className={`w-8 h-8 rounded-full text-xs ${i===run.i?'ring-2 ring-brand':''} ${run.ans[x.id]?'bg-brand text-white':'bg-gray-100'}`}>{i+1}</button>)}</div>
    <div className="flex gap-2"><button className="btn" disabled={run.i===0} onClick={()=>setRun({...run,i:run.i-1})}>Prev</button>
      <button className="btn" disabled={run.i===run.questions.length-1} onClick={()=>setRun({...run,i:run.i+1})}>Next</button>
      <button className="btn ml-auto" disabled={busy} onClick={()=>confirm('Submit test?')&&submit()}>Submit</button></div></>;}

function Files({role,batches}:{role:Role;batches:any[]}){
  const [b,setB]=useState('');const [l,setL]=useState<any[]>([]);
  const load=useCallback(()=>{if(b)sb.from('study_materials').select('*').eq('batch_id',b).order('created_at',{ascending:false}).then(({data})=>setL(data||[]));},[b]);
  useEffect(load,[load]);
  return <><BatchPick batches={batches} v={b} set={setB}/>
    {role==='teacher'&&b&&<UploadForm batch={b} done={load}/>}
    {l.map(m=><div key={m.id} className="card flex justify-between items-center"><div><b className="text-sm">{m.title}</b><p className="text-xs text-gray-500 capitalize">{m.category}{m.unit&&` · Unit ${m.unit}`}</p></div>
      <div className="flex gap-3 text-sm"><button className="text-brand" onClick={()=>openFile('materials',m.file_path)}>Open</button>
      {role==='teacher'&&<button className="text-red-600" onClick={()=>confirm('Delete?')&&sb.from('study_materials').delete().eq('id',m.id).then(load)}>✕</button>}</div></div>)}
    {!l.length&&<Empty/>}</>;}

function UploadForm({batch,done}:{batch:string;done:()=>void}){
  const [title,setT]=useState('');const [cat,setC]=useState('notes');const [unit,setU]=useState('');const [f,setF]=useState<File|null>(null);const [busy,setB]=useState(false);const [err,setE]=useState('');
  async function go(){if(!f||!title.trim())return;setB(true);setE('');try{
    const file_path=await upload('materials',batch,f);
    const {error}=await sb.from('study_materials').insert({batch_id:batch,title:title.trim(),category:cat,unit:unit?+unit:null,file_path,published:true});
    if(error)throw error;setT('');setF(null);done();}catch(e:any){setE(e.message);}setB(false);}
  return <Section t="Upload material (students are notified)"><div className="space-y-2">
    <input className="inp" placeholder="Title" value={title} onChange={e=>setT(e.target.value)}/>
    <div className="flex gap-2"><select className="inp" value={cat} onChange={e=>setC(e.target.value)}>{['notes','pyq','pdf','ppt','assignment','important_questions','practical','reference','other'].map(x=><option key={x}>{x}</option>)}</select>
    <input className="inp w-24" placeholder="Unit" type="number" value={unit} onChange={e=>setU(e.target.value)}/></div>
    <input type="file" accept=".pdf,.ppt,.pptx,.docx,image/*" onChange={e=>setF(e.target.files?.[0]||null)} className="text-sm"/>
    {err&&<p className="text-xs text-red-600">{err}</p>}<button className="btn" disabled={busy||!f||!title.trim()} onClick={go}>{busy?'Uploading…':'Publish'}</button></div></Section>;}

function Alerts({go,reload}:{go:(t:Tab)=>void;reload:()=>void}){
  const [l,setL]=useState<any[]>([]);const [msg,setM]=useState('');
  const load=()=>sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(50).then(({data})=>setL(data||[]));
  useEffect(()=>{load();const ch=sb.channel('al').on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},load).subscribe();return()=>{sb.removeChannel(ch);};},[]);
  const open=async(n:any)=>{await sb.from('notifications').update({read_at:new Date().toISOString()}).eq('id',n.id);reload();load();
    go(n.kind.startsWith('test')?'tests':n.kind==='discussion'?'chat':n.kind==='material'?'files':'home');};
  return <><div className="flex justify-between"><b>Notifications</b><button className="text-xs text-brand" onClick={async()=>setM(await enablePush())}>Enable push</button></div>
    {msg&&<p className="text-xs text-gray-500">{msg}</p>}
    {l.map(n=><button key={n.id} onClick={()=>open(n)} className={`card w-full text-left ${n.read_at?'opacity-60':'border-l-4 border-l-brand'}`}><b className="text-sm">{n.title}</b><p className="text-xs text-gray-500">{n.body}</p><p className="text-[11px] text-gray-400">{ist(n.created_at)}</p></button>)}
    {!l.length&&<Empty/>}</>;}

function Manage({batches,reload}:{batches:any[];reload:()=>void}){
  const [bn,setBn]=useState({name:'',branch:'',year:'2025-26'});const [st,setSt]=useState({name:'',roll:'',email:'',batch:''});
  const [an,setAn]=useState({batch:'',title:'',body:''});const [msg,setM]=useState('');
  const say=(e:any,ok:string)=>setM(e?e.message:ok);
  return <><p className="text-sm text-brand">{msg}</p>
    <Section t="Create batch"><div className="space-y-2"><input className="inp" placeholder="e.g. CSE-AIDS B1" value={bn.name} onChange={e=>setBn({...bn,name:e.target.value})}/>
      <input className="inp" placeholder="Branch" value={bn.branch} onChange={e=>setBn({...bn,branch:e.target.value})}/>
      <input className="inp" placeholder="Academic year" value={bn.year} onChange={e=>setBn({...bn,year:e.target.value})}/>
      <button className="btn" disabled={!bn.name||!bn.branch} onClick={async()=>{const {error}=await sb.from('batches').insert({name:bn.name,branch:bn.branch,academic_year:bn.year});say(error,'Batch created');reload();}}>Create</button></div></Section>
    <Section t="Enroll student"><div className="space-y-2"><input className="inp" placeholder="Name" value={st.name} onChange={e=>setSt({...st,name:e.target.value})}/>
      <input className="inp" placeholder="Roll number" value={st.roll} onChange={e=>setSt({...st,roll:e.target.value})}/>
      <input className="inp" type="email" placeholder="Email" value={st.email} onChange={e=>setSt({...st,email:e.target.value})}/>
      <select className="inp" value={st.batch} onChange={e=>setSt({...st,batch:e.target.value})}><option value="">Select batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <button className="btn" disabled={!st.name||!st.roll||!st.email||!st.batch} onClick={async()=>{
        const {data,error}=await sb.from('students').insert({full_name:st.name.trim(),roll_no:st.roll.trim(),email:st.email.trim().toLowerCase()}).select().single();
        if(error)return say(error,'');const e2=await sb.from('batch_enrollments').insert({batch_id:st.batch,student_id:data.id});
        say(e2.error,'Enrolled. Tell the student to open the app → "First time? Set your password".');}}>Enroll</button></div></Section>
    <Section t="Post announcement"><div className="space-y-2"><select className="inp" value={an.batch} onChange={e=>setAn({...an,batch:e.target.value})}><option value="">Select batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <input className="inp" placeholder="Title" value={an.title} onChange={e=>setAn({...an,title:e.target.value})}/>
      <textarea className="inp" placeholder="Message" value={an.body} onChange={e=>setAn({...an,body:e.target.value})}/>
      <button className="btn" disabled={!an.batch||!an.title||!an.body} onClick={async()=>{const {error}=await sb.from('announcements').insert({batch_id:an.batch,title:an.title,body:an.body});say(error,'Posted & students notified');}}>Post</button></div></Section></>;}
