const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetcher = require('./fetcher');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'cached');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Helper to read cached file
function readCacheFile(name){
  const p = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(p)) return null;
  try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){return null}
}

// Public endpoints that only serve cached data (never call CoinGecko from client)
app.get('/api/global', (req,res)=>{
  const data = readCacheFile('global');
  if(!data) return res.status(503).json({ ok:false, msg:'no cache yet' });
  res.json({ ok:true, source:'cache', data });
});

app.get('/api/lists', (req,res)=>{
  const data = readCacheFile('lists');
  if(!data) return res.status(503).json({ ok:false, msg:'no cache yet' });
  res.json({ ok:true, source:'cache', data });
});

app.get('/api/majors', (req,res)=>{
  const data = readCacheFile('majors');
  if(!data) return res.status(503).json({ ok:false, msg:'no cache yet' });
  res.json({ ok:true, source:'cache', data });
});

// Low-priv route to force refresh (protect with simple token in header or env var)
app.post('/internal/refresh', async (req,res)=>{
  const token = req.headers['x-internal-token'] || '';
  if (token !== process.env.INTERNAL_TOKEN) return res.status(401).json({ ok:false });
  try{
    await fetcher.runImmediate();
    return res.json({ ok:true });
  }catch(e){console.error(e); return res.status(500).json({ ok:false, err:e.message });}
});

// Serve static frontend if desired
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log('NOL cache API listening on', PORT);
});
