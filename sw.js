/* Service Worker di "Super organizer".
   Serve a due cose:
   1) Far caricare la pagina (e le librerie Firebase) anche senza connessione,
      una volta che l'app è già stata aperta almeno una volta online.
   2) Tenere in cache le versioni dei file, aggiornandole in automatico quando
      l'app viene aperta di nuovo online.

   IMPORTANTE per chi aggiorna l'app in futuro:
   Ogni volta che si carica su GitHub una nuova versione di index.html con
   modifiche importanti, conviene cambiare la stringa CACHE_VERSION qui sotto
   (basta aumentare il numero, es. da 'v1' a 'v2'). Questo fa sì che il
   browser scarichi la nuova versione invece di continuare a mostrare quella
   vecchia salvata in cache. Se non si cambia, l'aggiornamento arriva comunque
   dopo un po' (il service worker si aggiorna da solo in background), ma
   cambiare il numero lo rende immediato al successivo avvio dell'app. */

var CACHE_VERSION = 'super-organizer-v1';

var PRECACHE_URLS = [
  './',
  './index.html',
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache){
      return Promise.all(PRECACHE_URLS.map(function(url){
        return fetch(url).then(function(res){
          if(res && res.ok) return cache.put(url, res);
        }).catch(function(){
          /* Se una risorsa non si riesce a scaricare ora (es. rete instabile
             durante l'installazione), non blocchiamo tutto il resto: verrà
             comunque messa in cache automaticamente al primo utilizzo online. */
        });
      }));
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){ return key !== CACHE_VERSION; })
            .map(function(key){ return caches.delete(key); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;

  var reqUrl;
  try{ reqUrl = new URL(event.request.url); }catch(err){ return; }

  var isSameOrigin = reqUrl.origin === self.location.origin;
  var isFirebaseSdk = reqUrl.hostname === 'www.gstatic.com' && reqUrl.pathname.indexOf('/firebasejs/') === 0;

  /* Tocchiamo solo la pagina dell'app stessa e le librerie Firebase caricate da
     gstatic.com: tutto il resto (le vere e proprie chiamate a Firestore/Auth per
     leggere e salvare i dati) passa dritto alla rete, senza che il service
     worker interferisca — a quello pensa già la cache offline di Firestore. */
  if(!isSameOrigin && !isFirebaseSdk) return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      var networkFetch = fetch(event.request).then(function(networkResponse){
        if(networkResponse && networkResponse.ok){
          var copy = networkResponse.clone();
          caches.open(CACHE_VERSION).then(function(cache){ cache.put(event.request, copy); });
        }
        return networkResponse;
      }).catch(function(){
        return cached;
      });
      /* "Stale-while-revalidate": se c'è già una versione in cache la usiamo
         subito (avvio istantaneo, funziona anche offline), e nel frattempo
         aggiorniamo la cache in background per la prossima apertura. */
      return cached || networkFetch;
    })
  );
});
