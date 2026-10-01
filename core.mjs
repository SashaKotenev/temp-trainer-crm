export const DAY='2026-10-01';
export const id=()=>crypto.randomUUID();
export const balance=(s,p)=>p.count-s.sessions.filter(x=>x.packageId===p.id&&x.status==='done').length;
export const paid=(s,p)=>s.payments.filter(x=>x.packageId===p.id).reduce((a,x)=>a+x.amount,0);
export const available=(s,c)=>s.packages.filter(p=>p.clientId===c).reduce((n,p)=>n+balance(s,p),0);
export const debt=(s,c)=>s.packages.filter(p=>p.clientId===c).reduce((n,p)=>n+p.price-paid(s,p),0);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const string=(v,max=200)=>typeof v==='string'&&v.length<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00+03:00'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const start=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)&&date(v.slice(0,10))&&Number(v.slice(11,13))<24&&Number(v.slice(14))<60;
const time=v=>Date.parse(v+'+03:00');
export function validate(s){
 const fail=()=>{throw new Error('Файл не соответствует формату ТЕМП. Исходные данные не изменены.');};
 if(!s||s.version!==1||!integer(s.revision,0,1e9))fail();
 for(const key of ['clients','packages','payments','sessions','leads','tasks','audit'])if(!Array.isArray(s[key])||s[key].length>10000)fail();
 const all=s.clients.concat(s.packages,s.payments,s.sessions,s.leads,s.tasks);
 if(all.some(x=>!x||!string(x.id,80)||!x.id)||new Set(all.map(x=>x.id)).size!==all.length)fail();
 const cs=new Set(s.clients.map(x=>x.id)),ps=new Map(s.packages.map(x=>[x.id,x]));
 for(const c of s.clients)if(!string(c.name,80)||!c.name.trim()||!string(c.goal)||!string(c.contact,120)||!string(c.note,2000)||!['active','paused'].includes(c.status))fail();
 for(const p of s.packages)if(!cs.has(p.clientId)||!integer(p.count,1,1000)||!integer(p.price,0,1e8)||!date(p.date)||balance(s,p)<0)fail();
 for(const p of s.payments)if(!ps.has(p.packageId)||!integer(p.amount,1,1e8)||!date(p.date)||!['Перевод','Наличные','Карта'].includes(p.method))fail();
 for(const p of s.packages)if(paid(s,p)>p.price)fail();
 for(const x of s.sessions){
  if(!cs.has(x.clientId)||!start(x.start)||!integer(x.duration,15,240)||!['planned','done','canceled'].includes(x.status)||!string(x.type,80)||!string(x.note,2000)||!Array.isArray(x.exercises)||x.exercises.length>30)fail();
  if(x.status==='done'&&(!ps.has(x.packageId)||ps.get(x.packageId).clientId!==x.clientId||x.exercises.length===0))fail();
  if(x.packageId!==null&&(!ps.has(x.packageId)||ps.get(x.packageId).clientId!==x.clientId))fail();
  for(const e of x.exercises)if(!string(e.name,80)||!e.name.trim()||!integer(e.sets,1,50)||!integer(e.reps,1,1000)||!Number.isFinite(e.weight)||e.weight<0||e.weight>1000)fail();
 }
 for(const x of s.leads)if(!string(x.name,80)||!x.name.trim()||!string(x.contact,120)||!string(x.goal)||!string(x.source,80)||!['new','contact','trial','won','lost'].includes(x.stage)||!date(x.date)||(x.clientId!==null&&!cs.has(x.clientId)))fail();
 for(const x of s.tasks)if(!string(x.text,300)||!x.text.trim()||!date(x.date)||typeof x.done!=='boolean'||(x.clientId!==null&&!cs.has(x.clientId)))fail();
 for(const x of s.audit)if(!x||!string(x.text,400)||!string(x.at,50))fail();
 return s;
}
export function schedule(s,input,editingId=null){
 const stamp=time(input.start),end=stamp+input.duration*60000;
 if(!start(input.start)||!integer(input.duration,15,240))throw new Error('Проверьте дату и продолжительность занятия.');
 if(s.sessions.some(x=>x.id!==editingId&&x.status!=='canceled'&&stamp<time(x.start)+x.duration*60000&&end>time(x.start)))throw new Error('В это время уже есть занятие. Выберите свободное время.');
 if(editingId){const current=s.sessions.find(x=>x.id===editingId);if(!current||current.status!=='planned')throw new Error('Переносить можно только запланированное занятие.');Object.assign(current,input);}
 else s.sessions.push({id:id(),...input,status:'planned',packageId:null,exercises:[],note:''});
}
export function complete(s,sessionId,exercises,note){
 const x=s.sessions.find(x=>x.id===sessionId);
 if(!x||x.status!=='planned')throw new Error('Это занятие уже завершено или отменено.');
 const p=s.packages.find(p=>p.clientId===x.clientId&&balance(s,p)>0);
 if(!p)throw new Error('Нет доступных занятий. Сначала добавьте клиенту пакет.');
 Object.assign(x,{status:'done',packageId:p.id,exercises,note});
}
export function payment(s,packageId,amount,method,date){
 const p=s.packages.find(x=>x.id===packageId);
 if(!p||!integer(amount,1,1e8))throw new Error('Введите целую положительную сумму в рублях.');
 if(amount>p.price-paid(s,p))throw new Error('Сумма больше остатка к оплате по пакету.');
 s.payments.push({id:id(),packageId,amount,method,date});
}
export function convert(s,leadId){
 const l=s.leads.find(x=>x.id===leadId);
 if(!l)throw new Error('Заявка не найдена.');
 if(l.clientId)return l.clientId;
 const c={id:id(),name:l.name,goal:l.goal,contact:l.contact,note:'',status:'active'};
 s.clients.push(c);l.stage='won';l.clientId=c.id;return c.id;
}
export function seed(){
 const s={version:1,revision:0,clients:[],packages:[],payments:[],sessions:[],leads:[],tasks:[],audit:[]};
 const names=['Анна Миронова','Михаил Орлов','Софья Белова','Алексей Волков','Дарья Соколова','Илья Лебедев'];
 const goals=['Сила и уверенность','Подготовка к полумарафону','Регулярные тренировки','Силовая подготовка','Общая физическая форма','Набор мышечной массы'];
 names.forEach((name,i)=>{
  const c={id:'c'+i,name,goal:goals[i],contact:'',note:i===0?'Предпочитает утренние занятия. На следующей неделе обсудить новый цикл.':'',status:i===5?'paused':'active'};
  s.clients.push(c);const p={id:'p'+i,clientId:c.id,count:i===0?4:8,price:i===0?12000:24000,date:'2026-09-01'};s.packages.push(p);
  s.payments.push({id:'pay'+i,packageId:p.id,amount:i===3?12000:p.price,method:'Перевод',date:'2026-09-01'});
  const used=i===0?3:i===2?6:2;
  for(let n=0;n<used;n++)s.sessions.push({id:'old'+i+'-'+n,clientId:c.id,start:`2026-09-${String(8+n*3).padStart(2,'0')}T${String(8+i).padStart(2,'0')}:00`,duration:60,type:'Силовая',status:'done',packageId:p.id,note:'',exercises:[{name:'Приседания',sets:3,reps:10,weight:20+n*5},{name:'Тяга блока',sets:3,reps:12,weight:25+n*2.5}]});
 });
 [['c0','09:00','Силовая'],['c1','11:00','Функциональная'],['c2','14:00','Силовая'],['c3','17:00','Силовая']].forEach(([clientId,t,type],i)=>s.sessions.push({id:'today'+i,clientId,start:DAY+'T'+t,duration:60,type,status:'planned',packageId:null,exercises:[],note:''}));
 s.sessions.push({id:'tomorrow',clientId:'c4',start:'2026-10-02T10:00',duration:60,type:'Функциональная',status:'planned',packageId:null,exercises:[],note:''});
 ['Полина','Денис','Екатерина','Роман'].forEach((name,i)=>s.leads.push({id:'l'+i,name,contact:'',goal:['Хочу тренироваться регулярно','Подготовка к забегу','Стать сильнее','Персональные занятия'][i],source:['Рекомендация','Соцсети','Рекомендация','Сайт'][i],stage:['new','contact','trial','new'][i],date:DAY,clientId:null}));
 s.tasks.push({id:'t0',clientId:'c0',text:'Обсудить продление и цели нового цикла',date:DAY,done:false},{id:'t1',clientId:'c3',text:'Уточнить оплату второй части пакета',date:DAY,done:false},{id:'t2',clientId:null,text:'Связаться с Полиной по новой заявке',date:DAY,done:false});
 return validate(s);
}
