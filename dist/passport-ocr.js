import {parsePassport,passportNeedsRetry} from './parser.js?v=3684b54660747a0f85433c14dfc8a3ac6c76161316cd6867f1ff49fd377ff7b3';

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
// One worker per read, bounded sequential retries. Nothing is uploaded or logged.
export async function recognizePassport(canvas,worker,onRetry=()=>{},source=canvas){
 const run=async(surface,mode,whitelist='',rectangle,rotateAuto=true)=>{
  await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  return (await worker.recognize(surface,rectangle?{rectangle}:{rotateAuto})).data.text||'';
 };
 const attempts=[];let enhanced,blue,machineLines='';
 try{
  attempts.push(await run(canvas,'3'));
  if(passportNeedsRetry(attempts[0])){
   onRetry('Checking passport again with enhanced contrast…');
   enhanced=document.createElement('canvas');enhanced.width=canvas.width;enhanced.height=canvas.height;
   const ctx=enhanced.getContext('2d');ctx.filter='grayscale(1) contrast(1.35)';ctx.drawImage(canvas,0,0);
   attempts.push(await run(enhanced,'6'));
   // Work from native pixels: enlarging an already enlarged scan loses fine
   // strokes. A blue-channel pass suppresses cyan security backgrounds.
   if(attempts.every(passportNeedsRetry)&&Math.min(source.width,source.height)>=32&&Math.max(source.width,source.height)<=800){
    onRetry('Checking the small passport image with reduced background colour…');
    blue=prepareBlue(source);
    attempts.push(await run(blue,'3','',undefined,false));
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
     const mrz=(result.data.text||'').split(/\r?\n/).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x)).join('\n');
     if(mrz)machineLines=[machineLines,mrz].filter(Boolean).join('\n');
    }
   }
   // Landscape TD3 pages commonly place the photograph on the left and MRZ
   // at the bottom. Isolate the printed details when full-page OCR is weak.
   // Keep this as another candidate, never a replacement for the full page.
   const ratio=canvas.width/canvas.height;
   if(attempts.every(passportNeedsRetry)&&((ratio>=1.1&&ratio<=1.8)||(ratio>=.55&&ratio<=1))){
    onRetry('Checking the printed passport details…');
    const left=Math.floor(canvas.width*.30),top=0,bottom=Math.ceil(canvas.height*(ratio<=1?.44:.75));
    attempts.push(await run(enhanced,'6','',{left,top,width:canvas.width-left,height:bottom-top}));
   }
  }
  attempts.sort((a,b)=>score(b)-score(a));
  // Preserve MRZ candidates for conflict checks; fill missing visual fields only
  // from passes corroborated by all three identity fields.
  const mrz=attempts.slice(1).flatMap(x=>x.split(/\r?\n/)).map(x=>x.replace(/\s/g,'')).filter(x=>/^P<[A-Z0-9]{3}/.test(x)||/^[A-Z0-9<]{44}$/.test(x));
  return [recoveredVisualFields(attempts),attempts[0],...mrz,machineLines].filter(Boolean).join('\n');
 }finally{
  if(enhanced){enhanced.width=0;enhanced.height=0;}
  if(blue){blue.width=0;blue.height=0;}
  await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'0'});
 }
}
