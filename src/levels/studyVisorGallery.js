import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import photoUrl from '../assets/textures/study/archive_gallery_photos.jpg?url';

// Six 256px photographs share one atlas; glyphs share a second 4x4 atlas.
const symbols = ['triangle', 'bars', 'circle', 'diamond', 'crescent', 'eye', 'cross', 'square', 'spiral', 'chevron', 'rune'];
export const GALLERY_LAYOUT = Array.from({ length: 15 }, (_, index) => {
  const row = Math.floor(index / 5), col = index % 5;
  const height = [0.52, 0.46, 0.55, 0.43, 0.50][(col + row) % 5];
  return { x: [-2.35, -1.5, -0.65, 0.65, 1.85][col],
    y: [1.853, 1.018, 0.188][row] + height / 2 + 0.025,
    width: [0.50, 0.56, 0.46, 0.62, 0.54][(col + row) % 5], height,
    target: index === 0 ? 0 : index === 9 ? 1 : index === 14 ? 2 : -1 };
});
function canvas(width, height) {
  const image = document.createElement('canvas'); image.width = width; image.height = height;
  return [image, image.getContext('2d')];
}
function stock(ctx, w, h) {
  ctx.fillStyle = '#b8a585'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(64,41,24,.055)' : 'rgba(245,229,188,.07)';
    ctx.fillRect((i * 73) % w, (i * 109) % h, 2, 2);
  }
  const edge = ctx.createRadialGradient(w / 2, h / 2, w * .2, w / 2, h / 2, h * .7);
  edge.addColorStop(0, 'rgba(64,38,19,0)'); edge.addColorStop(1, 'rgba(64,38,19,.25)');
  ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
}
function glyph(ctx, type, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = '#3d352b'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  const line = points => {ctx.moveTo(...points[0]); points.slice(1).forEach(p=>ctx.lineTo(...p));};
  if (type === 'triangle') { line([[0,-36],[34,30],[-34,30],[0,-36]]); }
  else if (type === 'bars') { for (const a of [-24,0,24]) line([[a,-34],[a,34]]); }
  else if (type === 'circle') ctx.arc(0,0,34,0,Math.PI*2);
  else if (type === 'diamond') line([[0,-37],[30,0],[0,37],[-30,0],[0,-37]]);
  else if (type === 'square') ctx.rect(-29,-29,58,58);
  else if (type === 'cross') { line([[-30,0],[30,0]]); line([[0,-34],[0,34]]); }
  else if (type === 'chevron') { line([[-30,-22],[0,8],[30,-22]]); line([[-30,4],[0,34],[30,4]]); }
  else if (type === 'eye') {ctx.moveTo(-38,0);ctx.quadraticCurveTo(0,-42,38,0);ctx.quadraticCurveTo(0,42,-38,0);ctx.moveTo(12,0);ctx.arc(0,0,12,0,Math.PI*2);}
  else if (type === 'crescent') {ctx.arc(0,0,34,-Math.PI*.38,Math.PI*.38,true);ctx.quadraticCurveTo(-7,0,12,-32);}
  else if (type === 'spiral') {for(let i=0;i<100;i++){const t=i*.14,r=2+i*.32;i?ctx.lineTo(Math.cos(t)*r,Math.sin(t)*r):ctx.moveTo(r,0);}}
  else {line([[0,36],[0,-36],[28,-12],[0,6],[-26,-15]]);}
  ctx.stroke();ctx.restore();
}
function texture(image) {const map=new THREE.CanvasTexture(image);map.colorSpace=THREE.SRGBColorSpace;return map;}
function atlasGeometry(tile, columns, rows, crop=0) {
  const geometry = new THREE.PlaneGeometry(1, 1), uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i, ((tile%columns)+crop+uv.getX(i)*(1-crop*2))/columns,
    1-(Math.floor(tile/columns)+crop+(1-uv.getY(i))*(1-crop*2))/rows);
  return geometry;
}
// The catalogue uses the very same glyph IDs as the bookshelf targets.
const catalogue = [0,5,4,3,10,7,8,6,9,5,4,1,7,10,3,6,8,2,9,5];
function diagram(hidden) {
  const [image,ctx]=canvas(512,320);stock(ctx,512,320);
  ctx.strokeStyle='#6f5b42';ctx.lineWidth=.8;ctx.strokeRect(13,13,486,294);
  ctx.strokeRect(17,17,478,286);
  ctx.fillStyle='#493b2b';ctx.textAlign='left';ctx.font='19px Georgia';
  ctx.fillText('PROJECT HOLLOW',27,39);
  ctx.font='10px Georgia';ctx.fillText('SITE OBSERVATION MAP',28,54);
  ctx.textAlign='center';ctx.font='11px Georgia';ctx.fillText('SYMBOL CATALOGUE',413,65);
  // Faded survey grid, terrain contours, stream and a sketched estate.
  ctx.save();ctx.beginPath();ctx.rect(26,69,292,180);ctx.clip();
  ctx.strokeStyle='rgba(91,73,47,.15)';ctx.lineWidth=.5;
  for(let x=28;x<320;x+=24){ctx.beginPath();ctx.moveTo(x,69);ctx.lineTo(x,249);ctx.stroke();}
  for(let y=72;y<250;y+=24){ctx.beginPath();ctx.moveTo(26,y);ctx.lineTo(318,y);ctx.stroke();}
  ctx.strokeStyle='rgba(80,66,43,.32)';
  for(let contour=0;contour<18;contour++){
    ctx.beginPath();
    for(let x=25;x<=320;x+=3){
      const y=75+contour*10+Math.sin(x*.027+contour*.31)*12+Math.cos(x*.055-contour*.24)*5;
      x===25?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle='#76684e';ctx.lineWidth=1;
  for(const offset of [-2,2]){ctx.beginPath();ctx.moveTo(290+offset,74);ctx.bezierCurveTo(212,114,304,143,213+offset,177);ctx.bezierCurveTo(148,201,199,225,128+offset,254);ctx.stroke();}
  // Hatching and small trees give the grounds an engraved archival character.
  for(let i=0;i<95;i++){
    const x=32+(i*43%279),y=81+(i*67%160);
    if(x>114&&x<219&&y>112&&y<184)continue;
    ctx.strokeStyle='rgba(62,57,39,.50)';ctx.lineWidth=.6;ctx.beginPath();
    ctx.moveTo(x,y+5);ctx.lineTo(x,y-5);ctx.moveTo(x-3,y+1);ctx.lineTo(x,y-5);ctx.lineTo(x+3,y+1);ctx.stroke();
  }
  // Main house, research wing, roof tiles and measured garden paths.
  ctx.fillStyle='#ad9977';ctx.fillRect(127,139,65,35);ctx.fillRect(189,150,26,24);
  ctx.strokeStyle='#534934';ctx.lineWidth=1;ctx.strokeRect(127,139,65,35);ctx.strokeRect(189,150,26,24);
  ctx.beginPath();ctx.moveTo(120,140);ctx.lineTo(159,117);ctx.lineTo(199,140);ctx.closePath();ctx.stroke();
  ctx.beginPath();ctx.moveTo(188,150);ctx.lineTo(202,136);ctx.lineTo(219,150);ctx.stroke();
  ctx.strokeRect(149,153,12,21);ctx.strokeRect(174,123,5,14);
  for(const x of [133,169,181,196,206])ctx.strokeRect(x,147+(x>190?9:0),5,7);
  for(let row=0;row<4;row++){ctx.beginPath();ctx.moveTo(130+row*6,137-row*4);ctx.lineTo(188-row*6,137-row*4);ctx.stroke();}
  ctx.setLineDash([3,2]);ctx.beginPath();ctx.moveTo(155,177);ctx.lineTo(149,204);ctx.lineTo(99,222);ctx.moveTo(215,164);ctx.lineTo(240,172);ctx.stroke();ctx.setLineDash([]);
  ctx.font='italic 8px Georgia';ctx.textAlign='left';ctx.fillStyle='#5a4b37';
  ctx.fillText('North grounds',36,91);ctx.fillText('Research wing',205,192);ctx.fillText('Survey boundary / 1889',33,240);
  ctx.restore();
  // Compass, plate annotations and modest handling marks remain visible normally.
  ctx.strokeStyle='#66553c';ctx.lineWidth=.8;
  ctx.beginPath();ctx.arc(297,49,9,0,Math.PI*2);ctx.moveTo(297,35);ctx.lineTo(297,63);ctx.moveTo(283,49);ctx.lineTo(311,49);ctx.stroke();
  ctx.font='8px Georgia';ctx.textAlign='center';ctx.fillStyle='#51432f';ctx.fillText('N',297,31);
  ctx.textAlign='left';ctx.font='9px Georgia';ctx.fillText('FIELD NOTES',28,266);
  ctx.font='italic 8px Georgia';ctx.fillText('Marks recur across the grounds and surviving plates.',28,280);
  ctx.fillText('Compare specimens before entering the subject record.',28,292);
  for(const [x,y] of [[45,211],[309,282],[461,27]]){
    const stain=ctx.createRadialGradient(x,y,0,x,y,24);stain.addColorStop(0,'rgba(91,60,24,.09)');stain.addColorStop(1,'rgba(91,60,24,0)');ctx.fillStyle=stain;ctx.fillRect(x-24,y-24,48,48);
  }
  // Twenty catalogue entries; each true glyph occurs exactly once.
  ctx.strokeStyle='rgba(83,65,41,.45)';ctx.lineWidth=.6;
  for(let col=0;col<=4;col++){ctx.beginPath();ctx.moveTo(335+col*39,82);ctx.lineTo(335+col*39,282);ctx.stroke();}
  for(let row=0;row<=5;row++){ctx.beginPath();ctx.moveTo(335,82+row*40);ctx.lineTo(491,82+row*40);ctx.stroke();}
  catalogue.forEach((id,i)=>glyph(ctx,symbols[id],354.5+i%4*39,102+Math.floor(i/4)*40,24));
  if(hidden){
    // Follow catalogue gutters, so the route never passes through a decoy.
    ctx.strokeStyle='#814f40';ctx.fillStyle='#814f40';ctx.lineWidth=1.7;
    ctx.beginPath();ctx.moveTo(366,102);ctx.lineTo(374,102);ctx.lineTo(374,83);
    ctx.lineTo(490,83);ctx.lineTo(490,182);ctx.lineTo(483,182);ctx.stroke();
    ctx.beginPath();ctx.moveTo(471.5,194);ctx.lineTo(471.5,202);ctx.lineTo(413,202);ctx.lineTo(413,262);ctx.lineTo(405,262);ctx.stroke();
    for(const [x,y] of [[483,182],[405,262]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+5,y-3);ctx.lineTo(x+5,y+3);ctx.closePath();ctx.fill();}
    for(const id of [0,1,2]){
      const i=catalogue.indexOf(id),x=354.5+i%4*39,y=102+Math.floor(i/4)*40;
      ctx.beginPath();ctx.ellipse(x,y,16,17,.08,0,Math.PI*2);ctx.stroke();
    }
  }
  return texture(image);
}
export function createVisorGallery({group, wood, brass, loftY}) {
  const atlas=new THREE.TextureLoader().load(photoUrl);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=2;
  const photoMaterial=new THREE.MeshStandardMaterial({map:atlas,color:0xd1c1a9,roughness:.96});
  const [symbolImage,ctx]=canvas(512,512);
  symbols.forEach((name,i)=>{ctx.save();ctx.beginPath();ctx.rect(i%4*128,Math.floor(i/4)*128,128,128);ctx.clip();ctx.translate(i%4*128,Math.floor(i/4)*128);ctx.fillStyle='#c5bcaa';ctx.fillRect(0,0,128,128);glyph(ctx,name,64,64,79);ctx.restore();});
  const symbolMaterial=new THREE.MeshStandardMaterial({map:texture(symbolImage),roughness:1});
  const frameGeometry=new RoundedBoxGeometry(1,1,1,1,.08);
  const standGeometry=new THREE.BoxGeometry(1,1,1);
  const trim=new THREE.Group();trim.name='Antique_Gallery_Frames';trim.userData.studyStaticDetails=true;group.add(trim);
  const contents=[], targets=[], selectionBorders=[];
  const selectionMaterial=new THREE.MeshBasicMaterial({color:0xcce5eb,toneMapped:false});
  function selectionBorder(width,height) {
    const outerW=width/2+.022,outerH=height/2+.022;
    const innerW=width/2+.006,innerH=height/2+.006;
    const shape=new THREE.Shape();shape.moveTo(-outerW,-outerH);shape.lineTo(outerW,-outerH);
    shape.lineTo(outerW,outerH);shape.lineTo(-outerW,outerH);shape.closePath();
    const hole=new THREE.Path();hole.moveTo(-innerW,-innerH);hole.lineTo(-innerW,innerH);
    hole.lineTo(innerW,innerH);hole.lineTo(innerW,-innerH);hole.closePath();shape.holes.push(hole);
    const border=new THREE.Mesh(new THREE.ShapeGeometry(shape),selectionMaterial);
    border.name='Visor_Selected_Frame_Border';border.position.z=.034;border.visible=false;
    return border;
  }
  function picture(width,height,position,yaw,photoGeometry,hiddenGeometry,normalMaterial=photoMaterial,hiddenMaterial=symbolMaterial,freestanding=false){
    const root=new THREE.Group();root.position.set(...position);root.rotation.y=yaw;
    if(freestanding){
      const lean=0.07; // Four degrees, towards the shelf backing.
      root.rotation.x=-lean;
      root.position.y+=(height/2+.025)*(Math.cos(lean)-1)+.030*Math.sin(lean);
      const backing=new THREE.Mesh(standGeometry,wood);
      backing.scale.set(width-.025,height-.025,.009);backing.position.z=-.025;root.add(backing);
      const shelfY=position[1]-height/2-.025;
      const inverse=root.quaternion.clone().invert();
      const foot=new THREE.Vector3(0,shelfY+.012-root.position.y,-.16).applyQuaternion(inverse);
      const attachment=new THREE.Vector3(0,height*.20,-.035);
      const leg=new THREE.Mesh(standGeometry,wood),direction=attachment.clone().sub(foot);
      leg.scale.set(.028,direction.length(),.012);
      leg.position.copy(attachment).add(foot).multiplyScalar(.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());root.add(leg);
      const pad=new THREE.Mesh(standGeometry,wood);
      pad.scale.set(.065,.012,.035);
      pad.position.set(0,shelfY+.006-root.position.y,-.16).applyQuaternion(inverse);
      pad.quaternion.copy(inverse);root.add(pad);
    }
    trim.add(root);
    // The 4 rails are merged into the shared trim batches below.
    for(const [x,y,w,h] of [[-width/2,0,.035,height+.05],[width/2,0,.035,height+.05],[0,-height/2,width,.035],[0,height/2,width,.035]]){
      const rail=new THREE.Mesh(frameGeometry,wood);rail.position.set(x,y,0);rail.scale.set(w,h,.042);root.add(rail);
      const lip=new THREE.Mesh(frameGeometry,brass);lip.position.set(x*.97,y*.97,.024);lip.scale.set(w*.35,h*.96,.007);if(h===.035)lip.scale.set(w*.96,.006,.007);root.add(lip);
    }
    const image=new THREE.Mesh(photoGeometry,normalMaterial);image.scale.set(width-.025,height-.025,1);image.position.z=.012;root.add(image);
    contents.push({image,photoGeometry,hiddenGeometry,normalMaterial,hiddenMaterial});
    // Flatten only the fixed frame rails for the existing detail batcher.
    root.updateMatrix();for(const mesh of [...root.children])if(mesh!==image){mesh.updateMatrix();mesh.applyMatrix4(root.matrix);root.remove(mesh);trim.add(mesh);}
    return root;
  }
  let decoy=0;
  GALLERY_LAYOUT.forEach((layout,i)=>{
    const symbol=layout.target>=0?layout.target:3+(decoy++%8);
    const root=picture(layout.width,layout.height,[layout.x,loftY+layout.y,-6.07],0,
      atlasGeometry((i*5+Math.floor(i/5))%6,3,2,.015+(i%3)*.012),atlasGeometry(symbol,4,4,.025),photoMaterial,symbolMaterial,true);
    root.name=layout.target>=0?`Archive_Photo_Target_${layout.target+1}`:`Archive_Photo_Decoy_${decoy}`;
    if(layout.target>=0){
      targets[layout.target]={position:root.position.clone(),width:layout.width,height:layout.height};
      const border=selectionBorder(layout.width,layout.height);root.add(border);selectionBorders[layout.target]=border;
    }
  });
  picture(4.225,2.65,[4.35,2.02,6.41],Math.PI,new THREE.PlaneGeometry(1,1),new THREE.PlaneGeometry(1,1),
    new THREE.MeshStandardMaterial({map:diagram(false),roughness:1}),new THREE.MeshStandardMaterial({map:diagram(true),roughness:1}));
  return {targets,setVisor(on,progress=0,complete=false){
    for(const c of contents){c.image.geometry=on?c.hiddenGeometry:c.photoGeometry;c.image.material=on?c.hiddenMaterial:c.normalMaterial;}
    selectionBorders.forEach((border,index)=>{border.visible=!!on&&!complete&&index<progress;});
  }};
}
