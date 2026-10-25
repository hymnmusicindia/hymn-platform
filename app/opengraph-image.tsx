import { ImageResponse } from 'next/og';
export const alt='HYMN Music — music distribution, beats and artist services';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function OpenGraphImage(){return new ImageResponse(
  <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'70px 80px',background:'linear-gradient(135deg,#101620,#202e46)',color:'#f4f6fa',fontFamily:'sans-serif'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:54,fontWeight:800,letterSpacing:'-3px'}}>HYMN</span><span style={{fontSize:20,color:'#b8c9df'}}>MUSIC. MOVING FORWARD.</span></div>
    <div style={{display:'flex',flexDirection:'column',gap:20}}><span style={{fontSize:76,fontWeight:700,letterSpacing:'-4px'}}>Your music. Your next move.</span><span style={{fontSize:28,color:'#b8c9df'}}>Distribution · Beats · Mixing & mastering</span></div>
    <div style={{display:'flex',borderTop:'1px solid #7186a155',paddingTop:22,fontSize:20,color:'#b8c9df'}}>The workspace for independent artists and producers.</div>
  </div>,size);}
