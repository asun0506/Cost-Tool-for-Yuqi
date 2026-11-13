const fs=require('fs'),vm=require('vm'),assert=require('assert');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const ctx=vm.createContext({console,Date,Intl,Map,Set,window:{},TextEncoder,TextDecoder,crypto:require('crypto').webcrypto});
vm.runInContext(script+'\nglobalThis.reviewApi={buildCostReviewItems,buildCostReconciliation,createCostImportPlan,applyCostImportPlan,selectStagePrice,costReviewKey,setState:value=>appState=value};',ctx);
const project={attributes:{A:{category1:'旧领域'}},variants:[{id:'high',name:'高配'}]};
const incoming=[{partNumber:'A',prices:{current:12},category1:'新领域'},{partNumber:'B',prices:{current:7}}];
const reconciliation={unmatched:['B'],cells:[{partNumber:'A',variantId:'high',stage:'current',supplied:true,before:{amount:10}},{partNumber:'B',variantId:'high',stage:'current',supplied:true,before:null}]};
const items=ctx.reviewApi.buildCostReviewItems(project,reconciliation,incoming,{currentPrice:0,category1:1});
assert.strictEqual(items.length,3);assert(items.some(x=>x.kind==='price'&&x.partNumber==='A'&&x.before===10&&x.after===12));assert(items.some(x=>x.kind==='price'&&x.partNumber==='B'&&x.unmatched));assert(items.some(x=>x.kind==='attribute'&&x.before==='旧领域'&&x.after==='新领域'));
const appProject={id:'review',name:'测试',variants:[{id:'high',name:'高配'},{id:'mid',name:'中配'}],imports:[{importId:'e1',versionDate:'2026-01-01',importedAt:'2026-01-01T00:00:00Z',snapshot:[{partNumber:'A',name:'零件A',unit:'PCS',variantQuantities:{high:1,mid:1},fitments:{high:'S',mid:'S'},baseQuantity:1}]}],costImports:[],prices:[{partNumber:'A',variantId:null,stage:'current',status:'formal',amount:10,effectiveAt:'2026-01-01',recordedAt:'2026-01-01T00:00:00Z'}],attributes:{A:{category1:'旧领域'}},changes:[],occurrences:[]};
ctx.reviewApi.setState({activeProjectId:'review',projects:[appProject],partMaster:{},settings:{thresholds:{}}});
const source=[{partNumber:'A',name:'零件A',unit:'PCS',variantQuantities:{high:1,mid:1},fitments:{high:'S',mid:'S'},baseQuantity:1,prices:{current:12},category1:'新领域'},{partNumber:'B',name:'未匹配',unit:'PCS',variantQuantities:{high:1,mid:1},fitments:{high:'S',mid:'S'},baseQuantity:1,prices:{current:7}}];
const mapping={currentPrice:0,category1:1},rec=ctx.reviewApi.buildCostReconciliation(appProject,source,mapping),reviews=ctx.reviewApi.buildCostReviewItems(appProject,rec,source,mapping);
const selections=Object.create(null);selections[ctx.reviewApi.costReviewKey('price','A','current','high')]=true;selections[ctx.reviewApi.costReviewKey('price','B','current','high')]=true;selections[ctx.reviewApi.costReviewKey('attribute','A','category1')]=true;
const pending={versionDate:'2026-02-01',fileName:'test.csv',fileHash:'hash',mapping,costSelections:selections,parsed:{sheets:[{rows:[[]]}]},sheetIndex:0};
const plan=ctx.reviewApi.createCostImportPlan(appProject,{rows:source,errors:[]},pending,'测试版本');
assert.strictEqual(plan.record.resolvedPrices.A.high.current.amount,12);assert.strictEqual(plan.record.resolvedPrices.A.mid.current.amount,10);assert.strictEqual(plan.record.resolvedPrices.B.high.current.amount,7);assert.strictEqual(plan.record.resolvedPrices.B.mid.current.amount,null);assert.strictEqual(plan.attributes.A.category1,'新领域');assert.strictEqual(plan.record.approvedCostChanges.length,3);assert(plan.record.approvedCostChanges.some(x=>x.partNumber==='B'&&x.unmatched));
const blank=source.map(row=>({...row,prices:{...row.prices}}));blank[0].prices.current=null;const blankRec=ctx.reviewApi.buildCostReconciliation(appProject,blank,mapping);assert(ctx.reviewApi.buildCostReviewItems(appProject,blankRec,blank,mapping).some(item=>item.partNumber==='A'&&item.kind==='price'&&item.after===null));const unselected=ctx.reviewApi.createCostImportPlan(appProject,{rows:blank,errors:[]},{...pending,costSelections:{}},'未选择');assert.strictEqual(unselected.record.resolvedPrices.A.high.current.amount,10,'blank price must retain existing value unless approved');
ctx.reviewApi.applyCostImportPlan(appProject,unselected);assert.strictEqual(ctx.reviewApi.selectStagePrice(appProject,'A','high','current').amount,10);assert(!Object.prototype.hasOwnProperty.call(appProject.attributes,'B'),'unselected attributes do not create entries');
const reupload=ctx.reviewApi.buildCostReconciliation(appProject,source,mapping);assert(ctx.reviewApi.buildCostReviewItems(appProject,reupload,source,mapping).some(item=>item.partNumber==='A'&&item.variantId==='high'&&item.field==='current'&&item.after===12),'unselected change remains available when the same file is uploaded again');
const supplierProject={...appProject,costImports:[],prices:[{partNumber:'A',variantId:null,stage:'nomination',status:'formal',amount:6,supplier:'旧供应商',effectiveAt:'2026-01-01',recordedAt:'2026-01-01T00:00:00Z'}],attributes:{A:{nominationSupplier:'旧供应商'}}};const supplierRows=[{...source[0],supplier:'新供应商',prices:{nomination:8}}],supplierMapping={nominationPrice:0,supplier:1};
const supplierKey=ctx.reviewApi.costReviewKey('attribute','A','nominationSupplier');const onlySupplier=ctx.reviewApi.createCostImportPlan(supplierProject,{rows:supplierRows,errors:[]},{...pending,mapping:supplierMapping,costSelections:{[supplierKey]:true}},'供应商确认');assert.strictEqual(onlySupplier.record.resolvedPrices.A.high.nomination.amount,6);assert.strictEqual(onlySupplier.record.resolvedPrices.A.high.nomination.supplier,'新供应商');
const priceKey=ctx.reviewApi.costReviewKey('price','A','nomination','high');const onlyPrice=ctx.reviewApi.createCostImportPlan(supplierProject,{rows:supplierRows,errors:[]},{...pending,mapping:supplierMapping,costSelections:{[priceKey]:true}},'价格确认');assert.strictEqual(onlyPrice.record.resolvedPrices.A.high.nomination.amount,8);assert.strictEqual(onlyPrice.record.resolvedPrices.A.high.nomination.supplier,'旧供应商');
console.log('Cost review item checks passed.');

vm.runInContext(`
  const importValidationProject = {variants:[{id:'high',name:'高配'}]};
  const importValidationMapping = {
    headerRow:1, mode:'fitment', partNumber:0, baseQuantity:1, quantities:{high:2},
    targetPrice:3, nominationPrice:4, currentPrice:5, costRemark:6
  };
  const importValidationSheet = {
    name:'成本明细',
    rows:[
      ['零件号','用量','高配','目标成本','定点成本','1030单价','差异分析'],
      ['A','1','S','10','11','12','涨价'],
      ['A','1','S','10','11','13',''],
      ['B','','错误标记','待报价','','',''],
      ['','1','S','','','','']
    ]
  };
  let validationDialog;
  openDialog = (title, body, subtitle) => { validationDialog = {title,body,subtitle}; };
  renderPage = () => {};
  mappingFromControls = () => {};
  refreshBomPreview = () => {
    pendingImport.preview = parseBomRows(importValidationProject, getCurrentSheet(), pendingImport.mapping, 'cost');
  };
  pendingImport = {parsed:{sheets:[importValidationSheet]}, sheetIndex:0, mapping:importValidationMapping, mappingOpen:true};
  previewImport();
  globalThis.validationFailure = {dialog:validationDialog,mappingOpen:pendingImport.mappingOpen};
  importValidationSheet.rows.length = 2;
  validationDialog = null;
  previewImport();
  globalThis.validationSuccess = {dialog:validationDialog,mappingOpen:pendingImport.mappingOpen};
`,ctx);
assert(ctx.validationFailure.dialog, '校验失败时必须弹窗');
assert.strictEqual(ctx.validationFailure.mappingOpen,true);
for (const detail of ['成本明细','B 列','C 列','D 列','F 列','G 列','1030单价','第 4 行','第 2、3 行']) {
  assert(JSON.stringify(ctx.validationFailure.dialog).includes(detail), '弹窗缺少 '+detail);
}
assert.strictEqual(ctx.validationSuccess.dialog,null);
assert.strictEqual(ctx.validationSuccess.mappingOpen,false);

vm.runInContext(`
  const syncProject = createProjectRecord('导入规则测试',['高配','低配']);
  const [high,low] = syncProject.variants.map(v=>v.id);
  const mapping = {headerRow:1,mode:'fitment',partNumber:0,description:1,baseQuantity:2,
    quantities:{[high]:3,[low]:4},targetPrice:5,nominationPrice:6,currentPrice:7,sopPrice:8};
  const sheet = {name:'明细',rows:[
    ['料号','名称','用量','高配','低配','目标','定点','当前','SOP'],
    ['A','已编码','1','S','S','2','3','4','5'],
    ['','待补件','2','S','-',' #N/A ','#n/a','15','#N/A'],
    ['','待补件','3','S','S','6','7','8','9'],
    ['','说明','','','','#N/A','','',''],
    ['ONLY-COST','未匹配','1','S','S','50','50','50','50']
  ]};
  const ebom = parseBomRows(syncProject,{...sheet,rows:sheet.rows.slice(0,2)},mapping,'ebom');
  syncProject.imports.push({importId:'e1',versionDate:'2026-01-01',snapshot:ebom.rows});
  const parse = () => parseBomRows(syncProject,sheet,mapping,'cost');
  const initial = parse();
  globalThis.syncImport = {errors:initial.errors};
  if(!initial.errors.length){
    const apply = preview => {
      const reconciliation=buildCostReconciliation(syncProject,preview.rows,mapping);
      const review=buildCostReviewItems(syncProject,reconciliation,preview.rows,mapping);
      const costSelections=Object.fromEntries(review.map(item=>[item.key,true]));
      const plan=createCostImportPlan(syncProject,preview,{mapping,costSelections,versionDate:'2026-02-01'},'测试');
      applyCostImportPlan(syncProject,plan);
      return {reconciliation,plan};
    };
    const first=apply(initial);
    const summary=summarizeVariant(syncProject,high);
    const exported=costExportRows(syncProject,high);
    const repeated=diffCostBom(initial.rows,parse().rows);
    sheet.rows[2][0]='B';
    syncProject.imports.push({importId:'e2',versionDate:'2026-01-15',snapshot:parseBomRows(syncProject,{...sheet,rows:sheet.rows.slice(0,3)},mapping,'ebom').rows});
    apply(parse());
    globalThis.syncImport={errors:initial.errors,initial,first,summary,exported,repeated,ebomCount:getOccurrences(syncProject).length,lowSummary:summarizeVariant(syncProject,low),updated:summarizeVariant(syncProject,high)};
  }
`,ctx);
const syncImport=ctx.syncImport;
assert.deepStrictEqual(Array.from(syncImport.errors),[]);
assert.strictEqual(syncImport.initial.rows.length,4);
assert.strictEqual(syncImport.initial.rows[1].prices.target,null);
assert.strictEqual(syncImport.initial.rows[1].prices.nomination,null);
assert.strictEqual(syncImport.initial.rows[1].prices.sop,null);
assert.deepStrictEqual(Array.from(syncImport.first.reconciliation.unmatched),['ONLY-COST']);
assert.strictEqual(syncImport.first.plan.record.structureSnapshot.length,3);
assert.strictEqual(syncImport.summary.current,58);
assert.strictEqual(syncImport.lowSummary.current,28);
assert.deepStrictEqual(Array.from(syncImport.exported.slice(1),row=>row[2]),['A','','']);
assert.strictEqual(syncImport.repeated.changes.length,0);
assert.strictEqual(syncImport.ebomCount,2);
assert.strictEqual(syncImport.updated.current,58);
