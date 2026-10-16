import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";
import { routes } from "./src/routes";
export function serviceWorkerSource(files: string[], revision: string): string {
  return `const CACHE='wms-static-${revision}';
const STATIC=new Set(${JSON.stringify(files)});const NAV=new Set(${JSON.stringify(routes.map(([path]) => path))});
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...STATIC])));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wms-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const r=event.request;const u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname==='/api'||u.pathname.startsWith('/api/')||u.search)return;
 if(STATIC.has(u.pathname)){event.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(hit=>hit||fetch(r)));return;}
 if(r.mode==='navigate'&&NAV.has(u.pathname))event.respondWith(fetch(r).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));
});`;
}
export function staticPwa(): Plugin {
  let output = "";
  return {
    name: "wms-static-only-pwa",
    apply: "build",
    configResolved(config) {
      output = config.build.outDir;
    },
    async closeBundle() {
      const files = ["/index.html", "/manifest.webmanifest", "/icon.svg"];
      for (const name of await readdir(join(output, "assets")))
        if (/\.(js|css)$/.test(name)) files.push("/assets/" + name);
      const hash = createHash("sha256");
      for (const file of files)
        hash.update(await readFile(join(output, file.slice(1))));
      await writeFile(
        join(output, "service-worker.js"),
        serviceWorkerSource(files, hash.digest("hex").slice(0, 16)),
      );
    },
  };
}
