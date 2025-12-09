<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NOL space — Crypto & Finance Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body, html { margin:0; padding:0; font-family: Arial, sans-serif; background: #f5f6fa; color: #222; }
  header { background: rgba(44, 62, 80, 0.85); color: white; padding: 1rem; text-align: center; backdrop-filter: blur(8px); }
  #layout { display: flex; height: calc(100vh - 100px); }
  #sidebar { width: 200px; background: rgba(52, 73, 94, 0.85); color: white; padding: 1rem; box-sizing: border-box; backdrop-filter: blur(8px); border-right: 1px solid rgba(255,255,255,0.1); }
  #sidebar h2 { font-size: 1.2rem; margin-top: 0; }
  #sidebar ul { list-style: none; padding: 0; }
  #sidebar li { margin: 0.5rem 0; cursor: pointer; }
  #sidebar li:hover { text-decoration: underline; }
  #main { flex: 1; overflow-y: auto; padding: 1rem; box-sizing: border-box; }
  .section { margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px,1fr)); gap: 1rem; }
  .card { background: white; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); padding: 1rem; display: flex; flex-direction: column; position: relative; }
  .card h3 { margin: 0 0 0.5rem 0; font-size:1rem; }
  .meta { font-size: 0.75rem; color: #555; margin-bottom: 0.5rem; }
  .positive { color: green; }
  .negative { color: red; }
  .neutral { color: gray; }
  a { text-decoration: none; color: #2980b9; margin-top: auto; font-weight: bold; font-size:0.8rem; }
  canvas { width: 100%; height: 40px; }
  footer { background: rgba(44, 62, 80, 0.85); color: white; padding: 1rem; text-align: center; backdrop-filter: blur(8px); }
  footer a { color: #f39c12; margin: 0 0.5rem; text-decoration: none; }
</style>
</head>
<body>
<header><h1>NOL space</h1></header>
<div id="layout">
  <div id="sidebar">
    <h2>Sections</h2>
    <ul>
      <li data-section="xtrends">X Trends</li>
      <li data-section="news">News</li>
      <li data-section="polygon">Polygon</li>
      <li data-section="ethereum">Ethereum</li>
      <li data-section="solana">Solana</li>
    </ul>
  </div>
  <div id="main"><p>Loading dashboard...</p></div>
</div>
<footer>
  NOLA © All Rights Reserved.  
  <a href="https://nol.pages.dev" target="_blank">Website</a> | 
  <a href="https://x.com/NOLA_CHAIN" target="_blank">X</a> | 
  <a href="mailto:support@nola.work.gd">Support</a>
</footer>

<script>
const WORKER_URL = "https://<your-worker-subdomain>.workers.dev"; // replace with your Worker URL
let currentSection='xtrends';

// Sentiment estimation
function estimateSentiment(text){
  const lower=text.toLowerCase();
  if(/bull|moon|pump|rally|gain|up/i.test(lower)) return {label:'Bullish',class:'positive',icon:'▲'};
  if(/bear|dump|crash|down|loss/i.test(lower)) return {label:'Bearish',class:'negative',icon:'▼'};
  return {label:'Neutral',class:'neutral',icon:'●'};
}

// Fetch data from Worker
async function fetchWorkerData(){
  try{
    const res = await fetch(WORKER_URL);
    const data = await res.json();
    return data;
  }catch(e){ console.error(e); return {tweets:[], chains:{}, topTrending:[]}; }
}

// Render X Trends
function renderXTrends(data){
  const tweets = data.topTrending || [];
  if(!tweets.length) return '<div class="section"><h2>🔺 X Trends</h2><p>No data.</p></div>';
  return `<div class="section"><h2>🔺 X Trends</h2><div class="grid">${tweets.map(t=>{
    const s=estimateSentiment(t.text||'');
    return `<div class="card"><h3>${s.icon} ${t.text}</h3><div class="meta ${s.class}">Sentiment: ${s.label}</div></div>`;
  }).join('')}</div></div>`;
}

// Render chain section
function renderChainSection(chainName, tweets){
  if(!tweets || !tweets.length) return `<div class="section"><h2>${chainName}</h2><p>No data.</p></div>`;
  return `<div class="section"><h2>${chainName}</h2><div class="grid">${tweets.map(t=>{
    const s=estimateSentiment(t.text);
    return `<div class="card"><h3>${s.icon} ${t.text}</h3><div class="meta ${s.class}">Sentiment: ${s.label}</div></div>`;
  }).join('')}</div></div>`;
}

// Load section
async function loadSection(section){
  const main = document.getElementById('main');
  main.innerHTML='<p>Loading...</p>';
  const data = await fetchWorkerData();
  if(section==='news'){
    main.innerHTML = '<div class="section"><h2>📰 News</h2><p>Soon</p></div>';
  } else if(section==='xtrends'){
    main.innerHTML = renderXTrends(data);
  } else if(['polygon','ethereum','solana'].includes(section)){
    main.innerHTML = renderChainSection(section.charAt(0).toUpperCase() + section.slice(1), data.chains[section]);
  }
  currentSection = section;
}

// Sidebar click
document.querySelectorAll('#sidebar li').forEach(li=>{
  li.addEventListener('click', e=> loadSection(e.target.getAttribute('data-section')));
});

// Default load
window.addEventListener('load', ()=>loadSection('xtrends'));

// Auto-refresh every 12h
setInterval(()=>loadSection(currentSection), 12*60*60*1000);
</script>
</body>
</html>
