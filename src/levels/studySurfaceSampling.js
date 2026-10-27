// One complete floral period, measured from the generated 1024px source.
// Avoid repeating the entire photograph (including its broad wear patches).
export const STUDY_PAPER_REPEAT=Object.freeze({left:128,top:640,width:276,height:358});
/** Make opposing sampler edges continuous once at load, without fragment-shader work.
 * The 5% smooth transition is confined to the boundary; interior motifs stay sharp.
 */
export function softenRepeatEdges(data,width,height){
  const band=Math.max(2,Math.round(Math.min(width,height)*.05));
  const smooth=x=>x*x*(3-2*x);
  function pair(a,b,mix){
    for(let c=0;c<3;c++){
      const left=data[a+c],right=data[b+c];
      data[a+c]=Math.round(left*(1-mix)+right*mix);
      data[b+c]=Math.round(right*(1-mix)+left*mix);
    }
  }
  for(let y=0;y<height;y++)for(let d=0;d<band;d++){
    pair((y*width+d)*4,(y*width+width-1-d)*4,.5*(1-smooth(d/(band-1))));
  }
  for(let x=0;x<width;x++)for(let d=0;d<band;d++){
    pair((d*width+x)*4,((height-1-d)*width+x)*4,.5*(1-smooth(d/(band-1))));
  }
  return data;
}
export function prepareStudyWallpaper(texture){
  const image=texture.image;if(!image?.width||!image?.height)return;
  const repeat=STUDY_PAPER_REPEAT,scaleX=image.width/1024,scaleY=image.height/1024;
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(repeat.width*scaleX);canvas.height=Math.round(repeat.height*scaleY);
  const context=canvas.getContext('2d');
  context.drawImage(image,repeat.left*scaleX,repeat.top*scaleY,repeat.width*scaleX,repeat.height*scaleY,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  softenRepeatEdges(pixels.data,canvas.width,canvas.height);context.putImageData(pixels,0,0);
  texture.image=canvas;texture.needsUpdate=true;
  texture.userData.studyContinuousEdges=true;
}
