import fs from 'node:fs';import {spawn} from 'node:child_process';
const port=9347,profile=process.cwd()+'/.tmp-mirror-stability-chrome';
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+port,'--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--window-size=1280,720','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();if(tabs.length)break;}catch{}await sleep(250);}
socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let serial=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await send('Page.enable');await send('Page.navigate',{url:'http://127.0.0.1:5186/.tmp-mirror-stability.html'});
for(let i=0;i<180;i++){if(await evaluate('!!window.stability'))break;await sleep(250);}
if(!await evaluate('!!window.stability'))throw Error('Study did not finish loading');await evaluate('window.stability.start()');
for(let i=0;i<100;i++){await sleep(500);if(await evaluate('window.stability.done'))break;}
const results=await evaluate('window.stability.results');fs.writeFileSync('docs/validation/level3-mirror-stability-results.json',JSON.stringify(results,null,2));
const captures=await evaluate('window.stability.captures');for(const c of captures)fs.writeFileSync('docs/validation/level3-mirror-stable-'+c.name+'.png',Buffer.from(c.image.split(',')[1],'base64'));
console.log(JSON.stringify({done:await evaluate('window.stability.done'),...results,captures:captures.map(c=>c.name)}));
}finally{socket?.close();chrome.kill();}
