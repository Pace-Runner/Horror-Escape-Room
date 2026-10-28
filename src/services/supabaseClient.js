import {createClient} from '@supabase/supabase-js';
const env=import.meta.env??{};
const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
let client=null;
try{
  const publicKey=key?.startsWith('sb_publishable_')||(key?.startsWith('eyJ')&&JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon');
  if(url&&publicKey)client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
}catch{/* Missing/invalid configuration must never stop the game from loading. */}
export {client as supabase};
