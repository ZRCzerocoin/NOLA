const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const DATA_DIR = path.join(__dirname, 'cached');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const COINGECKO_MARKETS = 'https://api.coingecko.com/api/v3/coins/markets';
const VS_CURRENCY = 'usd';

async function fetchMarkets(per_page=250){
  const url = `${COINGECKO_MARKETS}?vs_currency=${VS_CURRENCY}&order=market_cap_desc&per_page=${per_page}&page=1&sparkline=false&price_change_percentage=24h`;
  const r = await axios.get(url, { timeout: 15000 });
  return r.data;
}

function writeCache(name, obj){
  const p = path.join(DATA_DIR, name + '.json');
  fs.writeFileSync(p, JSON.stringify({ ts: Date.now(), payload: obj }, null, 2));
}

async function refreshLists(){
  const markets = await fetchMarkets(250);
  // filter only ETH and POL tokens by heuristics (platforms or symbol/name)
  const filtered = markets.filter(m => {
    if (m.platforms && typeof m.platforms === 'object'){
      const keys = Object.keys(m.platforms).map(k=>k.toLowerCase());
      if (keys.includes('ethereum') || keys.includes('polygon-pos') || keys.includes('polygon')) return true;
    }
    const name = (m.name||'').toLowerCase(); const sym = (m.symbol||'').toLowerCase();
    if (name.includes('matic') || sym==='matic') return true;
    return false;
  });
  writeCache('lists', filtered);
  return filtered;
}

async function refreshMajors(){
  const markets = await fetchMarkets(250);
  // keep full markets as majors payload
  writeCache('majors', markets);
  return markets;
}

async function refreshGlobal(){
  // for global volume we can sum volumes or reuse top markets data
  const markets = await fetchMarkets(250);
  const totalVolume = markets.reduce((s,m)=> s + (m.total_volume||0), 0);
  const payload = { total_volume_24h: totalVolume, count: markets.length };
  writeCache('global', payload);
  return payload;
}

async function runImmediate(){
  console.log('[fetcher] running immediate refresh');
  await refreshLists();
  await refreshMajors();
  await refreshGlobal();
  console.log('[fetcher] refresh complete');
}

// schedule: lists every 6 minutes, majors every 12 minutes, global every 2 hours
cron.schedule('*/6 * * * *', async ()=>{ try{ console.log('[cron] refresh lists'); await refreshLists(); }catch(e){console.error(e);} });
cron.schedule('*/12 * * * *', async ()=>{ try{ console.log('[cron] refresh majors'); await refreshMajors(); }catch(e){console.error(e);} });
cron.schedule('0 */2 * * *', async ()=>{ try{ console.log('[cron] refresh global'); await refreshGlobal(); }catch(e){console.error(e);} });

// run once at startup
runImmediate().catch(e=>console.error(e));

module.exports = { runImmediate };
