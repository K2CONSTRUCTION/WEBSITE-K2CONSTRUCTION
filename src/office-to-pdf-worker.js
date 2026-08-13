/**
 * office-to-pdf-worker.js
 * -----------------------------------------------------------------------
 * Converts Word / Excel / PowerPoint files to PDF using the Google Drive
 * API (upload -> convert to native Google type -> export as PDF -> delete).
 *
 * SETUP
 * 1. In Cloudflare, add this secret (paste the FULL content of your
 *    downloaded service-account JSON file as-is):
 *      wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
 *
 * 2. IMPORTANT — Service Accounts have 0 bytes of quota in "My Drive".
 *    You MUST upload into a Shared Drive instead, or every upload fails
 *    with "storageQuotaExceeded".
 *      a. Create a Shared Drive in Google Drive (Shared drives > New).
 *      b. Share it with your service account's email
 *         (the "client_email" field in the JSON key) as Content Manager
 *         or Manager.
 *      c. Copy the Shared Drive's folder ID from its URL:
 *         https://drive.google.com/drive/folders/<FOLDER_ID>
 *      d. Add it as a secret:
 *           wrangler secret put GOOGLE_DRIVE_PARENT_FOLDER_ID
 *
 * 3. Import and call `handleOfficeToPdf` from your existing Worker's
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
 * 4. Expected request: multipart/form-data with a single field "file"
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

// ---- base64url helpers (Workers-safe, no Buffer) ----
function base64url(bytes) {
  let str = typeof bytes === 'string' ? bytes : btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToBase64url(str) {
  return base64url(new TextEncoder().encode(str));
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
                 .replace(/-----END PRIVATE KEY-----/, '')
                 .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ---- Get an OAuth2 access token via service-account JWT bearer flow ----
async function getAccessToken(env) {
  const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${strToBase64url(JSON.stringify(header))}.${strToBase64url(JSON.stringify(claim))}`;

  const keyData = pemToArrayBuffer(creds.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(sigBuffer)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const { access_token } = await tokenRes.json();
  return access_token;
}

// ---- Upload + convert, export as PDF, then clean up ----
// parentFolderId MUST point to a folder inside a Shared Drive — service
// accounts have no quota of their own, so uploads to "My Drive" (no
// parent, or a My Drive folder) will fail with storageQuotaExceeded.
async function convertToPdf(accessToken, fileBytes, sourceMimeType, fileName, parentFolderId) {
  const googleType = SOURCE_TO_GOOGLE_TYPE[sourceMimeType];
  if (!googleType) throw new Error(`Unsupported source type: ${sourceMimeType}`);

  const boundary = '----k2pdf' + crypto.randomUUID();
  const metadataObj = { name: fileName, mimeType: googleType };
  if (parentFolderId) metadataObj.parents = [parentFolderId];
  const metadata = JSON.stringify(metadataObj);

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

  // 1) Upload + convert (supportsAllDrives is required for Shared Drive access)
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',
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
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
}

export async function handleOfficeToPdf(request, env) {
  try {
    if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      return new Response(JSON.stringify({ error: 'Server not configured: missing GOOGLE_SERVICE_ACCOUNT_KEY secret' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!env.GOOGLE_DRIVE_PARENT_FOLDER_ID) {
      return new Response(JSON.stringify({
        error: 'Server not configured: missing GOOGLE_DRIVE_PARENT_FOLDER_ID secret',
        message: 'Service accounts have no storage quota of their own. Create a Shared Drive, share it with the service account email as Content Manager, and set GOOGLE_DRIVE_PARENT_FOLDER_ID to that Shared Drive\'s folder ID.',
      }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
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
    const pdfBytes = await convertToPdf(accessToken, fileBytes, file.type, file.name || 'document', env.GOOGLE_DRIVE_PARENT_FOLDER_ID);

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
