// Tico Finances — service worker mínimo: só recebe arquivos de extrato compartilhados (Android).
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method==='POST'&&u.searchParams.has('share-target')){
    e.respondWith((async()=>{
      try{const fd=await e.request.formData();const f=fd.get('file');
        if(f&&f.size){const c=await caches.open('tico-share');await c.put('shared-file',new Response(f,{headers:{'x-name':encodeURIComponent(f.name||'extrato'),'content-type':f.type||'application/octet-stream'}}))}}catch(err){}
      return Response.redirect(new URL('./?shared=1',self.registration.scope).href,303)})());
  }
});
