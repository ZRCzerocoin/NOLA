// workers/nol-worker.js (Module Worker - paste into your repo)
export default {
  async fetch(request, env) {
    const CACHE_TTL = 24 * 60 * 60; // 24h
    const TOPIC_KEYWORDS = [
      "nft","nfts","crypto","defi","web3","investment","investing","stocks","finance",
      "bitcoin","btc","polygon","matic","solana","ethereum","eth","trading","coins","tokens","pos","pol"
    ];
    const CHAINS = {
      ethereum: ["ETH","ETHEREUM"],
      polygon: ["POL","MATIC","POLYGON"],
      solana: ["SOL","SOLANA"]
    };

    // Helpful debug flag: ?force=1 to bypass cache (for testing)
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";

    // Resolve bindings from env
    const KV = env.TWEETS_KV; // <-- binding name must be exactly TWEETS_KV
    const CLOUDFLARE_ID = env["CLOUDFLARE-ID"] || env.CLOUDFLARE_ID || "unknown";
    const TOKEN = env.BARRIER_KEY || env.X_BEARER_TOKEN || env.X_BEARER || null; // try common names

    // Basic validation
    if (!KV) {
      return new Response(JSON.stringify({ ok:false, error: "KV binding TWEETS_KV not found in env" }), { status:500, headers: jsonHeaders() });
    }
    if (!TOKEN) {
      return new Response(JSON.stringify({ ok:false, error: "Bearer token secret not found (expected env.BARRIER_KEY)" }), { status:500, headers: jsonHeaders() });
    }

    const cacheKey = `tweets_${CLOUDFLARE_ID}`;

    try {
      // Check cache
      if (!force) {
        const cached = await KV.get(cacheKey, { type: "json" });
        if (cached && Array.isArray(cached.tweets)) {
          // Return cached plus metadata
          return new Response(JSON.stringify({
            ok: true,
            source: "kv",
            cached_at: cached.cached_at || null,
            tweets: cached.tweets,
            chains: cached.chains || {},
            topTrending: cached.topTrending || []
          }), { status:200, headers: jsonHeaders() });
        }
      }

      // Build X query
      const query = encodeURIComponent(TOPIC_KEYWORDS.join(" OR "));
      const xUrl = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=100&tweet.fields=created_at,text,public_metrics,author_id`;

      const res = await fetch(xUrl, { headers: { "Authorization": `Bearer ${TOKEN}` } });

      if (!res.ok) {
        // Return full error info for debugging
        const txt = await res.text().catch(()=>null);
        return new Response(JSON.stringify({
          ok:false,
          status: res.status,
          statusText: res.statusText,
          body: txt
        }), { status:502, headers: jsonHeaders() });
      }

      const j = await res.json();
      const tweets = Array.isArray(j.data) ? j.data : [];

      // Compute engagement and sort
      tweets.forEach(t => {
        const pm = t.public_metrics || {};
        t._engagement = (pm.retweet_count||0) + (pm.reply_count||0) + (pm.like_count||0) + (pm.quote_count||0);
      });
      tweets.sort((a,b) => (b._engagement||0) - (a._engagement||0));

      // chain filters
      const chains = {
        ethereum: tweets.filter(t => containsAny(t.text, CHAINS.ethereum)),
        polygon: tweets.filter(t => containsAny(t.text, CHAINS.polygon)),
        solana: tweets.filter(t => containsAny(t.text, CHAINS.solana))
      };

      const topTrending = tweets.slice(0, 50);

      // Save to KV
      const payload = { tweets, chains, topTrending, cached_at: Date.now() };
      await KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: CACHE_TTL });

      return new Response(JSON.stringify({
        ok: true,
        source: "fresh",
        tweets,
        chains,
        topTrending
      }), { status:200, headers: jsonHeaders() });

    } catch (err) {
      // Unexpected error
      return new Response(JSON.stringify({ ok:false, error: String(err), stack: (err.stack||null) }), { status:500, headers: jsonHeaders() });
    }

    // helpers
    function containsAny(text, arr) {
      if (!text) return false;
      const t = text.toUpperCase();
      return arr.some(s => t.includes(String(s).toUpperCase()));
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json;charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      };
    }
  }
};
