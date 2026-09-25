'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','dist'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
let passed=0,failed=0;function test(name,fn){try{fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
const html=read('index.html'),nx=read('nexus-update.js'),spot=read('spot-difference.js'),css=read('qa-fixes.css');
test('All external JavaScript parses',()=>{for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js'))){new vm.Script(read(file),{filename:file})}});
test('All inline JavaScript parses',()=>{let n=0;for(const m of html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)){if(!/\\bsrc\\s*=/.test(m[0].split('>')[0])&&m[1].trim()){new vm.Script(m[1],{filename:'inline-'+ ++n})}}assert(n>0)});
test('Referenced local scripts and styles exist',()=>{for(const m of html.matchAll(/<(?:script|link)\\b[^>]*?\\b(?:src|href)=["']([^"']+)["']/gi)){const file=m[1].split('?')[0];if(!/^(?:https?:|data:|#)/.test(file))assert(fs.existsSync(path.join(root,file)),file)}});
test('All five Spot the Difference sets have five paired normalized hotspots',()=>{const blocks=[...spot.matchAll(/\\{id:'approved-\\d+'[\\s\\S]*?spots:\\[([\\s\\S]*?)\\]\\}/g)];assert.equal(blocks.length,5);for(const b of blocks){const matches=[...b[1].matchAll(/top:\\[([.\\d]+),([.\\d]+)\\],bottom:\\[([.\\d]+),([.\\d]+)\\]/g)];assert.equal(matches.length,5);for(const m of matches){const [tx,ty,bx,by]=m.slice(1).map(Number);assert([tx,ty,bx,by].every(v=>v>=0&&v<=1));assert(ty<.5&&by>.5)}}});
test('Spot Difference assets exist',()=>{for(let i=1;i<=5;i++)assert(fs.existsSync(path.join(root,'spot-difference/set-'+i+'.jpg')))});
test('Card Showcase and Vault are wired',()=>{assert(html.includes('rewardsToVault'));assert(nx.includes('state.showcase'));assert(nx.includes('nexusCollectionV1'))});
test('How to Nexus resets scroll on open',()=>{assert(nx.includes('guide.scrollTop=0'));assert(nx.includes('preventScroll:true'))});
test('Home screen is fixed-height and DNP button is reduced',()=>{assert(css.includes('height:100dvh'));assert(css.includes('*.7'));assert(html.includes('qa-fixes.css'))});
test('Character Lab has no grade or age prompt',()=>{const lab=html.slice(html.indexOf('<dialog id="characterLabDialog">'),html.indexOf('</dialog>',html.indexOf('<dialog id="characterLabDialog">')));assert(!/id="lab(?:Grade|Age)"/.test(lab));assert(lab.includes('labSave'));assert(lab.includes('labCanvas'))});
test('Audio and portal limitations are not hidden',()=>{assert(html.includes('portal-preview.js'));assert(!fs.existsSync(path.join(root,'audio/Anas lines.m4a')))});
console.log('RESULT',passed,'passed',failed,'failed');if(failed)process.exitCode=1;
