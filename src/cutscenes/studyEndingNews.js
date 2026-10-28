// Sentence boundaries measured from the shipped MP3s (decoded at 48 kHz).
// Offsets are relative to the news source's AudioContext start, never reading-time timers.
export const ENDING_NEWS=Object.freeze({
  release:{voice:'l3_news_release.mp3',duration:20.06202083333333,captions:[
    {start:0,end:6.5,text:'An injured young woman was found alive near a private residence believed to be connected to Project HOLLOW late last night.'},
    {start:6.92,end:10.16,text:'Police are searching for a second person seen fleeing the property.'},
    {start:10.6,end:14.74,text:'Witnesses describe the individual as disoriented and dangerously aggressive.'},
    {start:15.16,end:20.06202083333333,text:'Residents are being warned not to approach the figure under any circumstances.'}
  ]},
  reseal:{voice:'l3_news_contained.mp3',duration:16.718354166666668,captions:[
    {start:0,end:5.64,text:'Authorities remain unable to enter a sealed private residence believed to be connected to Project HOLLOW.'},
    {start:6.08,end:8.98,text:'A young woman trapped inside is now presumed dead.'},
    {start:9.46,end:12.8,text:"No one has been seen leaving the property since last night's disturbance."},
    {start:13.2,end:16.718354166666668,text:'The residence remains sealed under police observation.'}
  ]}
});
