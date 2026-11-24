const clock=document.querySelector('#today');
function dateLabel(){clock.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date())}
dateLabel();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)dateLabel()});
const anchors=Array.from(document.querySelectorAll('.menu a'));
function active(){let last=anchors[0];for(const link of anchors){if(document.querySelector(link.hash).getBoundingClientRect().top<130)last=link}for(const link of anchors){if(link===last)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')}}
active();window.addEventListener('scroll',active,{passive:true});
async function start(path,entry,containers){
  try{const module=await import(path);await module[entry]()}
  catch{for(const id of containers){const el=document.getElementById(id);if(el.childElementCount===0)el.textContent='정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'}}
}
start('/services-ui.js','initServices',['weather','ev']);
start('/boards-ui.js','initBoards',['boards']);
start('/transit-ui.js','initTransit',['subway','bus']);
