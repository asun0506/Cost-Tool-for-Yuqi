const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const {webcrypto}=require('crypto');
const {TextEncoder,TextDecoder}=require('util');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const ctx=vm.createContext({TextEncoder,TextDecoder,crypto:webcrypto,console,Date,Intl,Map,Set,Uint8Array,ArrayBuffer,btoa,atob});
vm.runInContext(script+'\nglobalThis.api={dashboardForecast,syncChangeVariantRows,reviewData,renderOverview,deriveChangeStatus,changeDraftStatus,updateChangeFormAutoStatus,changeProgress,changeCostBomEntry,changePriceIsIncluded,buildChangeRecord,readMeetingScreenshot,changeAuditCopy,changeDialog,renderChanges,weeklyReport,renderReportPreview,saveChangeForm,selectEffectivePrice,summarizeVariant,reviewData,renderWeeklyVariantChanges,setState:value=>{appState=value;},setHooks:()=>{commitMutation=async(options,apply)=>{globalThis.lastEvent=options;apply();};closeDialog=()=>{};render=()=>{};showToast=message=>{globalThis.lastToast=message;};},captureDialog:()=>{openDialog=(title,body)=>{globalThis.dialogTitle=title;globalThis.dialogHtml=body;};}};',ctx);
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
 let r=api.buildChangeRecord(project,f(),null,null,at);assert.strictEqual(r.change.priceMeaning,'delta');assert.strictEqual(r.change.items[0].variantPrices.high.quantity,null);project.changes.push(r.change);
 const base=api.summarizeVariant(project,'high').current;
 assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,5);assert.strictEqual(api.dashboardForecast(project,'high').current,base+5);
 assert.strictEqual(api.dashboardForecast(project,'mid').pendingDelta,1.89);
 assert.strictEqual(api.dashboardForecast(project,'low').pendingDelta,0);
 r.change.items[0].variantPrices.high.finalPrice=null;assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,8);
 r.change.items[0].variantPrices.high.finalPrice=-3;assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-3);
 r.change.meeting.date='';assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,0);
 project=fixture();
 r=api.buildChangeRecord(project,f({budgetBasis:'unit','partNumber:item1':'0001','finalPrice:item1:high':'-5'}),null,null,at);project.changes.push(r.change);
 assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-10);
 const two=api.buildChangeRecord(project,f({budgetBasis:'unit','partNumber:item1':'0001','finalPrice:item1:high':'3'}),null,null,at);project.changes.push(two.change);
 assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,-4,'separate changes are incremental deltas');
 project=fixture();
 r=api.buildChangeRecord(project,f({costBomEntry:'yes','partNumber:item1':'0001'}),null,null,at);
 assert.strictEqual(r.priceRecords[0].amount,102.5,'vehicle delta 5 divided by BOM quantity 2');
 assert.strictEqual(r.priceRecords[0].baseAmount,100);assert.strictEqual(r.priceRecords[0].deltaAmount,5);assert.strictEqual(r.pendingPairs,0);
 project.changes.push(r.change);project.prices.push(...r.priceRecords);
 assert.strictEqual(api.dashboardForecast(project,'high').current,205);assert.strictEqual(api.dashboardForecast(project,'high').pendingDelta,0,'no double counting after actual posting');
 let updated=api.buildChangeRecord(project,f({costBomEntry:'yes','partNumber:item1':'0001'}),r.change,null,at);assert.strictEqual(updated.priceRecords.length,0,'resaving must not reapply delta');
 updated=api.buildChangeRecord(project,f({costBomEntry:'yes','partNumber:item1':'0001','finalPrice:item1:high':'3'}),r.change,null,at);assert.strictEqual(updated.priceRecords[0].amount,101.5,'editing delta uses fixed original baseline');
 project=fixture();
 r=api.buildChangeRecord(project,f({budgetBasis:'unit',costBomEntry:'yes','partNumber:item1':'0001','finalPrice:item1:high':'-5'}),null,null,at);assert.strictEqual(r.priceRecords[0].amount,95);
 assert.throws(()=>api.buildChangeRecord(project,f({budgetBasis:'unit',costBomEntry:'yes','partNumber:item1':'0001','finalPrice:item1:high':'-500'}),null,null,at),/不能为负数/);
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


 project=fixture();api.captureDialog();ctx.document={querySelector:selector=>selector==='#dialog'?{classList:{add:()=>{}}}:null};api.changeDialog();
 assert(!ctx.dialogHtml.includes('beforePrice:'));assert(!ctx.dialogHtml.includes('变更前单价'));
 assert(ctx.dialogHtml.includes('落地价差Δ') && ctx.dialogHtml.includes('上会预算Δ'));

 const quantityInput={disabled:false,hasAttribute:name=>name==='data-change-quantity'};
 const priceInput={disabled:false,hasAttribute:()=>false};
 const wrapper={hidden:false}, budgetLabel={textContent:''},finalLabel={textContent:''},applies={checked:true};
 const row={dataset:{variant:'high'},hidden:false,querySelector:selector=>({'[data-change-item-applies]':applies,'[data-change-quantity-field]':wrapper,'[data-change-budget-label]':budgetLabel,'[data-change-final-label]':finalLabel}[selector]),querySelectorAll:()=>[quantityInput,priceInput]};
 const testForm={elements:{budgetBasis:{value:'vehicleDelta'}},querySelector:()=>null,querySelectorAll:selector=>selector==='[data-change-variant]:checked'?[{value:'high'}]:[row]};
 ctx.document={querySelector:selector=>selector==='#changeForm'?testForm:null};
 api.syncChangeVariantRows();assert(wrapper.hidden && quantityInput.disabled);assert(!priceInput.disabled);assert(finalLabel.textContent.includes('元/车'));
 testForm.elements.budgetBasis.value='unit';api.syncChangeVariantRows();assert(!wrapper.hidden && !quantityInput.disabled);assert(finalLabel.textContent.includes('元/件'));
 console.log('Delta checks passed: direct vehicle deltas without baseline/quantity, unit delta quantities, signed deltas, per-configuration scope, actual BOM conversion, repeat-save idempotence and edits.');
})().catch(error=>{console.error(error);process.exitCode=1;});
