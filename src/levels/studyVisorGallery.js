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
function diagram(hidden) {
  const [image,ctx]=canvas(512,768);stock(ctx,512,768);
  ctx.strokeStyle='#73624d';ctx.lineWidth=1;ctx.strokeRect(25,25,462,718);
  ctx.fillStyle='#594835';ctx.textAlign='center';ctx.font='19px Georgia';ctx.fillText('FIELD OBSERVATIONS · 1889',256,58);
  ctx.font='11px Georgia';ctx.fillText('ARCHIVE / STUDY OF CORRESPONDENCES',256,80);
  if(hidden){
    const entries=[['triangle',.23,.23],['eye',.62,.20],['crescent',.82,.30],['diamond',.22,.47],['bars',.70,.44],['square',.45,.36],['rune',.80,.66],['cross',.23,.68],['circle',.43,.79],['spiral',.70,.86],['chevron',.48,.58]];
    // A faint research route winds through the three true symbols only.
    ctx.strokeStyle='#795047';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();
    ctx.moveTo(118,177);ctx.bezierCurveTo(230,125,239,339,358,338);ctx.bezierCurveTo(430,458,215,470,220,607);ctx.stroke();ctx.setLineDash([]);
    for(const [type,x,y] of entries) glyph(ctx,type,x*512,y*768,49);
    ctx.strokeStyle='#795047';ctx.lineWidth=1.4;
    for(const [x,y,n] of [[.23,.23,'I'],[.70,.44,'II'],[.43,.79,'III']]){ctx.beginPath();ctx.ellipse(x*512,y*768,36,40,.1,0,Math.PI*2);ctx.stroke();ctx.fillText(n,x*512+40,y*768-31);}
  }else{
    // Ordinary archival plan: rooms, survey marks, handwritten measurements.
    ctx.strokeStyle='#74634e';ctx.lineWidth=2;ctx.strokeRect(100,180,310,390);
    for(const [x,y,w,h] of [[110,190,110,140],[240,190,155,140],[110,350,170,200],[300,350,95,200]])ctx.strokeRect(x,y,w,h);
    ctx.lineWidth=1;
    for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(65,145+i*52);ctx.lineTo(440,145+i*52);ctx.stroke();}
    ctx.font='italic 13px Georgia';ctx.fillText('North wing · records & specimens',256,125);
    ctx.font='12px Georgia';ctx.fillText('Ground survey / revised plate VII',256,610);
    for(let i=0;i<5;i++)ctx.fillText(['Window elevation / 14 ft.','Original measurements retained','Section B · private collection','Observations entered by hand','Compare with the surviving plates'][i],256,645+i*16);
  }
  return texture(image);
}
export function createVisorGallery({group, wood, brass, loftY}) {
  const atlas=new THREE.TextureLoader().load(photoUrl);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=2;
  const photoMaterial=new THREE.MeshStandardMaterial({map:atlas,color:0xd1c1a9,roughness:.96});
  const [symbolImage,ctx]=canvas(512,512);
  symbols.forEach((name,i)=>{ctx.save();ctx.beginPath();ctx.rect(i%4*128,Math.floor(i/4)*128,128,128);ctx.clip();ctx.translate(i%4*128,Math.floor(i/4)*128);stock(ctx,128,128);glyph(ctx,name,64,64,79);ctx.restore();});
  const symbolMaterial=new THREE.MeshStandardMaterial({map:texture(symbolImage),roughness:1});
  const frameGeometry=new RoundedBoxGeometry(1,1,1,1,.08);
  const standGeometry=new THREE.BoxGeometry(1,1,1);
  const trim=new THREE.Group();trim.name='Antique_Gallery_Frames';trim.userData.studyStaticDetails=true;group.add(trim);
  const contents=[], targets=[];
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
    if(layout.target>=0)targets[layout.target]={position:root.position.clone(),width:layout.width,height:layout.height};
  });
  picture(2.30,2.80,[3.35,2.02,6.41],Math.PI,new THREE.PlaneGeometry(1,1),new THREE.PlaneGeometry(1,1),
    new THREE.MeshStandardMaterial({map:diagram(false),roughness:1}),new THREE.MeshStandardMaterial({map:diagram(true),roughness:1}));
  return {targets,setVisor(on){for(const c of contents){c.image.geometry=on?c.hiddenGeometry:c.photoGeometry;c.image.material=on?c.hiddenMaterial:c.normalMaterial;}}};
}
