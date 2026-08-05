import { handleOfficeToPdf } from './office-to-pdf-worker.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/office-to-pdf' && request.method === 'POST') {
      return handleOfficeToPdf(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

