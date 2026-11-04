import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { harness, project } from './harness.mjs';
const output = path.join(project, 'output/playwright'); fs.mkdirSync(output, { recursive: true });
const h = harness({ directory: fs.mkdtempSync(path.join(output, 'external-')), keep: true }), token = crypto.randomUUID();
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (req.method === 'POST' && req.url === '/rpc') {
      if (req.headers['x-test-token'] !== token) { res.writeHead(403).end(); return; }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 10 * 1024 * 1024) throw Error('too large'); }
      const request = JSON.parse(body), result = await h.api(request.method, request.args);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return;
    }
    if (req.url === '/plugin') {
      const response = h.response();
      for (const [key, value] of response.headers) res.setHeader(key, key === 'content-security-policy' ? value.replace('frame-ancestors app://-', "frame-ancestors 'self'") : value);
      res.writeHead(response.status); res.end(await response.text()); return;
    }
    if (req.url !== '/') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><title>星枢 Nexus · 外部插件验收</title></head><body style="margin:0;overflow:hidden"><iframe title="Nexus" id="panel" src="/plugin" sandbox="allow-scripts" style="border:0;width:100%;height:100vh"></iframe><script>const frame=document.getElementById('panel');window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow||event.origin!=='null')return;const request=event.data?.forgePluginRequest;if(!request)return;try{const reply=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Test-Token':${JSON.stringify(token)}},body:JSON.stringify(request)}).then(r=>r.json());frame.contentWindow.postMessage({forgePluginReply:{id:request.id,...(reply.ok?{result:reply.result}:{error:reply.error})}},'*')}catch(error){frame.contentWindow.postMessage({forgePluginReply:{id:request.id,error:{message:error.message}}},'*')}});</script></body></html>`);
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
server.listen(0, '127.0.0.1', () => { const info = { url: `http://127.0.0.1:${server.address().port}`, directory: h.directory, vault: h.vault }; fs.writeFileSync(path.join(output, 'preview.json'), JSON.stringify(info, null, 2)); console.log(JSON.stringify(info)); });
