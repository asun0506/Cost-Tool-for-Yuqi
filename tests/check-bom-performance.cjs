const assert = require('node:assert/strict');
const vm = require('node:vm');
const script = require('./helpers/app-script.cjs')
  .replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/, '\n');

const context = vm.createContext({Date, Intl, TextEncoder, TextDecoder});
const result = vm.runInContext(script + `
  const variants = [{id:'high'}, {id:'low'}];
  const occurrences = Array.from({length:40}, (_, index) => ({
    partNumber:'P'+index, variantQuantities:{high:2,low:1}
  }));
  const costImports = ['2025-01-01','2025-01-02','2025-01-03'].map((date,index) => ({
    importId:'cost-'+index, versionDate:date, importedAt:date+'T10:00:00Z', snapshot:[]
  }));
  const prices = costImports.flatMap((record,index) => occurrences.flatMap(row =>
    ['target','nomination','current'].map(stage => ({
      partNumber:row.partNumber, variantId:null, stage, amount:index+1,
      costImportId:record.importId, effectiveAt:record.versionDate, recordedAt:record.importedAt
    }))
  ));
  prices.push({partNumber:'P0', variantId:'high', stage:'current', amount:10,
    status:'estimate', effectiveAt:'2025-01-04', recordedAt:'2025-01-04T10:00:00Z'});
  const project = {variants, occurrences, prices, costImports, attributes:{}};
  let versionLookups=0;
  const getLatest=latestBomRecord;
  latestBomRecord=(...args)=>{versionLookups++;return getLatest(...args);};
  const summary=summarizeVariant(project,'high');
  ({current:summary.current,target:summary.target,nomination:summary.nomination,
    priceKind:summary.parts[0].current.priceKind,versionLookups});
`, context);

assert.equal(result.current, 254);
assert.equal(result.target, 240);
assert.equal(result.nomination, 240);
assert.equal(result.priceKind, 'estimate');
assert.equal(result.versionLookups, 1, 'Resolve the active price version once for the whole BOM');
console.log('Cost BOM summary checks passed: indexed price history, manual override and cost totals.');
