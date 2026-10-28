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
  // Reserved; the report plays dry over black, with static only after speech.
  newsBed:{file:'l3_news_bed.wav',sourceDuration:10.983,offset:1.2,duration:5.5,gain:.045,fadeIn:.4,fadeOut:.7}
});
/** Curated cuts of new licensed recordings; original source/cut details live beside the assets. */
export const CONTAINED_SFX=Object.freeze({
  creditsMusic:{file:'l3_credits_score.wav',sourceDuration:14.2,offset:0,duration:14,gain:.32,fadeIn:2,fadeOut:2,lowpass:7200},
  tension:{file:'l3_contained_tension.wav',sourceDuration:15,offset:0,duration:14.9,gain:.11,fadeIn:1.6,fadeOut:.06,lowpass:4200},
  rise:{file:'l3_contained_rise.wav',sourceDuration:3.2,offset:0,duration:3.15,gain:.19,fadeIn:.45,fadeOut:.04},
  cinematicHit:{file:'l3_contained_hit.wav',sourceDuration:3.6,offset:0,duration:3.5,gain:.31,fadeIn:.003,fadeOut:1.2,lowpass:5500},
  aftermath:{file:'l3_contained_aftermath.wav',sourceDuration:2.2,offset:0,duration:2.15,gain:.045,fadeIn:.035,fadeOut:1.5,lowpass:2300},
  tune:{file:'l3_contained_radio_tune.wav',sourceDuration:1.9,offset:0,duration:1.85,gain:.065,fadeIn:.35,fadeOut:.5,lowpass:3800},
  hollowBreath:{file:'l3_hollow_breath.wav',sourceDuration:1.25,offset:0,duration:1.2,gain:.055,fadeIn:.12,fadeOut:.25,lowpass:2300},
  hollowGrowl:{file:'l3_hollow_growl.wav',sourceDuration:1.2,offset:0,duration:1.15,gain:.13,fadeIn:.1,fadeOut:.12,lowpass:2900},
  hollowRoar:{file:'l3_hollow_roar.wav',sourceDuration:1.12,offset:0,duration:1.05,gain:.23,fadeIn:.025,fadeOut:.08,lowpass:6500},
  hollowClaw:{file:'l3_hollow_slash.wav',sourceDuration:.64,offset:0,duration:.60,gain:.44,fadeIn:.003,fadeOut:.18},
  hollowRush:{file:'l3_hollow_swipe.wav',sourceDuration:.47,offset:.03,duration:.40,gain:.20,fadeIn:.015,fadeOut:.04}
});
const event=(t,key,options={})=>({t,key,...options});
export function createEndingAudioTimeline(branch,T){
  const contact=T.contact??T.fade;
  const release=[
    event(0,'rumble',{offset:35.5,duration:8,gain:.035}),
    event(.3,'alarm',{duration:5.7}),
    event(.02,'mechanism',{position:[0,.7,6.45]}),event(.75,'lock',{position:[0,1.7,6.45]}),
    event(1.5,'lock',{position:[-5,2,-3],gain:.15}),event(2.3,'mechanism',{position:[4,4,-2],gain:.14}),
    event(T.door-1.4,'mechanism',{position:[0,1.2,6.45],gain:.16}),
    event(T.door,'seal',{position:[0,1.3,6.45],gain:.15}),
    event(T.door,'rain',{duration:contact-T.door,gain:.18,fadeIn:1.3,fadeOut:.2}),
    event(T.still,'rumble',{offset:37.5,duration:T.claw-T.still,gain:.055,fadeIn:.5,fadeOut:.12}),
    event(T.still-.4,'tension',{offset:3,duration:contact-T.still+.4,gain:.11,fadeIn:.8})
  ];
  const reseal=[
    // A tonal suspense bed and one rising phrase replace the alarm/roar collage.
    event(0,'tension',{duration:contact}),
    event(.02,'mechanism',{position:[0,.7,6.45],gain:.075,lowpass:1400}),
    event(.85,'lock',{position:[0,1.7,6.45],gain:.065}),
    event(T.lastMechanism,'mechanism',{position:[4,3,-2],gain:.09,lowpass:1800}),
    event(T.finalLock,'seal',{position:[0,1.2,6.45],gain:.18}),
  ];
  const finish=[
    event(contact-3.15,'rise',{gain:.13}),
    event(T.still+.12,'hollowBreath'),
    event(T.claw-.9,'hollowGrowl',{duration:1.28,playbackRate:.88}),
    event(T.claw-.1,'hollowRoar',{duration:contact-T.claw+.1,playbackRate:.92}),
    event(contact-.40,'hollowRush'),
    event(contact,'hollowClaw',{group:'impact'}),
    // The musical impact and muffled resonance are allowed to decay across black.
    event(contact,'cinematicHit',{gain:.20,group:'bridge'}),
    event(contact+.08,'aftermath',{group:'bridge'}),
    // Let the hit settle before a receiver finds the broadcast. The final 250ms overlaps speech.
    event(T.news-.6,'tune',{duration:.85,gain:.018,fadeIn:.25,fadeOut:.4,group:'news'})
  ];
  for(let at=T.news;at<T.newsEnd;at+=5.6){
    finish.push(event(at,'static',{offset:5.2,duration:Math.min(6,T.newsEnd-at),gain:.003,lowpass:2600,fadeIn:.3,fadeOut:.35,group:'news'}));
  }
  // The score enters with the film title, then continues beneath the roll and report.
  for(let at=T.title;at<T.end-2;at+=12){
    finish.push(event(at,'creditsMusic',{duration:Math.min(14,T.end-at),group:'credits'}));
  }

  return [...(branch==='release'?release:reseal),...finish].map(e=>({group:'scene',...e})).sort((a,b)=>a.t-b.t);
}
