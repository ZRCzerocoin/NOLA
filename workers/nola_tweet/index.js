export default {
  async fetch(request, env) {
    const now = Date.now();
    const lastUpdated = await env.TWEETS_KV.get("last_update", { type: "json" });

    if (lastUpdated && now - lastUpdated.time < 12 * 60 * 60 * 1000) {
      const cached = await env.TWEETS_KV.get("tweets", { type: "json" });
      return new Response(JSON.stringify({
        source: "cache",
        updated_at: lastUpdated.time,
        tweets: cached
      }), { headers: { "Content-Type": "application/json" }});
    }

    const token = env.X_BEARER_TOKEN; // secret stored in Cloudflare

    const url = "https://api.x.com/2/tweets/search/recent?query=crypto&max_results=100";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    await env.TWEETS_KV.put("tweets", JSON.stringify(data));
    await env.TWEETS_KV.put("last_update", JSON.stringify({ time: now }));

    return new Response(JSON.stringify({
      source: "fresh",
      updated_at: now,
      tweets: data
    }), { headers: { "Content-Type": "application/json" }});
  }
};
