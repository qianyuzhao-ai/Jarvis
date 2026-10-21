// Run after the figma-use binding helper. Only touches Components.
await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('2:104'));
const page = figma.currentPage;
const names = ['Jarvis / Chat V1 / Message', 'Jarvis / Chat V1 / Composer', 'Jarvis / Relay V1 / Connection status'];
if (names.some(name => page.children.some(n => n.name === name))) throw new Error('V1 components already exist; inspect before resuming');
const vars = await figma.variables.getLocalVariablesAsync();
const tokens = Object.fromEntries(vars.map(v => [v.name, v]));
const styles = await figma.getLocalTextStylesAsync();
for (const font of [{family:'Noto Sans SC',style:'Regular'},{family:'Noto Sans SC',style:'Medium'}]) await figma.loadFontAsync(font);
for (const id of ['121:4335','121:4370','121:4405']) {
  const source = await figma.getNodeByIdAsync(id);
  for (const n of source.findAllWithCriteria({types:['TEXT']})) for (const s of n.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(s.fontName);
}
const created = [];
function track(n) { created.push(n.id); return n; }
function color(n, key, field='fills') { n[field] = [figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}}, 'color', tokens[key])]; }
function stack(parent,name,dir='VERTICAL',width=620) { const n=track(figma.createAutoLayout(dir)); n.name=name; n.fills=[]; n.resize(width,40); n.primaryAxisSizingMode='AUTO'; n.counterAxisSizingMode='FIXED'; n.itemSpacing=8; parent.appendChild(n); return n; }
async function text(parent,name,value,width=588,size=15,key='color/text',weight='Regular') { const n=track(figma.createText()); n.name=name; n.fontName={family:'Noto Sans SC',style:weight}; await n.setTextStyleIdAsync(styles.find(s=>s.name===(size<=12?'Jarvis/caption':weight==='Medium'?'Jarvis/label':'Jarvis/body')).id); n.fontSize=size; n.lineHeight={unit:'PIXELS',value:size<=12?18:25}; n.characters=value; n.resize(width,25); n.textAutoResize='HEIGHT'; parent.appendChild(n); color(n,key); return n; }
const messageSpecs = [
  ['User','Complete','你','帮我梳理一下本周的工作重点。',420],
  ['Assistant','Complete','Jarvis','可以。把本周的任务贴在这里，我会帮你整理：\n目标与优先级、关键依赖，以及下一步行动。',620],
  ['Assistant','Waiting','Jarvis · 等待回复','正在等待模型回复…',620],
  ['Assistant','Streaming','Jarvis · 正在回复','先把任务分成三类：\n必须完成的交付、需要推进的事项，以及可以延后的工作。▍',620],
  ['Assistant','Stopped','Jarvis · 已停止','先把任务分成三类：\n必须完成的交付、需要推进的事项。',620],
  ['Assistant','Error','Jarvis · 回复中断','已收到的内容会保留。\n连接中断，请检查中转站后重新发送。',620],
];
const variants=[];
for (const [role,state,label,body,w] of messageSpecs) {
  const f=stack(page,`Role=${role}, State=${state}`,'VERTICAL',w);
  const meta=await text(f,'Speaker',label,w,12,'color/secondary','Medium');
  if(role==='User') meta.textAlignHorizontal='RIGHT';
  const b=stack(f,'Bubble','VERTICAL',w); b.paddingTop=14; b.paddingBottom=14; b.paddingLeft=18; b.paddingRight=18; b.cornerRadius=16;
  color(b,role==='User'?'color/selected':'color/soft');
  await bindVariablesToComponent(b,{paddingLeft:tokens['space/16'].id,paddingRight:tokens['space/16'].id,paddingTop:tokens['space/12'].id,paddingBottom:tokens['space/12'].id,itemSpacing:tokens['space/8'].id});
  const bodyText=await text(b,'Body',body,w-32,15,state==='Waiting'?'color/secondary':'color/text'); bodyText.layoutSizingHorizontal='FILL';
  if(state==='Error') { const err=await text(b,'Failure action','重新发送',w-32,13,'color/accentText','Medium'); err.name='Retry'; }
  if(state==='Stopped') await text(b,'Stopped note','部分回复已保留',w-32,12,'color/secondary');
  const comp=track(figma.createComponentFromNode(f)); variants.push(comp);
}
const bubbleSet=track(figma.combineAsVariants(variants,page)); bubbleSet.name=names[0]; bubbleSet.description='首页 Chat V1；用户右对齐，Agent 左对齐。等待、增量输出、完成、停止和中断状态。文字为示例，流式内容通过同一气泡追加。';
bubbleSet.x=30000; bubbleSet.y=0;
variants.forEach((n,i)=>{n.x=(i%2)*700+24;n.y=Math.floor(i/2)*240+24;}); bubbleSet.resize(1400,750);
const bodyProp=bubbleSet.addComponentProperty('Body','TEXT','消息内容');
const speakerProp=bubbleSet.addComponentProperty('Speaker','TEXT','Jarvis');
for(const v of variants){v.findOne(n=>n.type==='TEXT'&&n.name==='Body').componentPropertyReferences={characters:bodyProp};v.findOne(n=>n.type==='TEXT'&&n.name==='Speaker').componentPropertyReferences={characters:speakerProp};}
const composerVariants=[];
for (const [state,sourceId] of [['Empty','121:4335'],['Ready','121:4370'],['Running','121:4405'],['Unconfigured','121:4335']]) {
  const c=track((await figma.getNodeByIdAsync(sourceId)).clone()); page.appendChild(c); c.name=`State=${state}`;
  for(const n of c.findAll(n=>['添加附件','Agent 权限','语音输入'].includes(n.name))) n.visible=false;
  const model=c.findOne(n=>n.name==='模型与思考强度');
  for(const n of model.children) if(n.type==='TEXT') { if(n.characters==='中') n.visible=false; else n.characters=state==='Unconfigured'?'先配置模型':'deepseek-chat'; }
  const p=c.findOne(n=>n.type==='TEXT'&&n.name==='Prompt'); p.characters=state==='Ready'?'帮我梳理一下本周的工作重点。':state==='Running'?'正在回复，可随时停止':state==='Unconfigured'?'连接中转站后开始对话':'和 Jarvis 一起工作';
  composerVariants.push(c);
}
const composerSet=track(figma.combineAsVariants(composerVariants,page)); composerSet.name=names[1]; composerSet.description='V1 仅首页文字聊天。保留上下文圆环、模型、发送/停止。无附件、语音或工具权限入口。'; composerSet.x=30000; composerSet.y=900;
composerVariants.forEach((n,i)=>{n.x=24;n.y=24+i*180;});composerSet.resize(836,750);
const statuses=[];
for(const [state,label,iconId] of [['Untested','尚未测试当前配置','26:395'],['Testing','正在测试流式连接…','107:3883'],['Success','连接成功 · 已收到流式回复','107:3886'],['Error','认证失败（401），请检查 API Key','107:3889']]){
  const f=stack(page,`State=${state}`,'HORIZONTAL',620); f.counterAxisAlignItems='CENTER'; f.itemSpacing=8;
  const icon=track((await figma.getNodeByIdAsync(iconId)).createInstance());f.appendChild(icon);icon.resize(16,16);
  await text(f,'Status label',label,590,13,state==='Success'?'color/accentText':state==='Error'?'color/text':'color/secondary');
  statuses.push(track(figma.createComponentFromNode(f)));
}
const statusSet=track(figma.combineAsVariants(statuses,page));statusSet.name=names[2];statusSet.description='中转站连接反馈。测试配置不自动保存；改动地址、协议、Key 或模型后恢复未测试。'; statusSet.x=31500;statusSet.y=900; statuses.forEach((n,i)=>{n.x=24;n.y=24+i*70;});statusSet.resize(680,330);
return {createdNodeIds:created,components:{messages:bubbleSet.id,messageVariants:variants.map((n,i)=>({id:n.id,role:messageSpecs[i][0],state:messageSpecs[i][1],w:n.width,h:n.height})),composer:composerSet.id,composerVariants:composerVariants.map(n=>({id:n.id,name:n.name})),status:statusSet.id,statusVariants:statuses.map(n=>({id:n.id,name:n.name}))},verified:{themeBindings:true,font:'Noto Sans SC',editable:true}};
