const assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,console,Date,Intl,Map,Set,Uint8Array,ArrayBuffer});
vm.runInContext(script+'\nglobalThis.api={reviewData,reviewChartSvg,summarizeVariant,renderCostReview,setState:s=>appState=s};',context);
const api=context.api,start=new Date('2026-11-02T00:00:00');
const p={id:'p',name:'测试车型',createdAt:'2026-10-01T00:00:00Z',variants:[{id:'high',name:'高配'},{id:'low',name:'低配'}],occurrences:[{partNumber:'A',name:'原有零件',variantQuantities:{high:2,low:1}}],prices:[{recordId:'t',partNumber:'A',stage:'target',status:'estimate',amount:90,recordedAt:'2026-10-01T00:00:00Z'},{recordId:'n',partNumber:'A',stage:'nomination',status:'formal',amount:100,recordedAt:'2026-10-01T00:00:00Z'}],attributes:{A:{category2:'底盘域'}},imports:[],changes:[],freezes:[],risks:[],reports:[]};
api.setState({projects:[p],activeProjectId:'p',partMaster:{},settings:{thresholds:{}},auditEvents:[]});
const change=(id,category,delta,partNumber='')=>({changeId:id,category,date:'2026-11-03',priceMeaning:'delta',budgetBasis:'vehicleDelta',costBomEntry:false,variantIds:['high'],meeting:{name:'成本会',date:'2026-11-03'},items:[{partNumber,partName:'变更项',variantPrices:{high:{budget:delta,finalPrice:null}}}]});
const initial=api.reviewData(p,'high',start);assert.equal(initial.target.total,180);
p.changes.push(change('e','engineering',8.27));
let data=api.reviewData(p,'high',start);
assert.equal(data.target.total,180,'A change without a BOM part must not erase the target column');assert.equal(data.target.missing,0);
assert.equal(data.current.total,208.27);assert.equal(data.previous.total,200);assert.equal(data.bridge.amounts.engineering,8.27);assert(data.bridge.available);
assert(Math.abs(data.previous.total+data.bridge.sum-data.current.total)<1e-8,'Waterfall reconciles to current forecast');
assert(api.reviewChartSvg(data).includes('工程变更：+¥8.27'));assert(api.reviewChartSvg(data).includes('last stage')&&api.reviewChartSvg(data).includes('current stage'));
assert(!api.renderCostReview(p,p.variants[0],{start}).includes('暂无法计算本周变更桥'));
p.changes.push(change('p','product',-3));data=api.reviewData(p,'high',start);assert.equal(data.target.total,180);assert.equal(data.bridge.amounts.product,-3);assert.equal(data.bridge.amounts.engineering,8.27);assert(Math.abs(data.previous.total-200)<1e-8);
assert.equal(api.reviewData(p,'low',start).bridge.sum,0,'Other configurations do not inherit the change');
// A posted delta is already part of Cost BOM, so reconstruct the baseline without adding it twice.
p.changes=[change('posted','engineering',8.27,'A')];p.changes[0].costBomEntry=true;p.changes[0].date='2026-11-01';
p.prices.push({recordId:'posted',partNumber:'A',stage:'current',status:'formal',amount:104.135,variantId:'high',changeId:'posted',deltaAmount:8.27,effectiveAt:'2026-11-01',recordedAt:'2026-11-01T00:00:00Z'});
data=api.reviewData(p,'high',start);assert.equal(data.current.total,208.27);assert.equal(data.previous.total,208.27);assert.equal(data.bridge.amounts.engineering,0);
// Historical locks remain available for reference, but the chart baseline is always the latest Cost BOM.
p.changes=[];p.prices.pop();const frozen=JSON.parse(JSON.stringify(api.summarizeVariant(p,'high').parts));
frozen.forEach(row=>{row.attributes=p.attributes[row.partNumber];row.currentAmount=1;});p.freezes=[{lockId:'lock',variantId:'high',createdAt:'2026-10-30T00:00:00Z',rows:frozen}];
p.changes=[change('pending','engineering',8.27)];data=api.reviewData(p,'high',start);assert(data.snapshot);assert(!data.bridge.reconstructed);assert.equal(data.previous.total,200);assert.equal(data.bridge.amounts.engineering,8.27);
// Missing amounts stay unknown rather than inventing zero deltas or target prices.
p.freezes=[];p.changes[0].items[0].variantPrices.high.budget=null;data=api.reviewData(p,'high',start);assert.equal(data.bridge.available,false);assert.equal(data.target.total,180);
p.prices=p.prices.filter(record=>record.stage!=='target');data=api.reviewData(p,'high',start);assert.equal(data.target.total,null);assert.equal(data.target.missing,1);
console.log('Dashboard regression checks passed: target isolation, latest-BOM waterfall, inclusion flags, signed deltas, configuration isolation, historical-lock independence and incomplete data.');
