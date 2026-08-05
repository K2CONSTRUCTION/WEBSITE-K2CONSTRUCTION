import { handleOfficeToPdf } from './office-to-pdf-worker.js';

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Temporary diagnostic route — remove once everything works.
      if (url.pathname === '/api/debug') {
        const hasKey = !!env.GOOGLE_SERVICE_ACCOUNT_KEY;
        let keyInfo = 'missing';
        if (hasKey) {
          try {
            const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
            keyInfo = {
              valid_json: true,
              has_client_email: !!parsed.client_email,
              has_private_key: !!parsed.private_key,
              client_email: parsed.client_email || null,
            };
          } catch (e) {
            keyInfo = { valid_json: false, error: e.message };
          }
        }
        return new Response(JSON.stringify({ secret_present: hasKey, key_info: keyInfo }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/api/office-to-pdf' && request.method === 'POST') {
        return await handleOfficeToPdf(request, env);
      }
      return await env.ASSETS.fetch(request);
    } catch (err) {
      // Top-level safety net: never let an uncaught exception produce Cloudflare's
      // generic 1101 error page — always return the real error as JSON instead.
      return new Response(JSON.stringify({
        error: 'Uncaught worker exception',
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : null,
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
