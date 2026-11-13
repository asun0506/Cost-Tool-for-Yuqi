const assert=require('node:assert/strict');
const vm=require('node:vm');
const script=require('./helpers/app-script.cjs').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*$/,'\n');
const context={TextEncoder,TextDecoder,Intl};
vm.runInNewContext(script+`
const groups=[{range:'M1:M2',partNumbers:['A'],amount:50,current:53,gap:{amount:3,percentage:.06}}];
const key=JSON.stringify(['M1:M2','A','B']);
const project={targetPackageNames:{[key]:'全车小支架'},costImports:[{snapshot:[
 {partNumber:'B',targetPackage:{range:'M1:M2',amount:50}},
 {partNumber:'A',targetPackage:{range:'M1:M2',amount:50}}
]}]};
globalThis.detail=renderTargetPackages(groups,true,project);
globalThis.preview=renderTargetPackages(groups);
`,context);
assert.ok(context.detail.includes('<th>源表范围</th><th>零件包名称</th><th>零件号</th>'));
assert.ok(context.detail.includes('全车小支架'));
assert.ok(!context.preview.includes('零件包名称'));
console.log('Package name renders across configurations and is scoped to the cost details.');
