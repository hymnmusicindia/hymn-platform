// Serializable browser helper: composite transparent backgrounds before comparing text.
function textContrast(element) {
  const rgba = value => {
    // color-mix computes to color(srgb ...) or oklab in modern browsers.
    // Let the browser convert those spaces instead of treating 0..1 as RGB bytes.
    if (/^(?:color|oklab|oklch|lab|lch)\(/.test(value)) {
      const canvas = document.createElement('canvas');canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');context.fillStyle = value;context.fillRect(0,0,1,1);
      const pixel = context.getImageData(0,0,1,1).data;return [pixel[0],pixel[1],pixel[2],pixel[3]/255];
    }
    const n = value.match(/[\d.]+/g)?.map(Number);return n && n.length >= 3 ? [n[0],n[1],n[2],n[3] ?? 1] : [0,0,0,0];
  };
  const blend = (a,b) => a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
  const luminance = c => c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const chain=[];for(let node=element;node;node=node.parentElement) {const style=getComputedStyle(node);chain.unshift({base:rgba(style.backgroundColor),gradient:style.backgroundImage.includes('gradient(')?[...style.backgroundImage.matchAll(/(?:rgba?|color|oklab|oklch|lab|lch)\([^)]+\)/g)].map(m=>rgba(m[0])):[]});}
  let backgrounds=[[255,255,255]];for(const layer of chain){backgrounds=backgrounds.map(b=>blend(layer.base,b));if(layer.gradient.length)backgrounds=backgrounds.flatMap(b=>layer.gradient.map(c=>blend(c,b))).slice(0,64);}
  const style=getComputedStyle(element);
  const candidates=backgrounds.map(background=>{const foreground=blend(rgba(style.color),background),a=luminance(foreground),b=luminance(background);return{ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color:style.color,background};});
  return candidates.reduce((a,b)=>a.ratio<b.ratio?a:b);
}
module.exports={textContrast};
