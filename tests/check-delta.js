const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const {webcrypto}=require('crypto');
const {TextEncoder,TextDecoder}=require('util');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const ctx=vm.createContext({TextEncoder,TextDecoder,crypto:webcrypto,console,Date,Intl,Map,Set,Uint8Array,ArrayBuffer,btoa,atob});
vm.runInContext(script+'\nglobalThis.api={dashboardForecast,changeSummaryAmount,changeVariance,changeVarianceSummary,changeOverBudgetRate,renderChangeImpact,updateChangeStatus,syncChangeVariantRows,updateChangePartMatch,reviewData,renderOverview,deriveChangeStatus,changeDraftStatus,updateChangeFormAutoStatus,changeProgress,changeCostBomEntry,changePriceIsIncluded,buildChangeRecord,readMeetingScreenshot,changeAuditCopy,changeDialog,renderChanges,weeklyReport,renderReportPreview,saveChangeForm,selectEffectivePrice,summarizeVariant,reviewData,renderWeeklyVariantChanges,setState:value=>{appState=value;},setHooks:()=>{commitMutation=async(options,apply)=>{globalThis.lastEvent=options;apply();};closeDialog=()=>{};render=()=>{};showToast=message=>{globalThis.lastToast=message;};},captureDialog:()=>{openDialog=(title,body)=>{globalThis.dialogTitle=title;globalThis.dialogHtml=body;};}};',ctx);
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
 const zeroDelta={date:'2026-11-02',budgetBasis:'unit',costBomEntry:false,variantIds:['mid'],items:[{partName:'未匹配零件',partNumber:'',variantPrices:{mid:{budget:0,finalPrice:0,quantity:null}}}]};
 const otherDelta={date:'2026-11-02',budgetBasis:'vehicleDelta',costBomEntry:false,variantIds:['mid'],items:[{partName:'另一零件',partNumber:'',variantPrices:{mid:{budget:1.89,finalPrice:1.27,quantity:null}}}]};
 assert.strictEqual(api.changeSummaryAmount(project,'mid',[zeroDelta,otherDelta]),1.27,'Zero unit delta needs no quantity for the summary');
 project.changes=[zeroDelta,otherDelta];assert.strictEqual(api.dashboardForecast(project,'mid').pendingDelta,1.27);assert.strictEqual(api.dashboardForecast(project,'mid').forecastIssues.length,0);
 zeroDelta.items[0].variantPrices.mid.finalPrice=2;assert.strictEqual(api.changeSummaryAmount(project,'mid',[zeroDelta,otherDelta]),null,'A nonzero unit delta still requires a quantity');
 zeroDelta.items[0].variantPrices.mid.finalPrice=null;zeroDelta.items[0].variantPrices.mid.budget=null;assert.strictEqual(api.changeSummaryAmount(project,'mid',[zeroDelta,otherDelta]),null,'A missing delta remains unknown');
 project=fixture();
 const multi={date:'2026-11-02',budgetBasis:'unit',costBomEntry:false,variantIds:['high','mid'],meeting:{name:'决策会',date:'2026-11-02'},items:[
  {partName:'组合开关',partNumber:'',variantPrices:{high:{budget:8,finalPrice:7,quantity:1},mid:{budget:null,finalPrice:null,quantity:null}}},
  {partName:'座椅控制器',partNumber:'',variantPrices:{high:{budget:1.89,finalPrice:1.27,quantity:1},mid:{budget:1.89,finalPrice:1.27,quantity:1}}}
 ]};
 project.changes=[multi];
 assert.strictEqual(api.changeVariance(project,multi,'high').text,'—','A total below budget is not an overrun');
 const varianceFixture={budgetBasis:'vehicleDelta',variantIds:['high'],items:[{variantPrices:{high:{budget:80,finalPrice:128}}}]};
 assert.strictEqual(api.changeVariance(project,varianceFixture,'high').text,'60%');
 assert.strictEqual(api.changeVariance(project,varianceFixture,'high').overLimit,true);
 varianceFixture.items[0].variantPrices.high.finalPrice=88;assert.strictEqual(api.changeVariance(project,varianceFixture,'high').overLimit,false,'Exactly 10% is not red');
 varianceFixture.items[0].variantPrices.high.finalPrice=null;assert.strictEqual(api.changeVariance(project,varianceFixture,'high').text,'待谈价');
 varianceFixture.items[0].variantPrices.high={budget:0,finalPrice:1};assert.strictEqual(api.changeVariance(project,varianceFixture,'high').text,'无法计算');
 const summaryFixture={budgetBasis:'vehicleDelta',variantIds:['high','mid','low'],items:[{variantPrices:{high:{budget:100,finalPrice:108},mid:{budget:100,finalPrice:120},low:{budget:100,finalPrice:null}}}]};
 let varianceSummary=api.changeVarianceSummary(project,summaryFixture);assert.strictEqual(varianceSummary.text,'超差20%');assert.strictEqual(varianceSummary.tone,'is-over-limit','Highest overrun outranks pending prices');
 summaryFixture.items[0].variantPrices.mid.finalPrice=95;varianceSummary=api.changeVarianceSummary(project,summaryFixture);assert.strictEqual(varianceSummary.text,'超差8%');assert.strictEqual(varianceSummary.tone,'','Overrun under threshold outranks pending prices without red');
 summaryFixture.items[0].variantPrices.high.finalPrice=95;varianceSummary=api.changeVarianceSummary(project,summaryFixture);assert.strictEqual(varianceSummary.text,'无实际价格');assert.strictEqual(varianceSummary.tone,'');
 summaryFixture.items[0].variantPrices.low.finalPrice=100;varianceSummary=api.changeVarianceSummary(project,summaryFixture);assert.strictEqual(varianceSummary.text,'未超预算');assert.strictEqual(varianceSummary.tone,'');
 summaryFixture.items[0].variantPrices.low={budget:0,finalPrice:1};varianceSummary=api.changeVarianceSummary(project,summaryFixture);assert.strictEqual(varianceSummary.text,'无法计算','Unknown budget must not be displayed as no overrun');
 assert.strictEqual(api.changeOverBudgetRate(multi,{budget:80,finalPrice:128}),'+60.0%');
 assert.strictEqual(api.changeOverBudgetRate(multi,{budget:25,finalPrice:20}),'-20.0%');
 assert.strictEqual(api.changeOverBudgetRate(multi,{budget:-10,finalPrice:-5}),'+50.0%');
 assert.strictEqual(api.changeOverBudgetRate(multi,{budget:0,finalPrice:5}),'—');
 assert.strictEqual(api.changeOverBudgetRate(multi,{budget:5,finalPrice:null}),'待落地');
 assert.strictEqual(api.changeOverBudgetRate(multi,{budget:null,finalPrice:null}),'—');
 const impact=api.renderChangeImpact(multi,[
  {variant:{name:'高配'},price:{budget:80,finalPrice:128}},
  {variant:{name:'中配'},price:{budget:80,finalPrice:128}},
  {variant:{name:'低配'},price:{budget:25,finalPrice:20}},
  {variant:{name:'无影响'},price:{budget:null,finalPrice:null}}
 ]);
 assert(impact.includes('高配') && impact.includes('中配') && impact.includes('（超差60%）') && impact.includes('change-over-limit'));
 assert(!impact.includes('+60.0%') && !impact.includes('-20.0%') && !impact.includes('无影响'));
 const awaiting=api.renderChangeImpact(multi,[{variant:{name:'高配'},price:null},{variant:{name:'中配'},price:{budget:10,finalPrice:null}}],'negotiating');
 assert(awaiting.includes('（待谈价）') && awaiting.includes('change-await-price') && awaiting.includes('aria-hidden="true"'));
 assert(api.renderChangeImpact(multi,[{variant:{name:'高配'},price:{budget:100,finalPrice:110}}],'landed').includes('change-over-limit'),'10% is highlighted');
 assert(!api.renderChangeImpact(multi,[{variant:{name:'高配'},price:{budget:100,finalPrice:100}}],'landed').includes('超差'),'Zero difference is not labeled');
 assert(!api.renderChangeImpact(multi,[{variant:{name:'高配'},price:{budget:100,finalPrice:90}}],'landed').includes('超差'),'Negative difference is not labeled');
 assert.strictEqual(api.changeSummaryAmount(project,'mid',[multi]),1.27,'Blank part and configuration has no impact');
 assert.strictEqual(api.changeSummaryAmount(project,'high',[multi]),8.27);
 assert.strictEqual(api.dashboardForecast(project,'mid').pendingDelta,1.27);
 assert.strictEqual(api.dashboardForecast(project,'mid').forecastIssues.length,0);
 assert.strictEqual(api.deriveChangeStatus(multi.meeting,multi.items),'landed','Blank unaffected pairs do not block status');
 multi.items[1].variantPrices.mid.finalPrice=null;assert.strictEqual(api.changeSummaryAmount(project,'mid',[multi]),1.89,'Budget is used when final delta is missing');
 assert.strictEqual(api.deriveChangeStatus(multi.meeting,multi.items),'negotiating','A missing final price still means in progress');
 const ledger=api.renderChanges();
 assert(ledger.includes('<th title="按配置汇总各零件后') && ledger.includes('超差情况'),'Variance has its own column');
 assert(ledger.includes('待谈价') && !ledger.includes('推进中'));
 assert(ledger.indexOf('<th>变更描述</th>')<ledger.indexOf('<th>状态</th>'));
 assert(ledger.indexOf('<th>决策会议</th>')<ledger.indexOf('变更金额（元/车）'));
 assert(ledger.includes('<th>零件名称</th>') && ledger.includes('新增变更'));
 assert(ledger.includes('+¥8.27') && ledger.includes('+¥1.89'),'Per-configuration totals sum all affected parts using final or budget');
 assert(ledger.includes('<details class="risk-part-details"><summary>零件明细（2）</summary>') && !ledger.includes('<th title="优先显示落地价差'),'Multi-part prices are collapsed beneath the totals');
 assert(ledger.includes('高配+¥1.27（预算 ¥1.89）') && ledger.includes('中配—（预算 ¥1.89）'),'Part details distinguish final and budget prices without a positive budget sign');
 assert(ledger.includes('--variant-count:3') && ledger.includes('aria-hidden="true"'),'Configuration columns reserve space for unaffected variants');
 assert(!ledger.includes('金额口径：') && !ledger.includes('（超差'),'The register omits unit captions and over-budget labels');
 assert(!ledger.includes('组合开关（未编码）'),'Uncoded parts do not add redundant labels');
 assert(ledger.includes('data-change-status'),'The register allows manual status selection');
 multi.items[1].variantPrices.mid.quantity=null;assert.strictEqual(api.changeSummaryAmount(project,'mid',[multi]),null,'A nonzero delta needs quantity');
 project=fixture();
 const f=(x={})=>form({budgetBasis:'vehicleDelta',costBomEntry:'no','partNumber:item1':'','budget:item1:high':'8','finalPrice:item1:high':'5','budget:item1:mid':'2','finalPrice:item1:mid':'1.89',...x});
 const manual=api.buildChangeRecord(project,f({manualStatus:'pending'}),null,null,at).change;
 assert.strictEqual(api.changeProgress(project,manual),'pending','Manual status overrides automatic status');
 const restoredAuto=api.buildChangeRecord(project,f({manualStatus:''}),manual,null,at).change;
 assert.strictEqual(api.changeProgress(project,restoredAuto),'landed','Clearing manual selection returns to automatic determination');
 project.changes=[manual];api.setHooks();await api.updateChangeStatus(manual.changeId,'negotiating');assert.strictEqual(api.changeProgress(project,manual),'negotiating');assert(ctx.lastEvent.note.includes('状态'));
 await api.updateChangeStatus(manual.changeId,'auto');assert.strictEqual(api.changeProgress(project,manual),'landed');assert.strictEqual(manual.manualStatus,null);
 project=fixture();
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
 assert(ctx.dialogHtml.includes('name="manualStatus"') && ctx.dialogHtml.includes('自动判断'),'Change dialog supports manual or automatic status');
 assert(ctx.dialogHtml.includes('data-change-domain="category1"') && ctx.dialogHtml.includes('data-change-domain="category2"'));assert(ctx.dialogHtml.includes('value="底盘"') && ctx.dialogHtml.includes('value="车架"'));
 assert(ctx.dialogHtml.includes('落地价差Δ') && ctx.dialogHtml.includes('上会预算Δ'));
 assert(ctx.dialogHtml.includes('变更描述') && ctx.dialogHtml.includes('placeholder="例如：全系车架：重量增加XXg"'));
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
