const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const {webcrypto} = require('crypto');
const {TextEncoder,TextDecoder} = require('util');

const script = require('./helpers/app-script.cjs')
  .replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/, '\n');
const context = vm.createContext({TextEncoder,TextDecoder,crypto:webcrypto,console,Date,Intl,Map,Set,Uint8Array,ArrayBuffer});
vm.runInContext(script + '\nglobalThis.reviewApi={reviewData,reviewChartSvg,renderOverview,renderVariantDomainTable,renderWeeklyVariantChanges,handleClick,summarizeVariant,setState:value=>{appState=value;currentVariantId=null;},getVariant:()=>currentVariantId,stubRender:()=>{render=()=>{globalThis.renderCalls=(globalThis.renderCalls||0)+1;};}};',context);
const api = context.reviewApi;

function fixture() {
  const ids=['P1','P2','P3','P4','P5'];
  const current=[100,100,200,200,50], target=[90,90,190,190,40];
  const categories=['动力域','底盘域','外饰域','智能域','生态及其他'];
  const project={id:'demo',name:'测试车型',variants:[{id:'v1',name:'高配'},{id:'v2',name:'中配'},{id:'v3',name:'低配'}],occurrences:[],prices:[],attributes:{},changes:[],freezes:[],imports:[],risks:[],reports:[]};
  ids.forEach((id,i) => {
    project.occurrences.push({partNumber:id,name:id,sourceRow:String(i+1),categories:[],variantQuantities:{v1:i===0?2:1,v2:1,v3:1}});
    project.attributes[id]={category1:'一级'+i,category2:categories[i]};
    project.prices.push({recordId:'t'+i,partNumber:id,variantId:null,stage:'target',status:'formal',amount:target[i],effectiveAt:'2026-10-01',recordedAt:'2026-10-01T01:00:00.000Z'});
    project.prices.push({recordId:'c'+i,partNumber:id,variantId:null,stage:'current',status:'formal',amount:current[i],effectiveAt:'2026-10-01',recordedAt:'2026-10-01T01:00:01.000Z'});
  });
  project.prices.push({recordId:'specific',partNumber:'P1',variantId:'v2',stage:'current',status:'formal',amount:130,effectiveAt:'2026-10-01',recordedAt:'2026-10-01T01:00:02.000Z'});
  api.setState({projects:[project],activeProjectId:'demo',partMaster:{},settings:{thresholds:{}},auditEvents:[]});
  for (const variantId of ['v1','v2','v3']) {
    const summary=api.summarizeVariant(project,variantId);
    project.freezes.push({lockId:'freeze-'+variantId,variantId,createdAt:'2026-10-30T12:00:00.000Z',rows:JSON.parse(JSON.stringify(summary.parts.map(row=>({...row,attributes:project.attributes[row.partNumber]}))))});
  }
  const newAmounts=[105,95,205,210];
  const kinds=['product','styling','engineering','commercial'];
  kinds.forEach((category,i) => {
    const changeId='change-'+i;
    project.changes.push({changeId,category,approval:'approved'});
    project.prices.push({recordId:'changeprice-'+i,partNumber:ids[i],variantId:null,stage:'current',status:'formal',amount:newAmounts[i],effectiveAt:'2026-11-02',recordedAt:'2026-11-02T08:00:0'+i+'.000Z',changeId});
  });
  return project;
}

const project=fixture();
project.attributes.P1={category1:'一级A',category2:'电驱与电池'};
project.attributes.P2={category1:'一级B',category2:'电驱与电池'};
project.attributes.P3={category1:'一级A',category2:'车身附件'};
project.attributes.P4={category1:'一级A',category2:'<自定义领域>'};
project.attributes.P5={category1:'一级已填写',category2:''};
const summary=api.summarizeVariant(project,'v1');
const html=api.renderVariantDomainTable(project,summary);
assert(html.includes('电驱与电池'));
assert(html.includes('车身附件'));
assert(html.includes('&lt;自定义领域&gt;'));
assert(html.includes('未分类'));
assert(html.includes('二级分类'));
assert(!html.includes('一级已填写'));
assert(!html.includes('一级A'));
assert(!html.includes('一级B'));
assert(!html.includes('生态及其他'));
const data=api.reviewData(project,'v1',new Date('2026-11-02T00:00:00'));
assert.strictEqual(data.current.total,770);
assert.strictEqual(data.current.values[data.domains.findIndex(d=>d.label==='电驱与电池')],305);
assert(data.domains.some(d=>d.label==='电驱与电池'));
assert(data.domains.some(d=>d.label==='动力域'),'frozen historical domains remain visible');
assert(api.reviewChartSvg(data).includes('电驱与电池'));
const empty=fixture();empty.occurrences=[];empty.freezes=[];
const blank=api.renderVariantDomainTable(empty,api.summarizeVariant(empty,'v1'));
assert(!blank.includes('动力域'));
console.log('Dynamic domain checks passed: actual second-level labels, combined costs, escaping, unclassified parts, historical snapshots and empty state.');
