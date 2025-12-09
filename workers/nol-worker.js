/**
 * Cloudflare Worker for NOL space
 * - Pulls X (Twitter) tweets via Bearer token
 * - Filters crypto & Web3 topics
 * - Caches in KV for 24h
 * - Returns JSON { tweets: [...] } for dashboard
 */

const BEARER_TOKEN = process.env.BEARER_KEY; // Secret in Cloudflare
const KV_NAMESPACE = process.env.kv; // KV binding name
const CACHE_TTL = 24 * 60 * 60; // 24h in seconds
const TOPIC_KEYWORDS = [
  "crypto","defi","web3","investment","investing","stocks","finance","trade","trading","cryptocurrency"
  "bitcoin","btc","polygon","matic","solana","ethereum","eth","trading","coins","tokens","pos","pol","nft","nfts",
];

async function fetchXTweets() {
  const query = encodeURIComponent(TOPIC_KEYWORDS.join(" OR "));
  const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=100&tweet.fields=created_at,text,public_metrics,author_id`;
  
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${BEARER_KEY}` }
  });

  if (!res.ok) throw new Error(`X API error: ${res.status} ${res.statusText}`);
  
  const data = await res.json();
  return data.data || [];
}

function sortTweetsByEngagement(tweets) {
  return tweets.sort((a,b) => {
    const engagementA = (a.public_metrics?.retweet_count||0) + (a.public_metrics?.like_count||0);
    const engagementB = (b.public_metrics?.retweet_count||0) + (b.public_metrics?.like_count||0);
    return engagementB - engagementA; // Descending
  });
}

function filterTweetsByChain(tweets, chainSymbols) {
  return tweets.filter(t => {
    const text = t.text.toUpperCase();
    return chainSymbols.some(s => text.includes(s));
  });
}

async function getCachedTweets() {
  const cached = await KV_NAMESPACE.get("tweets", "json");
  if (cached) return cached;
  return null;
}

async function setCachedTweets(tweets) {
  await KV_NAMESPACE.put("tweets", JSON.stringify(tweets), { expirationTtl: CACHE_TTL });
}

async function handleRequest() {
  try {
    // Check cache first
    let tweets = await getCachedTweets();
    if (!tweets) {
      // Fetch from X
      const fetched = await fetchXTweets();

      // Sort by engagement
      tweets = sortTweetsByEngagement(fetched);

      // Save to KV
      await setCachedTweets(tweets);
    }

    // Prepare JSON for dashboard
    const chains = {
      ethereum: filterTweetsByChain(tweets, ["ETH","ETHEREUM"]),
      polygon: filterTweetsByChain(tweets, ["POL","MATIC","POLYGON"]),
      solana: filterTweetsByChain(tweets, ["SOL","SOLANA"])
    };

    const topTrending = tweets.slice(0, 50); // top 50 overall

    return new Response(JSON.stringify({
      tweets: tweets,
      chains,
      topTrending
    }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=0" }
    });

  } catch (err) {
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
