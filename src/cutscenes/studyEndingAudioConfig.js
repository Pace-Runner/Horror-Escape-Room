/** Measured source windows, in seconds. Source files are never rewritten. */
export const ENDING_SFX=Object.freeze({
  rumble:{file:'l3_end_low_rumbl.wav',sourceDuration:54,offset:8,duration:12,gain:.04,fadeIn:.8,fadeOut:1.0,lowpass:180},
  alarm:{file:'l3_end_alarm_loop.wav',sourceDuration:13.828,offset:1,duration:6,gain:.075,fadeIn:.15,fadeOut:.5,lowpass:4500},
  mechanism:{file:'l3_end_heavy_mechanism.wav',sourceDuration:2.607,offset:.13,duration:1.7,gain:.18,fadeIn:.006,fadeOut:.3},
  lock:{file:'l3_end_lock_click.wav',sourceDuration:1.099,offset:0,duration:.34,gain:.18,fadeIn:.003,fadeOut:.035},
  seal:{file:'l3_end_door_seal.wav',sourceDuration:1.8,offset:.19,duration:1.1,gain:.21,fadeIn:.006,fadeOut:.3},
  roar:{file:'l3_end_hollow_roar.wav',sourceDuration:4,offset:.25,duration:1.15,gain:.16,fadeIn:.025,fadeOut:.20},
  lunge:{file:'l3_end_lunge.wav',sourceDuration:9.568,offset:2.2,duration:1.05,gain:.20,fadeIn:.02,fadeOut:.07},
  impact:{file:'l3_end_claw_impact.wav',sourceDuration:3.329,offset:.251,duration:.44,gain:.50,fadeIn:.004,fadeOut:.16},
  static:{file:'l3_news_static.wav',sourceDuration:25.763,offset:4.05,duration:.90,gain:.065,fadeIn:.12,fadeOut:.16,lowpass:6000},
  // Reserved under the future news voice; never starts without a news recording.
  newsBed:{file:'l3_news_bed.wav',sourceDuration:10.983,offset:1.2,duration:5.5,gain:.045,fadeIn:.4,fadeOut:.7}
});
const event=(t,key,options={})=>({t,key,...options});
export function createEndingAudioTimeline(branch,T){
  const contact=T.contact??T.fade;
  const common=[
    event(contact,'impact',{group:'impact'}),
    event(contact+.045,'impact',{offset:.85,duration:.32,gain:.055,lowpass:500,fadeIn:.025,fadeOut:.15,group:'aftermath'}),
    event(T.news,'static',{group:'news'})
  ];
  const release=[
    event(0,'rumble',{offset:35.5,duration:8,gain:.035}),
    event(.3,'alarm',{duration:5.7}),
    event(.02,'mechanism',{position:[0,.7,6.45]}),event(.75,'lock',{position:[0,1.7,6.45]}),
    event(1.5,'lock',{position:[-5,2,-3],gain:.15}),event(2.3,'mechanism',{position:[4,4,-2],gain:.14}),
    event(T.door-1.4,'mechanism',{position:[0,1.2,6.45],gain:.16}),
    event(T.door,'seal',{position:[0,1.3,6.45],gain:.15}),
    event(T.door,'rain',{duration:contact-T.door,gain:.18,fadeIn:1.3,fadeOut:.2}),
    event(T.still,'rumble',{offset:37.5,duration:T.claw-T.still,gain:.055,fadeIn:.5,fadeOut:.12}),
    event(T.claw-.5,'roar',{duration:.75,gain:.15}),
    event(T.claw,'lunge',{duration:contact-T.claw})
  ];
  const reseal=[
    event(0,'rumble'),event(.25,'alarm',{duration:4.4,gain:.065}),
    event(.02,'mechanism',{position:[0,.7,6.45],gain:.20}),event(.85,'lock',{position:[0,1.7,6.45]}),
    event(2.8,'mechanism',{position:[-4,2,-2],gain:.16}),event(4.5,'lock',{position:[-5,2,-4],gain:.17}),
    event(T.lastMechanism,'mechanism',{position:[4,4,-2],gain:.18}),event(T.seal,'seal',{position:[0,1.3,6.45]}),
    event(T.windDown,'mechanism',{offset:1.1,duration:Math.min(1.35,T.finalLock-.3-T.windDown),gain:.06,lowpass:650,fadeIn:.25,fadeOut:.7}),
    event(T.finalLock,'seal',{position:[0,1.2,6.45],gain:.26}),
    event(T.finalLock+.12,'mechanism',{offset:.14,duration:.85,gain:.13,lowpass:900,fadeOut:.4}),
    event(T.still,'rumble',{offset:37.5,duration:T.claw-T.still,gain:.055,fadeIn:.5,fadeOut:.12}),
    event(T.claw-.5,'roar',{duration:.75,gain:.15}),
    event(T.claw,'lunge',{duration:contact-T.claw})
  ];
  return [...(branch==='release'?release:reseal),...common].map(e=>({group:'scene',...e})).sort((a,b)=>a.t-b.t);
}
