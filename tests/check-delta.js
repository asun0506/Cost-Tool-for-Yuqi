const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const {webcrypto}=require('crypto');
const {TextEncoder,TextDecoder}=require('util');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const ctx=vm.createContext({TextEncoder,TextDecoder,crypto:webcrypto,console,Date,Intl,Map,Set,Uint8Array,ArrayBuffer,btoa,atob});
vm.runInContext(script+'\nglobalThis.api={dashboardForecast,syncChangeVariantRows,updateChangePartMatch,reviewData,renderOverview,deriveChangeStatus,changeDraftStatus,updateChangeFormAutoStatus,changeProgress,changeCostBomEntry,changePriceIsIncluded,buildChangeRecord,readMeetingScreenshot,changeAuditCopy,changeDialog,renderChanges,weeklyReport,renderReportPreview,saveChangeForm,selectEffectivePrice,summarizeVariant,reviewData,renderWeeklyVariantChanges,setState:value=>{appState=value;},setHooks:()=>{commitMutation=async(options,apply)=>{globalThis.lastEvent=options;apply();};closeDialog=()=>{};render=()=>{};showToast=message=>{globalThis.lastToast=message;};},captureDialog:()=>{openDialog=(title,body)=>{globalThis.dialogTitle=title;globalThis.dialogHtml=body;};}};',ctx);
const api=ctx.api;

function fixture(){
  const project={id:'p',name:'测试车型',variants:[{id:'high',name:'高配'},{id:'mid',name:'中配'},{id:'low',name:'低配'}],occurrences:[{partNumber:'0001',name:'前减振器',sourceRow:'1',variantQuantities:{high:2,mid:1,low:1}}],imports:[{importId:'e1',versionLabel:'EBOM V1',snapshot:[{partNumber:'0001'}]}],prices:[{recordId:'base',partNumber:'0001',variantId:null,stage:'nomination',status:'formal',amount:100,effectiveAt:'2026-10-01',recordedAt:'2026-10-01T08:00:00.000Z'}],attributes:{},changes:[],risks:[],freezes:[],reports:[]};
  project.imports[0].snapshot=JSON.parse(JSON.stringify(project.occurrences));
  api.setState({projects:[project],activeProjectId:'p',partMaster:{},settings:{thresholds:{}},auditEvents:[]});
  return project;
}
function form(overrides={}){
  const values={category:'engineering',costBomEntry:'no',costBomRemark:'暂不纳入',budgetBasis:'unit',date:'2026-11-02',reason:'结构调整',meetingName:'成本决策会',meetingDate:'2026-11-01',variantIds:['high','mid'],itemIds:['item1'],'partName:item1':'减振器别名','partNumber:item1':'0001','applies:item1:high':'1','budget:item1:high':'102','finalPrice:item1:high':'105','applies:item1:mid':'1','budget:item1:mid':'108','finalPrice:item1:mid':'110',...overrides};
  return {get:key=>Array.isArray(values[key])?values[key][0]:values[key]??null,getAll:key=>values[key]==null?[]:Array.isArray(values[key])?values[key]:[values[key]],has:key=>values[key]!=null};
}
const at='2026-11-02T10:00:00.000Z';


(async()=>{
 let project=fixture();
 const f=(x={})=>form({budgetBasis:'vehicleDelta',costBomEntry:'no','partNumber:item1':'','budget:item1:high':'8','finalPrice:item1:high':'5','budget:item1:mid':'2','finalPrice:item1:mid':'1.89',...x});
 const otherCategory=api.buildChangeRecord(project,f({category:'other'}),null,null,at);assert.strictEqual(otherCategory.change.category,'other');
 const domainRecord=api.buildChangeRecord(project,f({'category1:item1':'底盘','category2:item1':'车架'}),null,null,at);assert.strictEqual(domainRecord.change.items[0].category1,'底盘');assert.strictEqual(domainRecord.change.items[0].category2,'车架');
 const combinedMeeting=api.buildChangeRecord(project,f({decisionMeeting:'2026/10/26 产品决策会'}),null,null,at);
 assert.strictEqual(combinedMeeting.change.meeting.name,'产品决策会');assert.strictEqual(combinedMeeting.change.meeting.date,'2026-10-26');
 assert.strictEqual(combinedMeeting.change.date,'2026-11-02','Change date remains the independent dashboard period date');
 assert.strictEqual(api.changeDraftStatus(f({decisionMeeting:'2026/10/26 产品决策会'})),api.changeDraftStatus(f()),'Combined meeting preserves automatic status');
 assert.throws(()=>api.buildChangeRecord(project,f({decisionMeeting:'2026/02/30 产品决策会'}),null,null,at),/会议日期/);
 let r=api.buildChangeRecord(project,f(),null,null,at);assert.strictEqual(r.change.priceMeaning,'delta');assert.strictEqual(r.change.items[0].variantPrices.high.quantity,null);project.changes.push(r.change);
 const base=api.summarizeVariant(project,'high').current;
 assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,5);assert.strictEqual(api.dashboardForecast(project,'high').current,base+5);
 assert.strictEqual(api.dashboardForecast(project,'mid').pendingDelta,1.89);
 assert.strictEqual(api.dashboardForecast(project,'low').pendingDelta,0);
 r.change.items[0].variantPrices.high.finalPrice=null;assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,8);
 r.change.items[0].variantPrices.high.finalPrice=-3;assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-3);
 r.change.meeting.date='';assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-3,'Explicit not-in-BOM state uses the available delta without requiring a meeting');
 project=fixture();
 r=api.buildChangeRecord(project,f({budgetBasis:'unit','partNumber:item1':'0001','finalPrice:item1:high':'-5'}),null,null,at);project.changes.push(r.change);
 assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-10);
 const two=api.buildChangeRecord(project,f({budgetBasis:'unit','partNumber:item1':'0001','finalPrice:item1:high':'3'}),null,null,at);project.changes.push(two.change);
 assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-4,'separate changes are incremental deltas');
 project=fixture();
 r=api.buildChangeRecord(project,f({costBomEntry:'yes','partNumber:item1':'0001'}),null,null,at);
 assert.strictEqual(r.priceRecords.length,0,'Marking already included must never write a price');
 const originalPrices=JSON.stringify(project.prices);project.changes.push(r.change);
 assert.strictEqual(api.dashboardForecast(project,'high').current,200);assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,0);
 let updated=api.buildChangeRecord(project,f({costBomEntry:'yes','partNumber:item1':'0001','finalPrice:item1:high':'3'}),r.change,null,at);assert.strictEqual(updated.priceRecords.length,0);
 assert.strictEqual(JSON.stringify(project.prices),originalPrices,'Editing an included change preserves the BOM baseline');
 updated=api.buildChangeRecord(project,f({costBomEntry:'no','partNumber:item1':'0001'}),r.change,null,at);project.changes=[updated.change];assert.strictEqual(api.dashboardForecast(project,'high').current,205,'Switching to not included adds the delta');
 project=fixture();
 r=api.buildChangeRecord(project,f({budgetBasis:'unit',costBomEntry:'yes','partNumber:item1':'0001','finalPrice:item1:high':'-500'}),null,null,at);assert.strictEqual(r.priceRecords.length,0,'An included delta is historical and must not adjust or validate a new BOM amount');
 r=api.buildChangeRecord(project,f({budgetBasis:'unit','quantity:item1:high':'2'}),null,null,at);project.changes.push(r.change);assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,10);
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,1,2]);
  const screenshot=await api.readMeetingScreenshot({name:'纪要.png',size:bytes.length,arrayBuffer:async()=>bytes.buffer},null);
  assert(screenshot.dataUrl.startsWith('data:image/png;base64,'));
  assert.strictEqual(api.changeAuditCopy({meeting:{screenshot}}).meeting.screenshot.dataUrl,undefined);
  await assert.rejects(()=>api.readMeetingScreenshot({name:'bad.svg',size:5,arrayBuffer:async()=>Uint8Array.from([60,115,118,103,62]).buffer},null),/PNG、JPEG 或 WebP/);

  project=fixture();api.setHooks();
  await Promise.all([api.saveChangeForm(form({costBomEntry:'no'})),api.saveChangeForm(form({costBomEntry:'no'}))]);
  assert.strictEqual(project.changes.length,1,'double submit must not duplicate records');
  assert.strictEqual(project.prices.length,1);
  assert.strictEqual(ctx.lastEvent.after.change.costBomEntry,false);


 project=fixture();project.attributes['0001']={category1:'底盘',category2:'车架'};api.captureDialog();ctx.document={querySelector:selector=>selector==='#dialog'?{classList:{add:()=>{}}}:null};api.changeDialog();
 assert(ctx.dialogHtml.includes('<option value="other">其他</option>'),'Other is selectable');
 assert(ctx.dialogHtml.includes('决策会议') && ctx.dialogHtml.includes('例如：2026/10/26 产品决策会'));assert(!ctx.dialogHtml.includes('name="meetingDate"'));assert(ctx.dialogHtml.includes('用于 last stage 到 current stage'));
 assert(ctx.dialogHtml.includes('是否已进入 Cost BOM'));assert(!ctx.dialogHtml.includes('是否进入 Cost BOM'));assert(!ctx.dialogHtml.includes('beforePrice:'));assert(!ctx.dialogHtml.includes('变更前单价'));
 assert(ctx.dialogHtml.includes('data-change-domain="category1"') && ctx.dialogHtml.includes('data-change-domain="category2"'));assert(ctx.dialogHtml.includes('value="底盘"') && ctx.dialogHtml.includes('value="车架"'));
 assert(ctx.dialogHtml.includes('落地价差Δ') && ctx.dialogHtml.includes('上会预算Δ'));
 assert(ctx.dialogHtml.includes('成本变更说明') && ctx.dialogHtml.includes('placeholder="例如：全系车架：重量增加XXg"'));
 assert(ctx.dialogHtml.indexOf('车型配置（多选）')<ctx.dialogHtml.indexOf('金额口径'),'Configuration selection comes first in the cost panel');
 assert(ctx.dialogHtml.indexOf('金额口径')<ctx.dialogHtml.indexOf('零件与价格'),'Cost fields follow configuration selection');
 assert(ctx.dialogHtml.includes('change-meeting-row'),'Meeting input and attachment share an aligned row');
 assert(!/placeholder="如[：:\s]/.test(ctx.dialogHtml),'Example placeholders consistently use 例如');

 const quantityInput={disabled:false,value:'',readOnly:false,dataset:{}};
 const priceInput={disabled:false};
 const wrapper={hidden:false,dataset:{variant:'high'}},budgetLabel={textContent:''},finalLabel={textContent:''},applies={disabled:false};
 const row={dataset:{variant:'high'},hidden:false,querySelector:selector=>({'[data-change-item-applies]':applies,'[data-change-budget-label]':budgetLabel,'[data-change-final-label]':finalLabel}[selector]),querySelectorAll:()=>[priceInput]};
 const quantityItem={dataset:{variant:'high'},hidden:false,querySelector:()=>quantityInput};
 let selected=true;
 const testForm={elements:{budgetBasis:{value:'vehicleDelta'}},querySelector:()=>null,querySelectorAll:selector=>({'[data-change-variant]:checked':selected?[{value:'high'}]:[],'[data-change-variant-row]':[row],'[data-change-quantity-field]':[wrapper],'[data-change-quantity-item]':[quantityItem]}[selector]||[])};
 ctx.document={querySelector:selector=>selector==='#changeForm'?testForm:null};
 api.syncChangeVariantRows();assert(wrapper.hidden && quantityInput.disabled);assert(!priceInput.disabled);assert(finalLabel.textContent.includes('元/车'));
 testForm.elements.budgetBasis.value='unit';api.syncChangeVariantRows();assert(!wrapper.hidden && !quantityInput.disabled);assert(finalLabel.textContent.includes('元/件'));
 selected=false;api.syncChangeVariantRows();assert(row.hidden && priceInput.disabled && applies.disabled && quantityInput.disabled,'Top-level configuration controls all part price and quantity inputs');
 selected=true;api.syncChangeVariantRows();assert(!row.hidden && !priceInput.disabled && !applies.disabled && !quantityInput.disabled);
 const domain1={value:'',dataset:{}},domain2={value:'',dataset:{}};
 const matchedName={value:'',dataset:{}},matchHint={textContent:''};
 const entry={querySelector:selector=>({'[data-change-match]':matchHint,'[data-change-part-name]':matchedName,'[data-change-domain="category1"]':domain1,'[data-change-domain="category2"]':domain2}[selector]),querySelectorAll:()=>[quantityItem]};
 const numberInput={value:'0001',closest:()=>entry};
 api.updateChangePartMatch(numberInput,true);assert.strictEqual(matchedName.value,'前减振器');assert.strictEqual(quantityInput.value,2);assert.strictEqual(domain1.value,'底盘');assert.strictEqual(domain2.value,'车架');assert(quantityInput.readOnly);
 numberInput.value='missing';api.updateChangePartMatch(numberInput,true);assert.strictEqual(quantityInput.value,'');assert(!quantityInput.readOnly,'Unmatched parts allow manual quantities');
 assert(!ctx.dialogHtml.includes('type="checkbox" name="applies:'),'Configuration checkboxes appear only at the top');
 assert(ctx.dialogHtml.includes('change-metadata-row') && ctx.dialogHtml.includes('change-bom-row') && ctx.dialogHtml.includes('change-part-fields'));
 console.log('Delta checks passed: direct vehicle deltas without baseline/quantity, unit delta quantities, signed deltas, per-configuration scope, inclusion flags without BOM writes, repeat-save idempotence and edits.');
})().catch(error=>{console.error(error);process.exitCode=1;});
