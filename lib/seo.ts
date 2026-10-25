import type { Metadata } from 'next';
import { getPublicAppUrl } from './public-app-url';

export const privateRobots = { index:false, follow:false, googleBot:{index:false,follow:false} } as const;

export function publicPageMetadata(title:string, description:string, path:string, image?:string|null):Metadata {
  description=description.replace(/\s+/g,' ').trim().slice(0,160);
  const url=new URL(path,getPublicAppUrl()).href;
  const socialTitle=title.includes('HYMN')?title:`${title} | HYMN Music`;
  const validImage=image&&/^(https?:\/\/|\/(?!\/))/.test(image)?image:null;
  const images=[{url:validImage||'/opengraph-image',alt:title,...(!validImage?{width:1200,height:630}:{})}];
  return {title,description,alternates:{canonical:url},openGraph:{type:'website',siteName:'HYMN Music',locale:'en_IN',url,title:socialTitle,description,images},twitter:{card:'summary_large_image',title:socialTitle,description,images:images.map(item=>item.url)}};
}

export function jsonLd(value:unknown) { return JSON.stringify(value).replace(/</g,'\\u003c'); }

export function policyCanonicalPath(slug:string) {
  return slug==='privacy'?'/privacy-policy':slug==='terms'?'/terms-of-service':`/policies/${encodeURIComponent(slug)}`;
}

export function profileStructuredData(name:string,path:string,parentName:string,parentPath:string) {
  const origin=getPublicAppUrl(),url=new URL(path,origin).href;
  return {'@context':'https://schema.org','@graph':[
    {'@type':'WebPage','@id':`${url}#page`,url,name},
    {'@type':'BreadcrumbList',itemListElement:[{name:'HYMN Music',item:origin},{name:parentName,item:new URL(parentPath,origin).href},{name,item:url}].map((item,i)=>({'@type':'ListItem',position:i+1,...item}))}
  ]};
}
