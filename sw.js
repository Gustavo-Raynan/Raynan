// Tico Finances — service worker: notificações push e extratos compartilhados (Android).
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
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(x){d={title:'Tico Finances',body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Tico Finances',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||undefined,renotify:false,data:{link:d.link||'notifs'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();const link=(e.notification.data&&e.notification.data.link)||'notifs';
  const url=new URL('./?n='+encodeURIComponent(link),self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){if(w.url.startsWith(self.registration.scope)&&'focus' in w){w.postMessage({tico:'open',link});return w.focus()}}
    return self.clients.openWindow(url)}));
});
