export async function onRequest(context) {
  return new Response(context.env.WORKER_AI);
}
