import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import photoUrl from '../assets/textures/study/archive_gallery_photos.jpg?url';
import mapArtUrl from '../assets/textures/study/project_hollow_observation_map.png?url';

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
function mapVisorOverlay() {
  // Half-resolution coordinates align with the supplied 1536x1024 catalogue.
  const [image,ctx]=canvas(768,512);
  for(const [id,x,y] of [[0,545,125],[1,655,243],[2,545,355.5]]){
    // Visor annotations resolve these three printed variants into the exact
    // bookshelf glyphs. The supplied normal-view artwork is never modified.
    const frost=ctx.createRadialGradient(x,y,25,x,y,32);
    frost.addColorStop(0,'rgba(200,215,207,.98)');frost.addColorStop(1,'rgba(200,215,207,0)');
    ctx.fillStyle=frost;ctx.fillRect(x-32,y-32,64,64);
    glyph(ctx,symbols[id],x,y,48);
  }
  ctx.strokeStyle='rgba(203,232,235,.95)';ctx.fillStyle='rgba(203,232,235,.95)';ctx.lineWidth=2;
  // Follow catalogue gutters rather than running the path across decoy glyphs.
  ctx.beginPath();ctx.moveTo(563,125);ctx.lineTo(573,125);ctx.lineTo(573,155);
  ctx.lineTo(628,155);ctx.lineTo(628,213);ctx.lineTo(655,213);ctx.lineTo(655,225);ctx.stroke();
  ctx.beginPath();ctx.moveTo(655,261);ctx.lineTo(655,273);ctx.lineTo(573,273);ctx.lineTo(573,355.5);ctx.lineTo(563,355.5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(655,225);ctx.lineTo(651,219);ctx.lineTo(659,219);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(563,355.5);ctx.lineTo(569,351.5);ctx.lineTo(569,359.5);ctx.closePath();ctx.fill();
  for(const [x,y] of [[545,125],[655,243],[545,355.5]]){ctx.beginPath();ctx.ellipse(x,y,20,21,.08,0,Math.PI*2);ctx.stroke();}
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
  const mapArt=new THREE.TextureLoader().load(mapArtUrl);
  mapArt.colorSpace=THREE.SRGBColorSpace;mapArt.anisotropy=4;
  mapArt.magFilter=THREE.LinearFilter;mapArt.minFilter=THREE.LinearMipmapLinearFilter;
  const mapMaterial=new THREE.MeshStandardMaterial({map:mapArt,roughness:.98});
  // Inner aperture 4.2 x 2.8 preserves the supplied artwork's exact 3:2 aspect.
  const mapBoard=picture(4.225,2.825,[4.70,2.02,6.41],Math.PI,new THREE.PlaneGeometry(1,1),new THREE.PlaneGeometry(1,1),mapMaterial,mapMaterial);
  mapBoard.name='Project_Hollow_Observation_Map';
  const mapOverlay=new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.8),
    new THREE.MeshBasicMaterial({map:mapVisorOverlay(),transparent:true,depthWrite:false}));
  mapOverlay.name='Project_Hollow_Visor_Route';mapOverlay.position.z=.016;mapOverlay.visible=false;mapBoard.add(mapOverlay);
  // A single local, shadowless picture light; room lighting remains untouched.
  const pictureLight=new THREE.Group();pictureLight.name='Project_Hollow_Picture_Light';
  pictureLight.position.set(4.70,3.57,6.475);pictureLight.rotation.y=Math.PI;group.add(pictureLight);
  pictureLight.userData.studyStaticDetails=true;
  function lightPart(w,h,d,x,y,z,material=brass){
    const part=new THREE.Mesh(frameGeometry,material);part.scale.set(w,h,d);part.position.set(x,y,z);pictureLight.add(part);
  }
  lightPart(.14,.10,.025,0,0,-.015);
  lightPart(.024,.024,.23,0,.015,.11);
  lightPart(1.10,.055,.09,0,.02,.23);
  const diffuser=new THREE.MeshBasicMaterial({color:0xffd6a0,toneMapped:false});
  lightPart(1.02,.008,.065,0,-.010,.235,diffuser);
  const warmLight=new THREE.SpotLight(0xffd6a0,1.3,3.2,.90,.9,2);
  warmLight.name='Project_Hollow_Map_Wash';warmLight.castShadow=false;
  warmLight.position.set(4.70,3.52,6.13);warmLight.target.position.set(4.70,2.45,6.40);
  group.add(warmLight,warmLight.target);
  return {targets,setVisor(on,progress=0,complete=false){
    for(const c of contents){c.image.geometry=on?c.hiddenGeometry:c.photoGeometry;c.image.material=on?c.hiddenMaterial:c.normalMaterial;}
    selectionBorders.forEach((border,index)=>{border.visible=!!on&&!complete&&index<progress;});
    mapOverlay.visible=!!on;
  }};
}
