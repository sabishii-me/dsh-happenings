import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('registers the same main/sidebar pattern as Socials and Sonar',()=>{
 let entry; const routes=[];const dictionaries=[];
 vm.runInNewContext(readFileSync(new URL('../plugin/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:v=>entry=v}}});
 assert.equal(entry.id,'dsh-happenings');
 const React={createElement:(type,props,...children)=>({type,props,children})};
 const plugin=entry.factory(name=>{assert.equal(name,'react');return React;});
 plugin.apply({effect:fn=>fn(),locale:{register:(...args)=>{dictionaries.push(args);return ()=>{};},bind:()=>key=>key},slots:{inject:(_name,fn)=>fn(),register:(options,component)=>{routes.push({options,component});return ()=>{};}}});
 assert.equal(routes.length,2);
 assert.equal(routes[0].options.name,'main');assert.equal(routes[0].options.key,'happenings');
 assert.equal(routes[1].options.name,'sidebar.panellist');assert.equal(routes[1].options.id,'happenings');
 assert.equal(dictionaries[0][0],'happenings');
});

test('packed web uses same-origin plugin assets and API, never a baked event snapshot',()=>{
 const html=readFileSync(new URL('../plugin/web/index.html',import.meta.url),'utf8');
 assert.match(html,/\/dsh-happenings\/app\/assets\//);
 const script=html.match(/src="(\/dsh-happenings\/app\/assets\/[^\"]+\.js)"/)[1];
 const js=readFileSync(new URL('../plugin/web/'+script.replace('/dsh-happenings/app/',''),import.meta.url),'utf8');
 assert.ok(js.includes('/dsh-happenings/api'));
 assert.ok(!js.includes('window.__HAPPENINGS__'));
});
