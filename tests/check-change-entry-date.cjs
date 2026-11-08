const assert=require('node:assert/strict'),vm=require('node:vm');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const c=vm.createContext({crypto:require('node:crypto').webcrypto,console,Date,Intl,Map,Set,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder});
vm.runInContext(script+'\nglobalThis.api={resolveChangeBomBaseline,manualCostEditDates,buildChangeRecord,setState:s=>appState=s};',c);
const p={id:'p',costImports:[{importId:'b1',versionLabel:'V1',versionDate:'2026-11-02'}],changes:[],variants:[]};c.api.setState({projects:[p]});
const v=(id,date,entry='yes')=>({get:k=>({category:'styling',costBomEntry:entry,costBomImportId:id,date,reason:'测试',budgetBasis:'vehicleDelta'})[k]??null,getAll:()=>[],has:()=>false});
assert.throws(()=>c.api.buildChangeRecord(p,v('b1','2026-11-03'),null,null,'2026-11-08'),/不晚于/);
assert.equal(c.api.resolveChangeBomBaseline(p,true,'b1','2026-11-02').date,'2026-11-02');
assert.throws(()=>c.api.buildChangeRecord(p,v('','2026-11-01'),null,null,'2026-11-08'),/选择.*Cost BOM/);
assert.equal(c.api.resolveChangeBomBaseline(p,true,'b1','2026-11-01').date,'2026-11-02');
assert.equal(c.api.resolveChangeBomBaseline(p,false,'','2026-11-03'),null);
assert.throws(()=>c.api.resolveChangeBomBaseline(p,true,'bad','2026-11-01'),/选择.*Cost BOM/);
console.log('Cost BOM baseline date validation passed.');

const newer={importId:'b2',versionDate:'2026-11-05',importedAt:'2026-11-05T10:00:00.000Z'};
const mp={...p,costImports:[{...p.costImports[0],importedAt:'2026-11-02T10:00:00.000Z'},newer],prices:[
{recordId:'old',stage:'current',costManualEdit:true,recordedAt:'2026-11-04T12:00:00.000Z'},
{recordId:'now',stage:'current',costManualEdit:true,recordedAt:'2026-11-06T12:00:00.000Z'},
{recordId:'other',stage:'target',costManualEdit:true,recordedAt:'2026-11-07T12:00:00.000Z'},
{recordId:'imp',stage:'current',costImportId:'b2',recordedAt:'2026-11-07T12:00:00.000Z'}]};
assert.deepEqual(Array.from(c.api.manualCostEditDates(mp)),['2026-11-06']);
assert.equal(c.api.resolveChangeBomBaseline(mp,true,'@manual','2026-11-07','2026-11-06').date,'2026-11-06');
assert.throws(()=>c.api.resolveChangeBomBaseline(mp,true,'@manual','2026-11-07','2026-11-04'),/手动/);
assert.throws(()=>c.api.resolveChangeBomBaseline(mp,true,'@manual','2026-11-07',''),/日期/);
assert.throws(()=>c.api.resolveChangeBomBaseline(mp,true,'b2','2026-11-06'),/不晚于/);
console.log('Manual Cost BOM entry source checks passed.');

const auditProject={...mp,variants:[{id:'h',name:'高配'}],imports:[],occurrences:[],attributes:{},changes:[]};
auditProject.prices.push({recordId:'form-edit',stage:'current',recordedAt:'2026-11-07T12:00:00.000Z',amount:20});
c.api.setState({projects:[auditProject],activeProjectId:'p',partMaster:{},auditEvents:[{projectId:'p',entityType:'price',action:'create',before:{effectiveRecord:{amount:10}},after:{record:{recordId:'form-edit',stage:'current',amount:20}}}]});
assert.deepEqual(Array.from(c.api.manualCostEditDates(auditProject)),['2026-11-07','2026-11-06']);
const values={changeNumber:'CR-TEST',category:'styling',costBomEntry:'yes',costBomImportId:'@manual',costBomManualDate:'2026-11-06',date:'2026-11-07',reason:'大灯涨价',budgetBasis:'vehicleDelta',variantIds:['h'],itemIds:['a'],'partName:a':'大灯','applies:a:h':'1','budget:a:h':'20'};
const f={get:k=>Array.isArray(values[k])?values[k][0]:values[k]??null,getAll:k=>Array.isArray(values[k])?values[k]:values[k]?[values[k]]:[],has:k=>values[k]!=null};
const saved=c.api.buildChangeRecord(auditProject,f,null,null,'2026-11-08T12:00:00Z').change;
assert.equal(saved.costBomImportId,'@manual');assert.equal(saved.costBomEntryDate,'2026-11-06');
console.log('Manual price audit, record and date persistence passed.');
