/**
 * NOL space Worker — pull X tweets, filter crypto topics, cache in KV
 * Uses existing KV: kv
 * Uses secret: BARRIER_KEY
 */

const TOPIC_KEYWORDS = [
  "nft","nfts","crypto","defi","web3","investment","investing","stocks","finance",
  "bitcoin","btc","polygon","matic","solana","ethereum","eth","trading","coins","tokens","pos","pol"
];

const CHAINS = {
  ethereum: ["ETH","ETHEREUM"],
  polygon: ["POL","MATIC","POLYGON"],
  solana: ["SOL","SOLANA"]
};

const CACHE_TTL = 24 * 60 * 60; // 24h

async function fetchXTweets() {
  const token = BARRIER_KEY; // Cloudflare secret
  const query = encodeURIComponent(TOPIC_KEYWORDS.join(" OR "));
  const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=100&tweet.fields=created_at,text,public_metrics,author_id`;

  const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
  if (!res.ok) throw new Error(`X API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.data || [];
}

function sortByEngagement(tweets) {
  return tweets.sort((a,b) => {
    const eA = (a.public_metrics?.retweet_count||0) + (a.public_metrics?.like_count||0);
    const eB = (b.public_metrics?.retweet_count||0) + (b.public_metrics?.like_count||0);
    return eB - eA;
  });
}

function filterByChain(tweets, symbols) {
  return tweets.filter(t => {
    const text = t.text?.toUpperCase()||'';
    return symbols.some(s => text.includes(s));
  });
}

async function getCachedTweets() {
  const cached = await kv.get("tweets", "json");
  if (cached) return cached;
  return null;
}

async function setCachedTweets(tweets) {
  await kv.put("tweets", JSON.stringify(tweets), { expirationTtl: CACHE_TTL });
}

async function handleRequest() {
  try {
    let tweets = await getCachedTweets();
    if (!tweets) {
      const fetched = await fetchXTweets();
      tweets = sortByEngagement(fetched);
      await setCachedTweets(tweets);
    }

    const chains = {
      ethereum: filterByChain(tweets, CHAINS.ethereum),
      polygon: filterByChain(tweets, CHAINS.polygon),
      solana: filterByChain(tweets, CHAINS.solana)
    };

    const topTrending = tweets.slice(0,50);

    return new Response(JSON.stringify({ tweets, chains, topTrending }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch(err) {
    console.error(err);
    return new Response(JSON.stringify({ tweets: [], chains: {}, topTrending: [], error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    });
  }
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest());
});
