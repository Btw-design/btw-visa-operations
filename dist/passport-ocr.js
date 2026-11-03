import {recoverIdentityEvidence} from './ocr-identity-evidence.js?v=6f3fe9d0cb00612ae40583b7fee3356b87fa6cd4b90b8868d177d6265ed0aaf5';
import {recoverOcrFields} from './ocr-field-recovery.js?v=5e78f35104c952684724414a2af6dd6e581718919e132f0a9e0115ddee2fea2f';
import {parsePassport,passportNeedsRetry} from './parser.js?v=c1fe8a9876cf76a857aa729dd4a4d7e5c1d9187ad0d1208559e31a97f38f09cf';

// Background suppression and separable Lanczos resampling for small scans.
function prepareBlue(source){
 const createCanvas=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;};
 const input=createCanvas(source.width,source.height),inputContext=input.getContext('2d');
 inputContext.fillStyle='white';inputContext.fillRect(0,0,input.width,input.height);inputContext.drawImage(source,0,0);
 const w=source.width,h=source.height,frame=inputContext.getImageData(0,0,w,h);
 input.width=0;input.height=0;
 const gray=new Uint8ClampedArray(w*h),hist=new Uint32Array(256);
 for(let i=0;i<gray.length;i++){gray[i]=frame.data[i*4+2];hist[gray[i]]++;}
 const cutoff=Math.floor(gray.length*.01);let low=0,high=255,total=0;
 while(low<254&&(total+=hist[low])<=cutoff)low++;
 total=0;while(high>low&&(total+=hist[high])<=cutoff)high--;
 for(let i=0;i<gray.length;i++)gray[i]=high>low?Math.floor(Math.max(0,Math.min(255,(gray[i]-low)*255/(high-low)))):gray[i];
 const scale=Math.min(3,2400/Math.max(w,h)),nw=Math.round(w*scale),nh=Math.round(h*scale);
 const sinc=x=>x===0?1:Math.sin(Math.PI*x)/(Math.PI*x);
 const weights=(n,m)=>Array.from({length:m},(_,i)=>{
  const center=(i+.5)*n/m-.5,items=[];let sum=0;
  for(let j=Math.max(0,Math.ceil(center-3));j<=Math.min(n-1,Math.floor(center+3));j++){
   const v=sinc(center-j)*sinc((center-j)/3);items.push([j,v]);sum+=v;
  }
  return items.map(([j,v])=>[j,v/sum]);
 });
 const wx=weights(w,nw),wy=weights(h,nh),tmp=new Uint8ClampedArray(nw*h),resized=new Uint8ClampedArray(nw*nh);
 for(let y=0;y<h;y++)for(let x=0;x<nw;x++)tmp[y*nw+x]=wx[x].reduce((s,[j,v])=>s+gray[y*w+j]*v,0);
 for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)resized[y*nw+x]=wy[y].reduce((s,[j,v])=>s+tmp[j*nw+x]*v,0);
 const kernel=[.004433048,.05400558,.24203623,.39905028,.24203623,.05400558,.004433048],blurX=new Float32Array(nw*nh),blur=new Float32Array(nw*nh);
 for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)for(let k=-3;k<=3;k++)blurX[y*nw+x]+=resized[y*nw+Math.max(0,Math.min(nw-1,x+k))]*kernel[k+3];
 for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)for(let k=-3;k<=3;k++)blur[y*nw+x]+=blurX[Math.max(0,Math.min(nh-1,y+k))*nw+x]*kernel[k+3];
 const canvas=createCanvas(nw,nh),ctx=canvas.getContext('2d'),out=ctx.createImageData(nw,nh);
 for(let i=0;i<resized.length;i++){
  const d=resized[i]-blur[i],v=Math.abs(d)>3?resized[i]+1.4*d:resized[i];
  out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v;out.data[i*4+3]=255;
 }
 ctx.putImageData(out,0,0);return canvas;
}

// Adaptive thresholding on the MRZ region only.
function prepareMrzBand(source,topFraction,bottomFraction){
 const w=source.width,h=source.height;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<120||h<120)return null;
 const top=Math.floor(h*topFraction),height=Math.max(1,Math.ceil(h*bottomFraction)-top);
 const scale=Math.min(2.5,2200/w,1050/height);
 if(scale<=0)return null;
 const nw=Math.max(1,Math.round(w*scale)),nh=Math.max(1,Math.round(height*scale));
 const canvas=document.createElement('canvas');canvas.width=nw;canvas.height=nh;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx||typeof ctx.getImageData!=='function'){canvas.width=canvas.height=0;return null;}
 try{
  ctx.fillStyle='white';ctx.fillRect(0,0,nw,nh);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(source,0,top,w,height,0,0,nw,nh);
  const pixels=ctx.getImageData(0,0,nw,nh),data=pixels.data;
  const stride=nw+1,integral=new Float64Array(stride*(nh+1));
  for(let y=0;y<nh;y++){
   let row=0;
   for(let x=0;x<nw;x++){
    const i=(y*nw+x)*4;
    const luminance=(77*data[i]+150*data[i+1]+29*data[i+2])>>8;
    row+=luminance;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    data[i]=data[i+1]=data[i+2]=luminance;
   }
  }
  const radius=Math.max(9,Math.min(32,Math.round(nw/85)));
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
   const x0=Math.max(0,x-radius),x1=Math.min(nw-1,x+radius),y0=Math.max(0,y-radius),y1=Math.min(nh-1,y+radius);
   const local=(integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0])/((x1-x0+1)*(y1-y0+1));
   const i=(y*nw+x)*4,v=data[i]<Math.min(235,local-12)?0:255;
   data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);return canvas;
 }catch(e){canvas.width=canvas.height=0;return null;}
}

function score(text){const p=parsePassport(text);return ['passport','given','surname','dob','issued','expiry','sex','nationality','birthplace','birthstate','issueplace'].reduce((n,k)=>n+(p[k]?1:0),0);}
// Recover missing visual fields only when both passes identify the same passport.
// MRZ does not contain an issue date, so a better visual pass still matters.
function recoveredVisualFields(attempts){
 const parsed=attempts.map(parsePassport),primary=parsed[0],identity=['passport','dob','expiry'];
 if(identity.some(k=>!primary[k]))return '';
 if(parsed.some(p=>identity.some(k=>p[k]&&p[k]!==primary[k])))return '';
 const matching=parsed.filter(p=>identity.every(k=>p[k]===primary[k]));
 const labels={given:'Given Names',surname:'Surname',issued:'Date of Issue',birthplace:'Place of Birth',issueplace:'Place of Issue'};
 return Object.entries(labels).flatMap(([key,label])=>{
  if(primary[key]&&!(key==='birthplace'&&!primary.birthstate))return [];
  const sources=key==='birthplace'?matching.filter(p=>p.birthstate&&(!primary.birthplace||p.birthplace===primary.birthplace)):matching;
  const values=[...new Set(sources.map(p=>key==='birthplace'&&p[key]?[p[key],p.birthstate].filter(Boolean).join(', '):p[key]).filter(Boolean))];
  if(values.length!==1)return [];
  const value=key==='issued'?values[0].split('-').reverse().join('/'):values[0];
  return [`${label}: ${value}`];
 }).join('\n');
}
// Shared by the browser reader and the website's PaddleOCR gateway.
export function combinePassportPasses(attempts,machineLines='',focusedPasses=[]){
 const ordered=attempts.filter(Boolean).slice().sort((a,b)=>score(b)-score(a));
 if(!ordered.length)return machineLines;
 const parsed=ordered.map(parsePassport);
 const focused=focusedPasses.map(parsePassport);
 // A cropped scan may find a printed field that full-page OCR missed.
 // Only incorporate unanimously consistent values and never merge identities
 // belonging to two different passports.
 const numbers=new Set(parsed.map(p=>p.passport).filter(Boolean));
 const dates=new Set(parsed.map(p=>p.dob).filter(Boolean));
 const expiries=new Set(parsed.map(p=>p.expiry).filter(Boolean));
 const conflicting=numbers.size>1||dates.size>1||expiries.size>1;
 const names={surname:'Surname',given:'Given Names',passport:'Passport No',dob:'Date of Birth',issued:'Date of Issue',expiry:'Date of Expiry',birthplace:'Place of Birth',issueplace:'Place of Issue',nationality:'Nationality',sex:'Sex'};
 const recovered=[];
 if(!conflicting&&focused.length){
  for(const [key,label]of Object.entries(names)){
   if(parsed[0][key])continue;
   const values=[...new Set(focused.map(p=>p[key]).filter(Boolean))];
   if(values.length!==1)continue;
   let value=values[0];
   if(['dob','issued','expiry'].includes(key))value=value.split('-').reverse().join('/');
   if(key==='birthplace'&&focused.some(p=>p.birthplace===values[0]&&p.birthstate)){
    const states=[...new Set(focused.filter(p=>p.birthplace===values[0]).map(p=>p.birthstate).filter(Boolean))];
    if(states.length===1)value+=', '+states[0];
   }
   recovered.push(label+': '+value);
  }
 }
 const corroborated=recoverOcrFields([...attempts,...focusedPasses]);
 const mrz=ordered.slice(1).flatMap(x=>x.split(/\r?\n/)).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||(/^[A-Z0-9<]{28,44}$/.test(x)&&/[FM<]/.test(x[20])));
 const combined=[
  corroborated.lines,
  recovered.join('\n'),
  recoveredVisualFields(ordered),
  ordered[0],
  ...mrz,
  machineLines
 ].filter(Boolean).join('\n');
 const accepted=parsePassport(combined);
 const verified=recoverIdentityEvidence([...attempts,...focusedPasses],accepted);
 const labels={dob:'Date of Birth',sex:'Sex',issueplace:'Place of Issue',issuecountry:'Country of Issue'};
 const extra=Object.entries(verified).map(([key,value])=>{
  if(key==='dob')value=value.split('-').reverse().join('/');
  return labels[key]+': '+value;
 }).join('\n');
 return [extra,combined].filter(Boolean).join('\n');
}
// One worker per read, bounded sequential retries. Nothing is uploaded or logged.
export async function recognizePassport(canvas,worker,onRetry=()=>{},source=canvas,onDebug=()=>{}){
 const run=async(surface,mode,whitelist='',rectangle,rotateAuto=true,label='ocr-pass')=>{
  await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const raw=(await worker.recognize(surface,rectangle?{rectangle}:{rotateAuto})).data.text||'';
  onDebug({stage:label,mode,rectangle:rectangle||null,imageWidth:surface.width,imageHeight:surface.height,raw,parsed:parsePassport(raw)});
  return raw;
 };
 const attempts=[];let enhanced,blue,machineLines='';const extraSurfaces=[],focusedPasses=[];
 try{
  attempts.push(await run(canvas,'3','',undefined,true,'01-original-full-page'));
  if(passportNeedsRetry(attempts[0])){
   onRetry('Checking passport again with enhanced contrast…');
   enhanced=document.createElement('canvas');enhanced.width=canvas.width;enhanced.height=canvas.height;
   const ctx=enhanced.getContext('2d');ctx.filter='grayscale(1) contrast(1.35)';ctx.drawImage(canvas,0,0);
   attempts.push(await run(enhanced,'6','',undefined,true,'02-contrast-full-page'));
   // Work from native pixels: enlarging an already enlarged scan loses fine
   // strokes. A blue-channel pass suppresses cyan security backgrounds.
   if(attempts.every(passportNeedsRetry)&&Math.min(source.width,source.height)>=32&&Math.max(source.width,source.height)<=800){
    onRetry('Checking the small passport image with reduced background colour…');
    blue=prepareBlue(source);
    attempts.push(await run(blue,'3','',undefined,false,'03-blue-channel'));
   }
   if(attempts.every(passportNeedsRetry)){
    onRetry('Checking the machine-readable passport lines…');
    await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',preserve_interword_spaces:'0'});
    const bands=[{left:0,top:Math.floor(canvas.height*.55),width:canvas.width,height:canvas.height-Math.floor(canvas.height*.55)}];
    // A front and address page may be stacked in one image. The first page's
    // MRZ then sits near the middle, rather than at the bottom of the image.
    const ratio=canvas.width/canvas.height;
    if(ratio>=.55&&ratio<=1)bands.push({left:0,top:Math.floor(canvas.height*.35),width:canvas.width,height:Math.ceil(canvas.height*.20)});
    // Keep this pass separate from visual labels; it is only a candidate MRZ.
    for(const rectangle of bands){
     const result=await worker.recognize(enhanced,{rectangle});
     onDebug({stage:'04-mrz-rectangle',mode:'6',rectangle,imageWidth:enhanced.width,imageHeight:enhanced.height,raw:result.data.text||'',parsed:parsePassport(result.data.text||'')});
     const mrz=(result.data.text||'').split(/\r?\n/).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||(/^[A-Z0-9<]{28,44}$/.test(x)&&/[FM<]/.test(x[20]))).join('\n');
     if(mrz)machineLines=[machineLines,mrz].filter(Boolean).join('\n');
    }
   }
   // Recover machine-readable lines from security-patterned passport scans.
   if(attempts.every(passportNeedsRetry)&&source.width>=120&&source.height>=120){
    const aspect=source.width/source.height;
    const ranges=[[.68,1]];
    if(aspect>=.5&&aspect<=1)ranges.push([.32,.62]);
    for(const [start,end] of ranges){
     const band=prepareMrzBand(source,start,end);
     if(!band)continue;
     extraSurfaces.push(band);
     onRetry('Checking high-contrast passport machine-readable lines…');
     const extracted=await run(band,'6','ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',undefined,false,'05-adaptive-mrz-band');
     const mrz=extracted.split(/\r?\n/).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||(/^[A-Z0-9<]{28,44}$/.test(x)&&/[FM<]/.test(x[20]))).join('\n');
     if(mrz)machineLines=[machineLines,mrz].filter(Boolean).join('\n');
     if(mrz&&parsePassport(mrz).passport)break;
    }
   }
   // An Indian passport's security pattern can bury the right-side
   // printed fields. OCR the upper identity block and lower date block
   // separately so readable text is not lost in the full-page layout.
   if(attempts.every(passportNeedsRetry)&&canvas.width>=320&&canvas.height>=240&&Math.max(source.width,source.height)>800&&typeof enhanced?.getContext('2d')?.getImageData==='function'){
    onRetry('Checking passport number, names and printed dates…');
    const blocks=[
     {left:Math.floor(canvas.width*.30),top:Math.floor(canvas.height*.10),width:Math.ceil(canvas.width*.69),height:Math.ceil(canvas.height*.48)},
     {left:Math.floor(canvas.width*.37),top:Math.floor(canvas.height*.57),width:Math.ceil(canvas.width*.62),height:Math.ceil(canvas.height*.23)}
    ];
    for(const block of blocks){
     const text=await run(enhanced,'6','',block,false,'06-focused-printed-block');
     if(text.trim())focusedPasses.push(text);
    }
   }
   // Landscape TD3 pages commonly place the photograph on the left and MRZ
   // at the bottom. Isolate the printed details when full-page OCR is weak.
   // Keep this as another candidate, never a replacement for the full page.
   const ratio=canvas.width/canvas.height;
   if(attempts.every(passportNeedsRetry)&&((ratio>=1.1&&ratio<=1.8)||(ratio>=.55&&ratio<=1))){
    onRetry('Checking the printed passport details…');
    const left=Math.floor(canvas.width*.30),top=0,bottom=Math.ceil(canvas.height*(ratio<=1?.44:.75));
    attempts.push(await run(enhanced,'6','',{left,top,width:canvas.width-left,height:bottom-top},true,'07-printed-details'));
   }
  }
  // Preserve MRZ candidates for conflict checks; fill missing visual fields only
  // from passes corroborated by all three identity fields.
  const combined=combinePassportPasses(attempts,machineLines,focusedPasses);
  onDebug({stage:'08-merged-ocr-text',raw:combined,parsed:parsePassport(combined)});
  return combined;
 }finally{
  if(enhanced){enhanced.width=0;enhanced.height=0;}
  if(blue){blue.width=0;blue.height=0;}
  for(const surface of extraSurfaces){surface.width=0;surface.height=0;}
  await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'0'});
 }
}
