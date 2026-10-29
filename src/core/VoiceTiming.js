const windows = new WeakMap();

/** Measure decoded speech, retaining quiet consonants and a short natural tail.
 * Opted into only by incidental speech; authored tapes/cutscenes keep their clock. */
export function voicePlaybackWindow(buffer) {
  if (windows.has(buffer)) return windows.get(buffer);
  const full = {offset:0,end:buffer.duration,duration:buffer.duration};
  if (!buffer.getChannelData || !buffer.sampleRate || !buffer.length) return full;
  const step = Math.max(1,Math.floor(buffer.sampleRate*.01));
  const rms = new Float32Array(Math.ceil(buffer.length/step));
  for (let channel=0;channel<buffer.numberOfChannels;channel++) {
    const data=buffer.getChannelData(channel);
    for (let at=0,index=0;at<data.length;at+=step,index++) {
      let power=0;
      for(let i=at;i<Math.min(at+step,data.length);i++)power+=data[i]*data[i];
      rms[index]=Math.max(rms[index],Math.sqrt(power/Math.min(step,data.length-at)));
    }
  }
  let peak=0;for(const value of rms)peak=Math.max(peak,value);
  const threshold=Math.max(.0005,peak*.015);
  let first=0,last=rms.length-1;
  while(first<rms.length&&rms[first]<threshold)first++;
  while(last>first&&rms[last]<threshold)last--;
  if(first>=last){windows.set(buffer,full);return full;}
  const start=first*step/buffer.sampleRate,finish=Math.min(buffer.duration,(last+1)*step/buffer.sampleRate);
  const offset=start>.25?Math.max(0,start-.12):0;
  const end=buffer.duration-finish>.4?Math.min(buffer.duration,finish+.18):buffer.duration;
  const result={offset,end,duration:end-offset};windows.set(buffer,result);return result;
}
