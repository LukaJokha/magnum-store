import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
class Element {
  children=[]; value=''; disabled=false;
  append(...items){this.children.push(...items)}
  setAttribute(key,value){this[key]=value}
  focus(){this.focused=true}
  click(){return this.onclick?.()}
}
const context=vm.createContext({window:{},document:{createElement(){return new Element()}}});
vm.runInContext(await fs.readFile(new URL('../catalog-options.js',import.meta.url),'utf8'),context);
const api=context.window.MagnumOptions;
let options=['HATSAN'],selected='',writes=0,release,allow=true,busy=false;
const container=new Element();
api.bind({container,kind:'brand',values:()=>options,database:()=>({from(){return{insert(){writes++;return{select(){return new Promise(resolve=>{release=resolve})}}}}}}),select(value){selected=value;options.push(value)},busy(value){busy=value},canSave:()=>allow});
const [open,panel,status]=container.children[0].children;
const [input,hint,save,cancel]=panel.children;
open.click(); assert.equal(panel.hidden,false); assert.equal(input.focused,true);
input.value='hatsan'; input.oninput(); assert.equal(hint.textContent,'შეინახება: HATSAN');
await save.click(); assert.equal(writes,0); assert.equal(selected,'HATSAN'); assert.match(status.textContent,/უკვე არსებობს/);
open.click(); input.value='new brand'; const pending=save.click();
assert.equal(save.disabled,true); assert.equal(busy,true); await save.click(); assert.equal(writes,1);
release({data:[{value:'NEW BRAND'}]}); await pending;
assert.equal(selected,'NEW BRAND'); assert.equal(panel.hidden,true); assert.equal(busy,false); assert.equal(input.disabled,false);
allow=false; input.value='other'; await save.click(); assert.equal(writes,1);
allow=true;open.click();input.value='<img>';await save.click();assert.equal(status.className,'form-message error');assert.equal(panel.hidden,false);assert.equal(writes,1);
cancel.click();assert.equal(panel.hidden,true);
console.log('Option UI checks passed: preview, existing selection, saved selection, pending-write lock, errors and cancellation.');
