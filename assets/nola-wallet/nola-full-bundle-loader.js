/* NOLA Full Bundle Loader — improved Ethers + WalletConnect loading (waits for wrapper -> vendor) */
(function (window, document) {
  'use strict';

  const META_WC_PROJECT = document.querySelector('meta[name="nola-walletconnect-project-id"]');
  const META_POLYGON_RPC = document.querySelector('meta[name="nola-polygon-rpc"]');

  const WALLETCONNECT_PROJECT_ID = (META_WC_PROJECT && META_WC_PROJECT.content) ? META_WC_PROJECT.content.trim() : '';
  const POLYGON_RPC = (META_POLYGON_RPC && META_POLYGON_RPC.content) ? META_POLYGON_RPC.content.trim() : 'https://polygon-rpc.com/';
  const POLYGON_CHAIN_ID_HEX = '0x89';
  const POLYGON_CHAIN_ID_DEC = 137;

  const LOCAL_ETHERS = './ethers.umd.min.js';
  const LOCAL_WC = './index.min.js';

  const CDN_ETHERS = 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';
  const CDN_WC = 'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.6.0/dist/umd/index.min.js';

  function getThisScriptBasePath() {
    try {
      const scripts = document.getElementsByTagName('script');
      const current = scripts[scripts.length - 1];
      const src = current && current.src ? current.src : '';
      if (!src) return '.';
      const idx = src.lastIndexOf('/');
      return idx >= 0 ? src.slice(0, idx + 1) : './';
    } catch (e) {
      return './';
    }
  }
  const BASE_PATH = getThisScriptBasePath();
  const LOCAL_ETHERS_PATH = BASE_PATH + LOCAL_ETHERS.replace(/^\.\/+/, '');
  const LOCAL_WC_PATH = BASE_PATH + LOCAL_WC.replace(/^\.\/+/, '');

  // Basic script loader: insert script (local first if available), with a flexible global check
  function loadScriptPreferLocal(localUrl, cdnUrl, globalCheckFn, timeout = 12000) {
    return new Promise((resolve, reject) => {
      function insertScript(url) {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => {
          setTimeout(() => {
            if (globalCheckFn && globalCheckFn()) resolve({ url, loaded: true });
            else if (!globalCheckFn) resolve({ url, loaded: true });
            else reject(new Error('Loaded script but expected global not found: ' + url));
          }, 40);
        };
        s.onerror = () => reject(new Error('Failed to load script: ' + url));
        document.head.appendChild(s);
      }

      // Try HEAD on the local file first; fallback to CDN
      fetch(localUrl, { method: 'HEAD' }).then(headRes => {
        if (headRes.ok) insertScript(localUrl);
        else insertScript(cdnUrl);
      }).catch(() => insertScript(cdnUrl));

      setTimeout(() => reject(new Error('Timeout loading ' + (localUrl || cdnUrl))), timeout);
    });
  }

  // Wait for any of a set of global names to be defined, polling up to timeout
  function waitForAnyGlobal(names, timeout = 6000, interval = 200) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        for (const n of names) {
          try {
            const parts = n.split('.');
            let cur = window;
            let ok = true;
            for (const p of parts) {
              if (cur[p] === undefined) { ok = false; break; }
              cur = cur[p];
            }
            if (ok) return resolve(n);
          } catch (e) { /* swallow */ }
        }
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(check, interval);
      })();
    });
  }

  // --- ENSURE ETHERS LOADED (robust for wrapper -> vendor patterns) ---
  let _ethersLoadPromise = null;
  async function ensureEthersLoaded() {
    if (window.ethers) return true;
    if (_ethersLoadPromise) return _ethersLoadPromise;

    _ethersLoadPromise = (async () => {
      try {
        // Attempt to insert a local wrapper or local UMD first; do NOT require the global immediately
        // (the local file may itself inject the vendor script asynchronously)
        try {
          await loadScriptPreferLocal(LOCAL_ETHERS_PATH, CDN_ETHERS, () => true, 8000);
        } catch (err) {
          // local HEAD failed or local wrapper failed quickly; try CDN directly
          console.warn('[NolaWallet] local ethers insertion failed or wrapper not found; attempting CDN', err);
          try {
            await loadScriptPreferLocal(CDN_ETHERS, CDN_ETHERS, () => !!window.ethers, 12000);
          } catch (err2) {
            console.error('[NolaWallet] CDN ethers insertion failed', err2);
            return false;
          }
        }

        // Wait up to a short period for window.ethers to appear (covers wrapper that loads vendor)
        const found = await waitForAnyGlobal(['ethers'], 6000, 200);
        if (found) {
          console.log('[NolaWallet] ethers available via', found);
          return true;
        }

        // If not found after waiting, try CDN directly (second chance)
        try {
          await loadScriptPreferLocal(CDN_ETHERS, CDN_ETHERS, () => !!window.ethers, 12000);
        } catch (e) {
          console.warn('[NolaWallet] second attempt to load CDN ethers failed', e);
        }
        const found2 = await waitForAnyGlobal(['ethers'], 6000, 200);
        if (found2) {
          console.log('[NolaWallet] ethers available after CDN load via', found2);
          return true;
        }

        console.error('[NolaWallet] ethers not available after attempts');
        return false;
      } catch (err) {
        console.error('[NolaWallet] ensureEthersLoaded unexpected error', err);
        _ethersLoadPromise = null;
        return false;
      }
    })();

    return _ethersLoadPromise;
  }

  // UI helpers (inject styles + modal)
  const STYLE_ID = 'nola-wallet-style';
  const MODAL_ID = 'nola-chip-modal';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
:root{ --purple-700:#5a0fa8; --purple-500:#7b2bff; --purple-300:#b595ff; }
.nola-connect-btn{ background:linear-gradient(90deg,var(--purple-700),var(--purple-500)); color:#fff; padding:10px 14px; border-radius:10px; border:0; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:8px; }
.nola-connected-chip{ display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background: linear-gradient(90deg, rgba(123,43,255,0.12), rgba(90,15,168,0.04)); color:#fff; font-weight:700; }
.nola-chip-modal{ position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:linear-gradient(180deg, rgba(6,3,10,0.6), rgba(6,3,10,0.8)); z-index:100000; font-family:Arial,Helvetica,sans-serif; }
.nola-chip-sheet{ width:100%; max-width:560px; background:linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02)); border-radius:14px; padding:18px; box-sizing:border-box; color:#fff; }
.nola-wallet-item{ display:flex; justify-content:space-between; padding:12px; border-radius:10px; margin-bottom:10px; background: rgba(123,43,255,0.04); cursor:pointer; transition: transform .12s ease; }
.nola-wallet-item:hover{ transform:translateY(-3px); }
.nola-status{ margin-top:8px; color:#d9c9ff; font-size:13px; }
@media (max-width:520px){ .nola-chip-sheet{ margin:16px; } }
`;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function createModalIfMissing() {
    if (document.getElementById(MODAL_ID)) return;
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'nola-chip-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const sheet = document.createElement('div');
    sheet.className = 'nola-chip-sheet';
    sheet.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-weight:800;color:#b595ff;font-size:18px">Connect wallet</div>
          <div style="font-size:13px;color:#d9c7ff;margin-top:4px">Choose a wallet to connect to Polygon</div>
        </div>
        <button id="nola-close" style="background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div id="nola-wallet-list">
        <div class="nola-wallet-item" data-kind="injected">
          <div>
            <div style="font-weight:700">Injected wallet</div>
            <div style="font-size:12px;opacity:0.9">MetaMask, Binance extension, or mobile injected wallets</div>
          </div>
          <div style="align-self:center;color:#dcd0ff">Injected</div>
        </div>
        <div class="nola-wallet-item" data-kind="walletconnect">
          <div>
            <div style="font-weight:700">WalletConnect</div>
            <div style="font-size:12px;opacity:0.9">QR or deep link (WalletConnect v2)</div>
          </div>
          <div style="align-self:center;color:#dcd0ff">QR / Deep Link</div>
        </div>
      </div>
      <div id="nola-modal-status" class="nola-status" style="display:none"></div>
    `;
    modal.appendChild(sheet);
    document.body.appendChild(modal);

    document.getElementById('nola-close').addEventListener('click', hideModal);
    modal.addEventListener('click', (ev) => { if (ev.target === modal) hideModal(); });

    sheet.querySelectorAll('.nola-wallet-item').forEach(item => {
      item.addEventListener('click', async () => {
        const kind = item.getAttribute('data-kind');
        if (kind === 'injected') {
          showStatus('Connecting to injected wallet...');
          await connectInjected();
        } else {
          showStatus('Opening WalletConnect modal...');
          await connectWalletConnectV2();
        }
      });
    });
  }

  function showModal() { createModalIfMissing(); const m = document.getElementById(MODAL_ID); if (m) m.style.display = 'flex'; hideStatus(); }
  function hideModal() { const m = document.getElementById(MODAL_ID); if (m) m.style.display = 'none'; }
  function showStatus(msg) { const s = document.getElementById('nola-modal-status'); if (s) { s.style.display = 'block'; s.textContent = msg; } console.log('[NOLA-wallet] ' + msg); }
  function hideStatus() { const s = document.getElementById('nola-modal-status'); if (s) { s.style.display = 'none'; s.textContent = ''; } }

  let rawProvider = null;
  let ethersProvider = null;
  let signer = null;
  let connectedAddress = null;
  let connectedBalance = null;

  function shortAddr(addr) { return addr ? addr.slice(0,6) + '…' + addr.slice(-4) : ''; }
  function updateButtons() {
    document.querySelectorAll('.connect-wallet').forEach(btn => {
      if (connectedAddress) {
        btn.innerHTML = '';
        const chip = document.createElement('div');
        chip.className = 'nola-connected-chip';
        chip.title = connectedAddress;
        chip.innerHTML = `<span style="font-family:monospace">${shortAddr(connectedAddress)}</span><span style="background:rgba(255,255,255,0.02);padding:4px 8px;border-radius:6px;color:#ffd6ff;margin-left:8px">${connectedBalance ?? ''}</span>`;
        chip.addEventListener('click', disconnect);
        btn.appendChild(chip);
      } else {
        const defaultText = btn.getAttribute('data-default-text') || 'Connect Wallet';
        btn.textContent = defaultText;
      }
    });
  }

  async function ensurePolygonChain(raw) {
    try {
      const current = await raw.request({ method: 'eth_chainId' });
      if (current && current.toLowerCase() === POLYGON_CHAIN_ID_HEX) return;
      await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] });
    } catch (err) {
      const code = err?.code;
      if (code === 4902 || (err && /Unrecognized chain/i.test(err.message || ''))) {
        await raw.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: POLYGON_CHAIN_ID_HEX,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls: [POLYGON_RPC],
            blockExplorerUrls: ['https://polygonscan.com']
          }]
        });
        await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] });
      } else {
        throw err;
      }
    }
  }

  function setupInjectedListeners(raw) {
    if (!raw || !raw.on) return;
    try {
      raw.on('accountsChanged', async (accounts) => {
        if (!accounts || accounts.length === 0) { disconnect(); return; }
        try {
          if (!window.ethers) {
            const ok = await ensureEthersLoaded();
            if (!ok) { connectedAddress = accounts[0]; updateButtons(); return; }
          }
          connectedAddress = window.ethers.utils.getAddress(accounts[0]);
          ethersProvider.getBalance(connectedAddress).then(b => {
            connectedBalance = Number(window.ethers.utils.formatEther(b)).toFixed(4);
            updateButtons();
          }).catch(()=> updateButtons());
        } catch (e) {
          console.warn('accountsChanged handler error', e);
          connectedAddress = accounts[0];
          updateButtons();
        }
      });
      raw.on('chainChanged', (chainId) => {
        if (chainId !== POLYGON_CHAIN_ID_HEX) showStatus('Please switch to Polygon network in your wallet.');
        else hideStatus();
      });
      raw.on('disconnect', () => disconnect());
    } catch (e) {
      console.warn('Could not attach listeners on injected provider', e);
    }
  }

  async function connectInjected() {
    try {
      if (!window.ethereum) { showStatus('No injected wallet detected. Use MetaMask or Binance extension/mobile.'); return; }
      if (!window.ethers) {
        showStatus('Ethers library not loaded yet. Attempting to load...');
        const ok = await ensureEthersLoaded();
        if (!ok) { showStatus('Ethers load failed. Please ensure ethers UMD is reachable or add it to assets/nola-wallet.'); return; }
      }
      showStatus('Requesting account access...');
      rawProvider = window.ethereum;
      await ensurePolygonChain(rawProvider);
      await rawProvider.request({ method: 'eth_requestAccounts' });
      ethersProvider = new window.ethers.providers.Web3Provider(rawProvider);
      signer = ethersProvider.getSigner();
      connectedAddress = await signer.getAddress();
      const bal = await ethersProvider.getBalance(connectedAddress);
      connectedBalance = Number(window.ethers.utils.formatEther(bal)).toFixed(4);
      setupInjectedListeners(rawProvider);
      hideModal();
      updateButtons();
      hideStatus();
    } catch (err) { console.error('Injected connect error', err); showStatus('Injected connection failed: ' + (err?.message || err)); }
  }

  async function connectWalletConnectV2() {
    try {
      if (!window.ethers) {
        showStatus('Ethers library not loaded yet. Attempting to load...');
        const ok = await ensureEthersLoaded();
        if (!ok) throw new Error('Ethers load failed');
      }

      // Try to ensure WalletConnect UMD is available.
      const expectedGlobals = [
        'WalletConnect',
        'WalletConnect.EthereumProvider',
        'WalletConnect.default',
        'WalletConnectEthereumProvider',
        'WalletConnectProvider',
        'EthereumProvider'
      ];

      try {
        await loadScriptPreferLocal(LOCAL_WC_PATH, CDN_WC, () => true, 8000);
      } catch (err) {
        console.warn('Local index.min.js fetch failed or wrapper reported problem, trying CDN directly', err);
        try {
          await loadScriptPreferLocal(CDN_WC, CDN_WC, () => !!window.WalletConnect || !!window.WalletConnectEthereumProvider || !!window.EthereumProvider, 12000);
        } catch (err2) {
          console.error('Direct CDN WalletConnect load also failed', err2);
        }
      }

      const found = await waitForAnyGlobal(['WalletConnect', 'WalletConnectEthereumProvider', 'WalletConnectProvider', 'EthereumProvider', 'WalletConnect.default', 'WalletConnect.EthereumProvider'], 6000, 250);
      if (!found) {
        try {
          await loadScriptPreferLocal(CDN_WC, CDN_WC, () => !!window.WalletConnect || !!window.WalletConnectEthereumProvider || !!window.EthereumProvider, 12000);
        } catch (err) {
          console.error('CDN load attempt failed', err);
        }
        const found2 = await waitForAnyGlobal(['WalletConnect', 'WalletConnectEthereumProvider', 'WalletConnectProvider', 'EthereumProvider', 'WalletConnect.default', 'WalletConnect.EthereumProvider'], 6000, 250);
        if (!found2) {
          showStatus('WalletConnect provider not available. Ensure index.min.js (WalletConnect UMD) is placed alongside this loader or CDN is reachable.');
          return;
        }
      }

      let WC = null;
      if (window.WalletConnect && (window.WalletConnect.EthereumProvider || window.WalletConnect.default)) {
        WC = window.WalletConnect.EthereumProvider || window.WalletConnect.default;
      } else if (window.WalletConnectEthereumProvider) {
        WC = window.WalletConnectEthereumProvider;
      } else if (window.WalletConnectProvider) {
        WC = window.WalletConnectProvider;
      } else if (window.EthereumProvider) {
        WC = window.EthereumProvider;
      } else if (window.WalletConnect) {
        WC = window.WalletConnect;
      }

      if (!WC) {
        showStatus('WalletConnect provider not available. Ensure index.min.js (WalletConnect UMD) is placed alongside this loader.');
        return;
      }

      if (!WALLETCONNECT_PROJECT_ID) {
        showStatus('Missing WalletConnect Project ID. Add <meta name=\"nola-walletconnect-project-id\" content=\"...\"> to the page.');
        return;
      }

      let instance = null;
      if (typeof WC.init === 'function') {
        instance = await WC.init({
          projectId: WALLETCONNECT_PROJECT_ID,
          chains: [POLYGON_CHAIN_ID_DEC],
          showQrModal: true,
          rpcMap: { [POLYGON_CHAIN_ID_DEC]: POLYGON_RPC },
          metadata: { name: document.title || 'NOLA', description: 'Connect to Polygon via WalletConnect v2', url: window.location.origin, icons: [] }
        });
      } else {
        instance = new WC({
          projectId: WALLETCONNECT_PROJECT_ID,
          chains: [POLYGON_CHAIN_ID_DEC],
          showQrModal: true,
          rpcMap: { [POLYGON_CHAIN_ID_DEC]: POLYGON_RPC },
          metadata: { name: document.title || 'NOLA', description: 'Connect to Polygon via WalletConnect v2', url: window.location.origin, icons: [] }
        });
        if (typeof instance.init === 'function') await instance.init();
      }

      rawProvider = instance;
      await rawProvider.request({ method: 'eth_requestAccounts' });

      ethersProvider = new window.ethers.providers.Web3Provider(rawProvider);
      signer = ethersProvider.getSigner();
      const accounts = await ethersProvider.listAccounts();
      if (!accounts || accounts.length === 0) {
        showStatus('No accounts from WalletConnect.');
        return;
      }
      connectedAddress = window.ethers.utils.getAddress(accounts[0]);
      const bal = await ethersProvider.getBalance(connectedAddress);
      connectedBalance = Number(window.ethers.utils.formatEther(bal)).toFixed(4);

      if (rawProvider.on) {
        rawProvider.on('disconnect', () => disconnect());
        rawProvider.on('accountsChanged', (accounts) => {
          if (!accounts || accounts.length === 0) { disconnect(); return; }
          connectedAddress = window.ethers.utils.getAddress(accounts[0]);
          ethersProvider.getBalance(connectedAddress).then(b => {
            connectedBalance = Number(window.ethers.utils.formatEther(b)).toFixed(4);
            updateButtons();
          }).catch(()=>updateButtons());
        });
        rawProvider.on('chainChanged', (chainId) => {
          if (chainId !== POLYGON_CHAIN_ID_HEX) showStatus('Please switch your wallet back to Polygon.');
          else hideStatus();
        });
      }

      hideModal();
      updateButtons();
      hideStatus();
    } catch (err) {
      console.error('WalletConnect connect error', err);
      showStatus('WalletConnect failed: ' + (err?.message || err));
    }
  }

  async function disconnect() {
    try {
      if (rawProvider && typeof rawProvider.disconnect === 'function') {
        try { await rawProvider.disconnect(); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    rawProvider = null; ethersProvider = null; signer = null;
    connectedAddress = null; connectedBalance = null;
    updateButtons();
    hideStatus();
  }

  function attachButtons(selector = '.connect-wallet') {
    injectStyles();
    createModalIfMissing();
    document.querySelectorAll(selector).forEach(btn => {
      if (!btn.hasAttribute('data-default-text')) {
        btn.setAttribute('data-default-text', btn.textContent.trim() || 'Connect Wallet');
      }
      btn.addEventListener('click', (e) => {
        if (connectedAddress) {
          disconnect();
          return;
        }
        showModal();
      });
    });
    updateButtons();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureEthersLoaded().catch(()=>{});
    if (document.querySelectorAll('.connect-wallet').length > 0) {
      attachButtons('.connect-wallet');
    }
  });

  window.NolaWallet = {
    init: attachButtons,
    connectInjected,
    connectWalletConnectV2,
    disconnect,
    getAddress: () => connectedAddress,
    getBalance: () => connectedBalance,
    _internals: { BASE_PATH, LOCAL_ETHERS_PATH, LOCAL_WC_PATH, ensureEthersLoaded }
  };

  console.log('Nola full bundle loader ready. Use NolaWallet.init() to configure programmatically.');
})(window, document);
