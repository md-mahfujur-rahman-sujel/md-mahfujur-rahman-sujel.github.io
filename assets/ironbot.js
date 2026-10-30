(function(){
var root=document.getElementById('flyer'),btn=document.getElementById('flyer-btn');
if(!root||!btn){return;}
var svg=btn.querySelector('svg'),shade=btn.querySelector('.flyer-shadow');
if(!svg||!shade){return;}
var flames=btn.querySelectorAll('.sk-flame');
var reduce=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
var compactQuery=window.matchMedia?window.matchMedia('(max-width:900px)'):null;
var W=window.innerWidth,H=window.innerHeight,compact=compactQuery?compactQuery.matches:W<=900;
var pos={x:W*0.78,y:H*0.62},vel={x:0,y:0},target={x:pos.x,y:pos.y},mouse={x:W/2,y:H/2};
var mode='roam',leg=null,face=0,last=null,raf=0,pauseUntil=0,sparkAt=0,enabled=true,autoOff=false;
var scrolling=false,scrollTimer=0,slowTime=0,slowFrames=0,drag=null,suppressClick=false;
var particles=[],spin=null,bounds={},dockHeight=56,dockTop=H-56;
var touchAction=btn.style.touchAction;
var prevX=pos.x,prevY=pos.y,driftX=0;
function rnd(a,b){return a+Math.random()*(b-a);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function reduced(){return reduce.matches||document.documentElement.dataset.motion==='reduced';}
function isOn(){return enabled&&!autoOff&&!reduced();}
function explorerOpen(){var dialog=document.getElementById('explorer');return !!(dialog&&dialog.open);}
function blocked(){return document.hidden||scrolling||explorerOpen();}
function canRun(){return isOn()&&!blocked()&&!drag;}
function resetClock(){last=null;slowTime=0;slowFrames=0;pauseUntil=0;}
function constrain(){
  var x=clamp(pos.x,bounds.left,bounds.right),y=clamp(pos.y,bounds.top,bounds.bottom);
  if(x!==pos.x){vel.x=0;}
  if(y!==pos.y){vel.y=0;}
  pos.x=x;pos.y=y;
  target.x=clamp(target.x,bounds.left,bounds.right);
  target.y=clamp(target.y,bounds.top,bounds.bottom);
}
function measure(){
  W=window.innerWidth;H=window.innerHeight;
  if(compact){
    var dock=document.querySelector('.mobile-dock');
    dockTop=H-dockHeight;
    if(dock){
      var rect=dock.getBoundingClientRect();
      var padding=parseFloat(window.getComputedStyle(dock).paddingBottom)||0;
      // A translated-away dock still reserves its height, including the safe area.
      dockHeight=rect.height?Math.max(56+padding,rect.height):Math.max(dockHeight,56+padding);
      dockTop=Math.min(H-dockHeight,rect.height?rect.top:H-dockHeight);
    }
    bounds.left=Math.min(48,W/2);bounds.right=Math.max(bounds.left,W-48);
    bounds.bottom=Math.max(48,dockTop-54);bounds.top=Math.max(48,bounds.bottom-12);
  }else{
    bounds.left=Math.min(48,W/2);bounds.right=Math.max(bounds.left,W-48);
    bounds.top=Math.min(66,H/2);bounds.bottom=Math.max(bounds.top,H-66);
  }
  constrain();
}
function ease(p){return p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;}
// One leg = a gentle quadratic arc from the current spot to a destination. The
// arc length and duration are tied to distance, so glides always share a pace.
function startLeg(x,y,t){
  var dx=x-pos.x,dy=y-pos.y,dist=Math.hypot(dx,dy);
  if(dist<1){leg=null;return;}
  var bend=rnd(compact?-10:-60,compact?10:60)*(dist>60?1:0);
  var cx=clamp((pos.x+x)/2-(dy/dist)*bend,bounds.left,bounds.right);
  var cy=clamp((pos.y+y)/2+(dx/dist)*bend,bounds.top,bounds.bottom);
  leg={x0:pos.x,y0:pos.y,x1:x,y1:y,cx:cx,cy:cy,t0:t,
       dur:clamp(dist/(compact?0.095:0.15),compact?1100:1500,compact?4200:6400)};
}
function pick(t){
  var min=compact?80:200,x=0,y=0;
  for(var i=0;i<8;i++){
    x=compact?rnd(bounds.left,bounds.right):rnd(70,Math.max(120,W-70));
    y=compact?rnd(bounds.top,bounds.bottom):rnd(110,Math.max(160,H-90));
    x=clamp(x,bounds.left,bounds.right);y=clamp(y,bounds.top,bounds.bottom);
    if(Math.hypot(x-pos.x,y-pos.y)>=min){break;}
  }
  target.x=x;target.y=y;
  startLeg(x,y,t);
}
function place(){root.style.transform='translate3d('+(pos.x-(compact?22:29)).toFixed(1)+'px,'+(pos.y-(compact?37:54)).toFixed(1)+'px,0)';}
function removeParticle(p){
  p.animation.onfinish=null;p.animation.oncancel=null;
  var i=particles.indexOf(p);
  if(i!==-1){particles.splice(i,1);}
  if(p.node.parentNode){p.node.parentNode.removeChild(p.node);}
}
function clearEffects(){
  if(spin){spin.onfinish=null;spin.oncancel=null;spin.cancel();spin=null;}
  while(particles.length){var p=particles[particles.length-1];removeParticle(p);p.animation.cancel();}
}
function dot(x,y,dx,dy,life,color){
  if(!canRun()||particles.length>=(compact?8:24)||!svg.animate){return;}
  var endX=x+dx,endY=y+dy;
  if(compact){
    x=clamp(x,6,W-6);y=clamp(y,6,dockTop-6);
    endX=clamp(endX,6,W-6);endY=clamp(endY,6,dockTop-6);
  }
  var s=document.createElement('span');
  s.className='sk-spark';s.setAttribute('aria-hidden','true');s.style.background=color;
  document.body.appendChild(s);
  var a=s.animate([{transform:'translate('+x+'px,'+y+'px) scale(1)',opacity:1},{transform:'translate('+endX+'px,'+endY+'px) scale(0.1)',opacity:0}],{duration:life,easing:'ease-out'});
  var p={node:s,animation:a};particles.push(p);
  a.onfinish=a.oncancel=function(){removeParticle(p);};
}
function burst(){
  for(var i=0;i<(compact?8:14);i++){
    var a=Math.random()*6.283,d=compact?rnd(18,40):rnd(30,90);
    dot(pos.x,pos.y,Math.cos(a)*d,Math.sin(a)*d,rnd(450,800),Math.random()<0.5?'#FBCA03':'#AA0505');
  }
  if(svg.animate){
    if(spin){spin.onfinish=null;spin.oncancel=null;spin.cancel();}
    var frames=[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}];
    if(compact){frames[0].transformOrigin=frames[1].transformOrigin='50% 50%';}
    spin=svg.animate(frames,{duration:850,easing:'cubic-bezier(.34,1.2,.64,1)'});
    spin.onfinish=spin.oncancel=function(){spin=null;};
  }
}
function tick(t){
  raf=0;
  if(!canRun()){sync();return;}
  var elapsed=last===null?0:t-last;last=t;
  // Measure actual frame spacing before limiting the physics step.
  if(compact&&elapsed>24){slowTime+=elapsed;slowFrames++;}
  else{slowTime=0;slowFrames=0;}
  if(slowTime>=3000&&slowFrames>=3){autoOff=true;sync();return;}
  var dt=elapsed?Math.min(elapsed/1000,0.05):0.016;
  prevX=pos.x;prevY=pos.y;
  if(mode==='follow'&&!compact){
    target.x=clamp(mouse.x+70,bounds.left,bounds.right);
    target.y=clamp(mouse.y+54,bounds.top,bounds.bottom);
    vel.x+=((target.x-pos.x)*8.5-vel.x*5.9)*dt;
    vel.y+=((target.y-pos.y)*8.5-vel.y*5.9)*dt;
    var vSpeed=Math.hypot(vel.x,vel.y),cap=560;
    if(vSpeed>cap){vel.x*=cap/vSpeed;vel.y*=cap/vSpeed;}
    pos.x+=vel.x*dt;pos.y+=vel.y*dt;
  }else if(leg){
    var p=(t-leg.t0)/leg.dur;
    if(p>=1){
      pos.x=leg.x1;pos.y=leg.y1;leg=null;
      pauseUntil=t+rnd(compact?900:1400,compact?2200:3400);
    }else{
      var e=ease(p),u=1-e;
      pos.x=u*u*leg.x0+2*u*e*leg.cx+e*e*leg.x1;
      pos.y=u*u*leg.y0+2*u*e*leg.cy+e*e*leg.y1;
    }
  }else if(t>pauseUntil){
    pick(t);
  }
  constrain();
  var vx=(pos.x-prevX)/dt,vy=(pos.y-prevY)/dt,speed=Math.hypot(vx,vy);
  driftX+=(vx-driftX)*Math.min(1,dt*4);
  face+=(clamp(vx/300,-1,1)-face)*Math.min(1,dt*3);
  var tilt=clamp(driftX*0.018,-7,7),sway=Math.abs(face);
  btn.style.transform='translateY('+(Math.sin(t/850)*2.2).toFixed(2)+'px) rotate('+tilt.toFixed(2)+'deg)';
  svg.style.transform='rotateY('+(face*16).toFixed(2)+'deg) scaleX('+(1-sway*0.05).toFixed(3)+')';
  shade.style.transform='translateX('+(-face*5).toFixed(1)+'px) scaleX('+(1-sway*0.3).toFixed(2)+')';
  shade.style.opacity=(0.8-sway*0.2).toFixed(2);
  if(speed>60&&t>sparkAt){sparkAt=t+150;dot(pos.x,pos.y+(compact?23:34),rnd(-6,6),rnd(18,38),460,Math.random()<0.5?'#FBCA03':'#AA0505');}
  place();
  raf=requestAnimationFrame(tick);
}
function endDrag(cancelled){
  if(!drag){return;}
  var previous=drag;drag=null;
  suppressClick=previous.moved||cancelled;
  if(btn.hasPointerCapture&&btn.hasPointerCapture(previous.id)){btn.releasePointerCapture(previous.id);}
  target.x=pos.x;target.y=pos.y;vel.x=vel.y=0;
  leg=null;pauseUntil=performance.now()+(previous.moved?800:400);
}
function updateControls(on,motionReduced){
  ['flyer-toggle','mobile-flyer-toggle'].forEach(function(id){
    var toggle=document.getElementById(id);
    if(!toggle){return;}
    toggle.setAttribute('aria-pressed',on?'true':'false');
    toggle.setAttribute('aria-disabled',motionReduced?'true':'false');
    toggle.textContent='Ironbot: '+(on?'on':'off');toggle.disabled=motionReduced;
    toggle.title=motionReduced?'Ironbot is disabled while reduced motion is enabled.':autoOff?'Ironbot switched off because frames stayed above 24 ms for 3 seconds. Activate to retry.':'';
  });
}
function sync(){
  var motionReduced=reduced(),on=enabled&&!autoOff&&!motionReduced;
  if(!on||document.hidden||explorerOpen()){
    clearTimeout(scrollTimer);scrollTimer=0;scrolling=false;
  }
  var paused=blocked();
  if(!on||paused){endDrag(true);}
  var running=on&&!paused&&!drag;
  if(!running){
    cancelAnimationFrame(raf);raf=0;resetClock();clearEffects();
  }
  flames.forEach(function(flame){flame.style.animationPlayState=running?'running':'paused';});
  root.hidden=!on;btn.disabled=!on||paused;
  updateControls(on,motionReduced);
  if(running&&!raf){
    measure();place();
    // Resume the current destination from wherever the pause left the bot, so
    // the glide never snaps back to a stale start point.
    if(mode==='roam'&&leg){startLeg(leg.x1,leg.y1,performance.now());}
    prevX=pos.x;prevY=pos.y;last=null;
    raf=requestAnimationFrame(tick);
  }
}
function setMode(m){
  mode=m;
  btn.setAttribute('aria-pressed',m==='follow'?'true':'false');
  btn.setAttribute('aria-label',compact?(m==='follow'?'Ironbot follows your drag above the dock. Activate to send it roaming.':'Ironbot is roaming above the dock. Activate to follow, or drag to move it.'):(m==='follow'?'Ironbot is following your cursor. Activate to send it roaming.':'Ironbot is roaming. Activate to make it follow your cursor.'));
  if(m==='roam'){pick(performance.now());}
  else{leg=null;target.x=pos.x;target.y=pos.y;vel.x=vel.y=0;}
}
function setEnabled(on){
  enabled=on;autoOff=false;
  try{localStorage.setItem('ironbot',on?'on':'off');localStorage.removeItem('skybot');}catch(err){}
  sync();
}
function resize(){
  var next=compactQuery?compactQuery.matches:window.innerWidth<=900,changed=next!==compact;
  endDrag(true);clearEffects();resetClock();compact=next;
  btn.style.touchAction=compact?'none':touchAction;
  measure();vel.x=vel.y=0;
  if(changed){
    face=0;driftX=0;btn.style.transform='none';svg.style.transform='none';shade.style.transform='none';shade.style.opacity='0.8';
    setMode(mode);
  }else if(mode==='roam'){
    leg=null;pauseUntil=performance.now()+300;
  }
  place();sync();
}
function onScroll(){
  if(!isOn()||document.hidden||explorerOpen()){return;}
  clearTimeout(scrollTimer);
  if(!scrolling){scrolling=true;sync();}
  scrollTimer=setTimeout(function(){scrollTimer=0;scrolling=false;sync();},160);
}
function pointerPosition(e){if(!compact&&isOn()&&!blocked()){mouse.x=e.clientX;mouse.y=e.clientY;}}
window.addEventListener('pointermove',pointerPosition,{passive:true});
window.addEventListener('pointerdown',pointerPosition,{passive:true});
window.addEventListener('resize',resize);
document.addEventListener('scroll',onScroll,{passive:true,capture:true});
btn.addEventListener('pointerdown',function(e){
  if(!compact||!canRun()||e.isPrimary===false||e.button!==0||!btn.setPointerCapture){return;}
  try{btn.setPointerCapture(e.pointerId);}catch(err){return;}
  suppressClick=false;
  drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:pos.x,moved:false};
  sync();
});
btn.addEventListener('pointermove',function(e){
  if(!drag||e.pointerId!==drag.id){return;}
  if(!isOn()||blocked()){endDrag(true);sync();return;}
  var dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
  if(!drag.moved&&Math.hypot(dx,dy)<6){return;}
  drag.moved=true;
  pos.x=clamp(drag.x+dx,bounds.left,bounds.right);
  target.x=pos.x;target.y=pos.y;vel.x=vel.y=0;
  place();
});
function release(e){if(drag&&e.pointerId===drag.id){endDrag(e.type!=='pointerup');sync();}}
btn.addEventListener('pointerup',release);
btn.addEventListener('pointercancel',release);
btn.addEventListener('lostpointercapture',release);
btn.addEventListener('click',function(e){
  if(suppressClick&&e.detail!==0){suppressClick=false;e.preventDefault();return;}
  suppressClick=false;
  if(!canRun()){return;}
  burst();setMode(mode==='roam'?'follow':'roam');
});
document.addEventListener('click',function(e){
  var toggle=e.target.closest&&e.target.closest('#flyer-toggle, #mobile-flyer-toggle');
  if(toggle&&!reduced()){setEnabled(!isOn());}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&mode==='follow'){setMode('roam');}});
document.addEventListener('visibilitychange',sync);
document.addEventListener('motionchange',sync);
document.addEventListener('explorerchange',sync);
if(reduce.addEventListener){reduce.addEventListener('change',sync);}else if(reduce.addListener){reduce.addListener(sync);}
if(compactQuery){
  if(compactQuery.addEventListener){compactQuery.addEventListener('change',resize);}else if(compactQuery.addListener){compactQuery.addListener(resize);}
}
try{
  var stored=localStorage.getItem('ironbot');
  if(stored===null){stored=localStorage.getItem('skybot');}
  enabled=stored!=='off';
}catch(err){}
btn.style.touchAction=compact?'none':touchAction;
measure();setMode('roam');place();sync();
})();
