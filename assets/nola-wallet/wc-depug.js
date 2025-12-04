// Verbose WalletConnect debug helper — include after nola-full-bundle-loader.js in Test.html
(function(window, document){
  try {
    console.group('[NolaWC-Debug] start');
    const loaderScript = (() => {
      const scripts = Array.from(document.getElementsByTagName('script'));
      return scripts[scripts.length - 1] || null;
    })();
    const BASE_PATH = (function(){
      try {
        if (!loaderScript || !loaderScript.src) return './';
        const src = loaderScript.src;
        const idx = src.lastIndexOf('/');
        return idx >= 0 ? src.slice(0, idx+1) : './';
      } catch(e) { return './'; }
    })();

    const LOCAL_WC = './index.min.js';
    const CDN_WC = 'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.6.0/dist/umd/index.min.js';
    const localPath = BASE_PATH + LOCAL_WC.replace(/^\.\/+/, '');

    console.log('BASE_PATH =', BASE_PATH);
    console.log('LOCAL_WC path =', localPath);
    console.log('CDN_WC =', CDN_WC);

    // Print current script tags (last 30)
    const scripts = Array.from(document.getElementsByTagName('script')).map(s => ({ src: s.src || '(inline)', async: !!s.async }));
    console.log('Script tags (last 30):', scripts.slice(-30));

    // Helper to poll for globals and print states
    function checkGlobals() {
      return {
        WalletConnect: !!window.WalletConnect,
        WalletConnectEthereumProvider: !!window.WalletConnectEthereumProvider,
        WalletConnectProvider: !!window.WalletConnectProvider,
        EthereumProvider: !!window.EthereumProvider,
        'window.NolaWallet': !!window.NolaWallet,
        ethers: !!window.ethers
      };
    }

    // Do a HEAD to localPath to see if file exists and log status
    (async () => {
      try {
        console.log('[NolaWC-Debug] HEAD ->', localPath);
        const head = await fetch(localPath, { method: 'HEAD' });
        console.log('[NolaWC-Debug] HEAD status for local index.min.js:', head.status, head.ok);
      } catch(e) {
        console.warn('[NolaWC-Debug] HEAD request for local index.min.js failed', e);
      }

      // Insert local script tag and attach events
      console.log('[NolaWC-Debug] Inserting local script tag:', localPath);
      const sLocal = document.createElement('script');
      sLocal.src = localPath;
      sLocal.async = true;
      sLocal.onload = () => {
        console.log('[NolaWC-Debug] local index.min.js onload fired');
      };
      sLocal.onerror = (ev) => {
        console.error('[NolaWC-Debug] local index.min.js onerror', ev);
      };
      document.head.appendChild(sLocal);

      // Poll for expected globals every 300ms up to 8s
      let ticks = 0;
      const maxTicks = Math.ceil(8000 / 300);
      let found = false;
      (function pollLocal() {
        ticks++;
        const state = checkGlobals();
        console.log('[NolaWC-Debug] pollLocal tick', ticks, state);
        if (state.WalletConnect || state.WalletConnectEthereumProvider || state.WalletConnectProvider || state.EthereumProvider) {
          console.log('[NolaWC-Debug] Provider global detected after local load');
          found = true;
          proceedReport();
          return;
        }
        if (ticks >= maxTicks) {
          console.warn('[NolaWC-Debug] No provider globals after local load; will try CDN vendor directly');
          proceedToCdn();
          return;
        }
        setTimeout(pollLocal, 300);
      })();

      async function proceedToCdn() {
        try {
          // Do a quick fetch of CDN to see status (not to execute it yet)
          console.log('[NolaWC-Debug] Fetching CDN vendor HEAD', CDN_WC);
          // Use HEAD if allowed; otherwise GET small range
          try {
            const r = await fetch(CDN_WC, { method: 'HEAD' });
            console.log('[NolaWC-Debug] CDN HEAD status:', r.status, r.ok);
          } catch (e) {
            console.warn('[NolaWC-Debug] CDN HEAD failed (CORS?) — try GET', e);
            // Try a normal GET but don't wait for full response text, just check response.ok
            const r2 = await fetch(CDN_WC, { method: 'GET' });
            console.log('[NolaWC-Debug] CDN GET status:', r2.status, r2.ok);
          }

          // Insert CDN vendor script tag (force it)
          console.log('[NolaWC-Debug] Inserting CDN vendor script tag:', CDN_WC);
          const sCdn = document.createElement('script');
          sCdn.src = CDN_WC;
          sCdn.async = true;
          sCdn.onload = () => { console.log('[NolaWC-Debug] CDN vendor onload fired'); };
          sCdn.onerror = (ev) => { console.error('[NolaWC-Debug] CDN vendor onerror', ev); };
          document.head.appendChild(sCdn);

          // Poll for globals again up to 8s
          let ticks2 = 0;
          const maxTicks2 = Math.ceil(8000 / 300);
          (function pollCdn() {
            ticks2++;
            const state = checkGlobals();
            console.log('[NolaWC-Debug] pollCdn tick', ticks2, state);
            if (state.WalletConnect || state.WalletConnectEthereumProvider || state.WalletConnectProvider || state.EthereumProvider) {
              console.log('[NolaWC-Debug] Provider global detected after CDN load');
              found = true;
              proceedReport();
              return;
            }
            if (ticks2 >= maxTicks2) {
              console.error('[NolaWC-Debug] Provider globals NOT found after CDN attempt');
              proceedReport();
              return;
            }
            setTimeout(pollCdn, 300);
          })();

        } catch (e) {
          console.error('[NolaWC-Debug] Error during CDN attempt', e);
          proceedReport();
        }
      }

      function proceedReport() {
        console.log('[NolaWC-Debug] Final globals state:', checkGlobals());
        console.log('[NolaWC-Debug] Script tags (last 30):', Array.from(document.getElementsByTagName('script')).map(s => ({ src: s.src || '(inline)', async: !!s.async })).slice(-30));
        console.groupEnd();
      }

    })().catch(e => { console.error('[NolaWC-Debug] unexpected', e); console.groupEnd(); });

  } catch (e) {
    console.error('[NolaWC-Debug] top-level error', e);
  }
})(window, document);
