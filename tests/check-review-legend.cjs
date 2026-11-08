const fs=require('fs'),vm=require('vm'),assert=require('assert');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const c=vm.createContext({console,Date,Intl,Map,Set,TextEncoder,TextDecoder});vm.runInContext(script+'\nglobalThis.sort=sortReviewLegend;',c);
const p={variants:[],imports:[],costImports:[],occurrences:[{partNumber:'a'},{partNumber:'b'},{partNumber:'c'},{partNumber:'d'}],attributes:{a:{category1:'一',category2:'动力域'},b:{category1:'二',category2:'电子域'},c:{category1:'一',category2:'车架域'},d:{category1:'一',category2:'生态域及其他'}},changes:[]};
const domains=['电子域','生态域及其他','动力域','车架域','未分类'].map(label=>({label,color:'#123456'}));const result=Array.from(c.sort(p,domains),x=>x.label);
assert.equal(result.at(-1),'生态域及其他');assert(Math.abs(result.indexOf('动力域')-result.indexOf('车架域'))===1,'同属一级领域的二级领域相邻');assert.deepEqual(domains.map(d=>d.label),['电子域','生态域及其他','动力域','车架域','未分类'],'仅图例改变顺序，不影响柱状堆叠');
console.log('Cost review legend group order passed.');
