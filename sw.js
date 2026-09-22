/* Service Worker di "Super organizer".
   Serve a due cose:
   1) Far caricare la pagina (e le librerie Firebase) anche senza connessione,
      una volta che l'app è già stata aperta almeno una volta online.
   2) Tenere in cache le versioni dei file, aggiornandole in automatico quando
      l'app viene aperta di nuovo online.

   La pagina dell'app (index.html) viene sempre richiesta prima alla rete, e la
   cache viene usata solo come riserva per quando manca la connessione: così,
   ogni volta che c'è internet, si vede sempre l'ultima versione caricata su
   GitHub, sia da computer sia da smartphone, senza dover fare nulla di
   speciale (era proprio questo il problema: prima veniva sempre mostrata la
   versione già salvata in cache, anche quando ce n'era una più recente).

   IMPORTANTE per chi aggiorna l'app in futuro:
   Ogni volta che si carica su GitHub una nuova versione di index.html con
   modifiche importanti, conviene cambiare la stringa CACHE_VERSION qui sotto
   (basta aumentare il numero, es. da 'v2' a 'v3'). Questo forza subito la
   sostituzione dei file salvati in cache, così anche chi era offline durante
   l'aggiornamento parte comunque dalla versione più recente scaricata. */

var CACHE_VERSION = 'super-organizer-v2';

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

  if(isSameOrigin){
    /* "Network-first": la pagina dell'app viene richiesta subito alla rete, così quando
       c'è connessione si vede sempre l'ultima versione pubblicata. La cache scatta solo
       come riserva se in quel momento manca la connessione. */
    event.respondWith(
      fetch(event.request).then(function(networkResponse){
        if(networkResponse && networkResponse.ok){
          var copy = networkResponse.clone();
          caches.open(CACHE_VERSION).then(function(cache){ cache.put(event.request, copy); });
        }
        return networkResponse;
      }).catch(function(){
        return caches.match(event.request).then(function(cached){
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* Le librerie Firebase (SDK) cambiano raramente e sono numerate per versione
     nell'URL stesso: per queste va bene "stale-while-revalidate" (si mostra subito
     quella già in cache, aggiornandola in background per la prossima apertura). */
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
      return cached || networkFetch;
    })
  );
});
