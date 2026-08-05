import { handleOfficeToPdf } from './office-to-pdf-worker.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Temporary diagnostic route — visit in browser (GET) to check setup.
    // Remove this block once everything works.
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
      return handleOfficeToPdf(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
