/**
 * Proxy HTTPS LAN → Metro HTTP (8081).
 * Chrome n’autorise micro/caméra que en contexte sécurisé :
 * https://localhost ou https://<IP-LAN> — pas http://172.x:8081.
 *
 * Usage (Metro déjà sur 8081) :
 *   npm run dev:https
 * Puis ouvrir https://<IP>:8443 (accepter le certificat auto-signé).
 */

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const selfsigned = require('selfsigned');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, '.lan-certs');
const TARGET_HOST = process.env.BINTU_METRO_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.BINTU_METRO_PORT || 8081);
const LISTEN_PORT = Number(process.env.BINTU_HTTPS_PORT || 8443);

function lanIPv4s() {
  const out = new Set(['127.0.0.1']);
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) out.add(info.address);
    }
  }
  return [...out];
}

async function ensureCerts(ips) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  const stampPath = path.join(CERT_DIR, 'ips.txt');
  const stamp = ips.slice().sort().join(',');
  if (
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath) &&
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, 'utf8').trim() === stamp
  ) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 2, value: '*.localhost' },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'BINTU-LAN-DEV' }],
    {
      keySize: 2048,
      days: 825,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        {
          name: 'keyUsage',
          digitalSignature: true,
          keyEncipherment: true,
        },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames },
      ],
    },
  );

  if (!pems?.private || !pems?.cert) {
    throw new Error('selfsigned.generate n’a pas renvoyé private/cert');
  }

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(stampPath, stamp);
  return { key: pems.private, cert: pems.cert };
}

function proxyRequest(clientReq, clientRes) {
  const headers = { ...clientReq.headers, host: `${TARGET_HOST}:${TARGET_PORT}` };
  const upstream = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers,
    },
    (upRes) => {
      const outHeaders = { ...upRes.headers };
      outHeaders['permissions-policy'] = 'camera=*, microphone=*, autoplay=*';
      outHeaders['feature-policy'] = 'camera *; microphone *; autoplay *';
      clientRes.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(clientRes);
    },
  );
  upstream.on('error', (err) => {
    clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    clientRes.end(
      `Proxy HTTPS → Metro indisponible (${TARGET_HOST}:${TARGET_PORT}).\n` +
        `Lancez d’abord : npx expo start --web --port ${TARGET_PORT}\n` +
        String(err.message || err),
    );
  });
  clientReq.pipe(upstream);
}

function proxyUpgrade(clientReq, clientSocket, head) {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const reqLines = [
      `${clientReq.method} ${clientReq.url} HTTP/1.1`,
      `Host: ${TARGET_HOST}:${TARGET_PORT}`,
    ];
    for (const [key, value] of Object.entries(clientReq.headers)) {
      if (key.toLowerCase() === 'host') continue;
      if (Array.isArray(value)) {
        for (const item of value) reqLines.push(`${key}: ${item}`);
      } else if (value !== undefined) {
        reqLines.push(`${key}: ${value}`);
      }
    }
    reqLines.push('', '');
    upstream.write(reqLines.join('\r\n'));
    if (head?.length) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });
  upstream.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => upstream.destroy());
}

const ips = lanIPv4s();
const { key, cert } = await ensureCerts(ips);
const server = https.createServer({ key, cert }, proxyRequest);
server.on('upgrade', proxyUpgrade);
server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('BINTU HTTPS LAN proxy prêt (micro/caméra Chrome OK)');
  console.log(`  Metro  → http://${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`  HTTPS  → https://127.0.0.1:${LISTEN_PORT}`);
  for (const ip of ips) {
    if (ip === '127.0.0.1') continue;
    console.log(`  HTTPS  → https://${ip}:${LISTEN_PORT}`);
  }
  console.log('');
  console.log('1) Gardez Expo/Metro sur 8081');
  console.log('2) Ouvrez l’URL HTTPS ci-dessus (Avancé → continuer)');
  console.log('3) Quittez http://IP:8081 — Chrome y bloque le média');
  console.log('');
});
