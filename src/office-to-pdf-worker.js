/**
 * office-to-pdf-worker.js  (v2 — OAuth user token, for personal Gmail accounts)
 * -----------------------------------------------------------------------
 * Converts Word / Excel / PowerPoint files to PDF using the Google Drive
 * API (upload -> convert to native Google type -> export as PDF -> delete).
 *
 * WHY THIS VERSION EXISTS
 * Service accounts have 0 bytes of their own storage quota and can only
 * upload into a Shared Drive — but Shared Drives require a Google
 * Workspace account. If you're using a normal personal Gmail account
 * (e.g. k2construction69@gmail.com), use THIS version instead: it
 * authenticates as your real Google account (which has its own quota)
 * using a refresh token, instead of a service account.
 *
 * SETUP
 * 1. Create an OAuth Client ID (type "Desktop app") in Google Cloud
 *    Console -> APIs & Services -> Credentials.
 * 2. Run the included get-refresh-token.js script ONCE on your computer
 *    (logged in as k2construction69@gmail.com) to obtain a refresh token.
 * 3. Add three Cloudflare secrets:
 *      wrangler secret put GOOGLE_OAUTH_CLIENT_ID
 *      wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
 *      wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN
 * 4. Import and call `handleOfficeToPdf` from your existing Worker's
 *    fetch handler, for example:
 *
 *      import { handleOfficeToPdf } from './office-to-pdf-worker.js';
 *
 *      export default {
 *        async fetch(request, env, ctx) {
 *          const url = new URL(request.url);
 *          if (url.pathname === '/api/office-to-pdf' && request.method === 'POST') {
 *            return handleOfficeToPdf(request, env);
 *          }
 *          // ...rest of your existing routes...
 *        }
 *      };
 *
 * 5. Expected request: multipart/form-data with a single field "file"
 *    containing the .docx / .xlsx / .pptx (or legacy .doc/.xls/.ppt).
 *    Response: the converted PDF as application/pdf (binary).
 * -----------------------------------------------------------------------
 */

const SOURCE_TO_GOOGLE_TYPE = {
  // Word
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.google-apps.document',
  'application/msword': 'application/vnd.google-apps.document',
  // Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.google-apps.spreadsheet',
  'application/vnd.ms-excel': 'application/vnd.google-apps.spreadsheet',
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/vnd.google-apps.presentation',
  'application/vnd.ms-powerpoint': 'application/vnd.google-apps.presentation',
};

// ---- Exchange the long-lived refresh token for a short-lived access token ----
async function getAccessToken(env) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Token refresh failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const { access_token } = await tokenRes.json();
  return access_token;
}

// ---- Upload + convert, export as PDF, then clean up ----
async function convertToPdf(accessToken, fileBytes, sourceMimeType, fileName) {
  const googleType = SOURCE_TO_GOOGLE_TYPE[sourceMimeType];
  if (!googleType) throw new Error(`Unsupported source type: ${sourceMimeType}`);

  const boundary = '----k2pdf' + crypto.randomUUID();
  const metadata = JSON.stringify({ name: fileName, mimeType: googleType });

  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${sourceMimeType}\r\n\r\n`),
    new Uint8Array(fileBytes),
    encoder.encode(`\r\n--${boundary}--`),
  ];
  const bodyLength = parts.reduce((sum, p) => sum + p.length, 0);
  const body = new Uint8Array(bodyLength);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }

  // 1) Upload + convert (uses the real user's own My Drive quota — no
  //    parent folder needed, and no supportsAllDrives flag needed).
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const { id: fileId } = await uploadRes.json();

  try {
    // 2) Export as PDF
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!exportRes.ok) throw new Error(`Export failed: ${exportRes.status} ${await exportRes.text()}`);
    return await exportRes.arrayBuffer();
  } finally {
    // 3) Always clean up the temp file, even if export failed
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
}

export async function handleOfficeToPdf(request, env) {
  try {
    const missing = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN']
      .filter((k) => !env[k]);
    if (missing.length) {
      return new Response(JSON.stringify({
        error: 'Server not configured',
        message: `Missing secret(s): ${missing.join(', ')}. Run get-refresh-token.js once and set these three Cloudflare secrets.`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided (expected form field "file")' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!SOURCE_TO_GOOGLE_TYPE[file.type]) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${file.type}` }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAccessToken(env);
    const fileBytes = await file.arrayBuffer();
    const pdfBytes = await convertToPdf(accessToken, fileBytes, file.type, file.name || 'document');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(file.name || 'document').replace(/\.[^.]+$/, '')}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'office-to-pdf failed',
      message: (err && err.message) ? err.message : String(err),
      stack: (err && err.stack) ? err.stack : null,
    }, null, 2), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
