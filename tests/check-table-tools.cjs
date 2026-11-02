// Run the shared table controls against real Chromium DOM and layout, without dependencies.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const browser=process.env.TABLE_TEST_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>fs.existsSync(p));
if(!browser)throw Error('Set TABLE_TEST_BROWSER to a Chromium browser executable.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cost-table-check-'));
const html=fs.readFileSync(path.join(__dirname,'../dist/cost-bom-tool.html'),'utf8');
const checks=String.raw`
(async()=>{
 const results=[];const check=(condition,message)=>{if(!condition)throw Error(message);results.push(message);};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
 const project={id:'table-ui-fixture',name:'测试车型',variants:[{id:'high',name:'高配'},{id:'mid',name:'中配'},{id:'low',name:'低配'}],imports:[],costImports:[],prices:[],attributes:{},changes:[],occurrences:[],freezes:[],reports:[],risks:[]};
 ['A','B','C'].forEach((partNumber,i)=>{
  project.occurrences.push({partNumber,name:'零件'+partNumber,unit:'PCS',baseQuantity:2,fitments:{high:i===2?'-':i===1?'O':'S',mid:'S',low:'S'},variantQuantities:{high:i===0?2:0,mid:2,low:2}});
  project.prices.push({partNumber,stage:'current',status:'formal',amount:(i+1)*10,effectiveAt:'2026-01-01',recordedAt:'2026-01-01T00:00:00Z'});
 });
 appState={activeProjectId:project.id,projects:[project],partMaster:{},settings:{thresholds:{}},auditEvents:[]};currentPage='bom';currentVariantId='high';
 document.querySelector('#appShell').classList.remove('hidden');document.querySelector('#bootScreen')?.remove();
 setupTableTools();renderPage();await settle();
 let table=document.querySelector('#content table'),tool=tableToolInstances.get(table),bar=tool.bar;
 const field=(name,value)=>{const el=bar.querySelector('[data-tt="'+name+'"]');el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));};
 const action=name=>bar.querySelector('[data-tt-action="'+name+'"]').click();
 const cell=(r,c,shift=false)=>table.rows[r].cells[c].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:shift}));
 check(!!tool,'New page tables receive controls automatically');
 check(table.tHead.rows[0].cells[0].textContent.includes('编号'),'Number column remains first');
 check(table.tHead.textContent.includes('高配')&&!table.tHead.textContent.includes('中配'),'Only active strategy column is visible');
 check(table.tBodies[0].rows.length===2&&summarizeVariant(project,'high').current===20,'S counts, O remains visible, and - is excluded');
 await handleClick({target:table.querySelector('[data-action="price-status"]')});check(document.querySelector('#priceStatusForm select[name="status"]').options.length===3,'Imported cost details offer manual status and restore-auto controls');closeDialog();
 cell(1,4);field('fill','#fff2cc');action('fill');check(table.rows[1].cells[4].style.backgroundColor==='rgb(255, 242, 204)','Selected cell gets fill color');
 cell(2,5,true);field('color','#112233');action('color');
 check(table.rows[1].cells[5].style.color==='rgb(17, 34, 51)'&&table.rows[2].cells[4].style.color==='rgb(17, 34, 51)','Shift click formats a rectangular range');
 field('size',18);action('size');field('font','SimSun');bar.querySelector('[data-tt-action="align"][data-value="right"]').click();
 check(table.rows[2].cells[5].style.fontSize==='18px'&&table.rows[2].cells[5].style.fontFamily==='SimSun'&&table.rows[2].cells[5].style.textAlign==='right','Font, size and alignment apply to the selection');
 field('scope','cols');field('width',240);action('width');check(table.rows[1].cells[4].style.width==='240px','Column width applies to all cells in selected columns');
 check(Math.abs(table.rows[1].cells[4].getBoundingClientRect().width-240)<3,'Column width is reflected in actual browser layout');
 field('scope','rows');field('height',55);action('height');check(table.rows[2].cells[4].style.height==='55px','Row height applies to all selected rows');
 check(Math.abs(table.rows[2].getBoundingClientRect().height-55)<3,'Row height is reflected in actual browser layout');
 field('filter-column',3);field('filter-mode','equals');field('filter-value','B');action('filter');check(table.rows[1].classList.contains('tt-hidden-row')&&!table.rows[2].classList.contains('tt-hidden-row'),'Column filtering hides nonmatching rows');
 field('filter-column',10);field('filter-mode','equals');field('filter-value','S');action('filter');check(table.rows[2].classList.contains('tt-hidden-row'),'Multiple column filters combine');action('clear-filters');
 check(!table.rows[1].classList.contains('tt-hidden-row'),'Clearing filters restores rows');
 cell(1,4);action('hide-cols');check(table.rows[1].cells[4].classList.contains('tt-hidden-col'),'Selected columns can be hidden');
 check(tool.colgroup.children.length===tool.model.count-1&&Math.abs(table.rows[1].cells[5].getBoundingClientRect().width-240)<3,'Hiding an earlier column preserves the next visible column width');
 action('hide-rows');check(table.rows[1].classList.contains('tt-hidden-row'),'Selected rows can be hidden');action('show-all');check(!table.rows[1].classList.contains('tt-hidden-row')&&!table.rows[1].cells[4].classList.contains('tt-hidden-col'),'Hidden rows and columns can be restored');
 const key=tool.key;tableToolMemory.clear();renderPage();await settle();table=document.querySelector('#content table');tool=tableToolInstances.get(table);bar=tool.bar;
 check(tool.key===key&&table.rows[1].cells[4].style.backgroundColor==='rgb(255, 242, 204)'&&table.rows[2].cells[4].style.fontSize==='18px','Formats and dimensions reload from local storage after re-render');
 currentVariantId='mid';renderPage();await settle();table=document.querySelector('#content table');tool=tableToolInstances.get(table);bar=tool.bar;
 check(tool.key!==key&&table.rows[1].cells[4].style.backgroundColor==='','Other configurations keep independent display settings');
 const before=JSON.stringify(project);cell(1,4);field('scope','all');field('fill','#abcdef');action('fill');
 check(table.rows[3].cells[8].style.backgroundColor==='rgb(171, 205, 239)','Whole table formatting covers all cells');action('reset');
 check(table.rows[3].cells[8].style.backgroundColor===''&&JSON.stringify(project)===before,'Reset clears display preferences without changing business data');
 const n=Array.from(table.tHead.rows[0].cells).length;check(Array.from(table.tBodies[0].rows).every(row=>row.cells.length===n),'Headers, row numbering and data columns align');
 openDialog('表格测试','<table class="data-table"><tbody><tr><td>无表头</td><td><button type="button" id="test-business-button">业务操作</button></td></tr><tr><td colspan="2">跨列内容</td></tr></tbody></table>');await settle();
 const modalTable=document.querySelector('#dialogBody table'),modalTool=tableToolInstances.get(modalTable);check(!!modalTool&&modalTool.model.count===2,'Headerless and merged tables in dialogs receive controls');
 let pressed=false;document.querySelector('#test-business-button').onclick=()=>pressed=true;document.querySelector('#test-business-button').click();check(pressed,'Existing business buttons still work');closeDialog();
 const empty=document.createElement('table');empty.innerHTML='<thead><tr><th>名称</th><th>金额</th></tr></thead><tbody><tr><td colspan="2">暂无记录</td></tr></tbody>';document.querySelector('#content').append(empty);await settle();check(!!tableToolInstances.get(empty),'Empty tables receive controls without errors');
 check(tableToolMatch('1,200',{mode:'gte',value:'1000'})&&!tableToolMatch('—',{mode:'gte',value:'1000'})&&tableToolMatch('',{mode:'empty'}),'Numeric and blank filters handle formatted values');
 check(Object.keys(tableToolSafeFormat({color:'url(bad)',fontSize:'999px',textAlign:'center'})).join()==='textAlign','Stored format values are validated');
 for(const page of ['overview','imports','changes','risks','locks','audit']){
  currentPage=page;renderPage();await settle();check(Array.from(document.querySelectorAll('#content table')).every(t=>tableToolInstances.has(t)),'All tables on '+page+' receive the shared controls');
 }
 currentPage='bom';costBOMTab='imports';renderPage();await settle();check(Array.from(document.querySelectorAll('#content table')).every(t=>tableToolInstances.has(t)),'Cost import and version tables receive controls');
 const riskTable=order=>'<section><h2>风险ID测试</h2><table><thead><tr><th>零件号</th><th>风险</th><th>操作</th></tr></thead><tbody>'+order.map(id=>'<tr><td>同一零件</td><td>'+id+'</td><td><button data-risk="'+id+'">处理</button></td></tr>').join('')+'</tbody></table></section>';
 document.querySelector('#content').innerHTML=riskTable(['risk-one','risk-two']);await settle();table=document.querySelector('#content table');tool=tableToolInstances.get(table);bar=tool.bar;cell(1,0);action('hide-rows');const riskId=tool.rowIds[1];
 document.querySelector('#content').innerHTML=riskTable(['risk-two','risk-one']);await settle();table=document.querySelector('#content table');tool=tableToolInstances.get(table);
 check(tool.rowIds[2]===riskId&&table.rows[2].classList.contains('tt-hidden-row')&&!table.rows[1].classList.contains('tt-hidden-row'),'Risk display preferences follow record IDs when same-part records reorder');
 document.body.innerHTML='';const out=document.createElement('pre');out.id='table-test-results';out.textContent=JSON.stringify({passed:results.length,results});document.body.append(out);
})().catch(error=>{document.body.innerHTML='';const out=document.createElement('pre');out.id='table-test-failure';out.textContent=error.stack;document.body.append(out);});
`;
let fixture=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace(/\naddListeners\(\);\s*\ninitializeBoot\(\);\s*<\/script>/,'\n'+checks+'\n</script>');
fs.writeFileSync(path.join(dir,'check.html'),fixture);
try{
 const result=cp.spawnSync(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--user-data-dir='+path.join(dir,'profile'),'--dump-dom','--virtual-time-budget=10000','file:///'+path.join(dir,'check.html').replace(/\\/g,'/')],{encoding:'utf8',timeout:45000,maxBuffer:10*1024*1024,windowsHide:true});
 const match=result.stdout?.match(/<pre id="table-test-results">([\s\S]*?)<\/pre>/);
 if(!match)throw Error(result.stdout?.match(/<pre id="table-test-failure">([\s\S]*?)<\/pre>/)?.[1]||result.error?.message||'Browser check did not finish. '+result.stderr?.slice(-1200));
 const output=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));console.log('Table UI checks passed: '+output.passed+' checks.\n'+output.results.join('\n'));
}finally{try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{}}
