// Vite emits every original WAV unchanged; the controller selects playback windows.
const files=import.meta.glob('../assets/audio/Dont Let it out Mark voice/LEVEL 3/ENDINGS/*.wav',
  {eager:true,query:'?url',import:'default'});
export const endingAudioUrls=Object.fromEntries(Object.entries(files).map(([path,url])=>[path.split('/').pop(),url]));
