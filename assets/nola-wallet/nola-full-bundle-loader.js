/*!
 * NOLA Full Bundle Loader (local-first)
 *
 * Purpose:
 * - Single, copy/paste-ready loader that makes the Connect Wallet buttons work 100%.
 * - Prefers local UMD builds (no network); if not found, falls back to CDN.
 * - Initializes injected wallet support (MetaMask / Binance) and WalletConnect v2 (if provider UMD available).
 * - Keeps purple theme, modal, connected chip (address + MATIC balance), disconnect behavior.
 *
 * How it works:
 * - Place this file into your repo (assets/nola-wallet/) and add styles.nola.css (also provided).
 * - Also place the UMD files locally in the same folder:
 *     - ethers.umd.min.js  (downloaded from the ethers v5 UMD)
 *     - index.min.js       (WalletConnect v2 UMD)
 *   The loader will attempt to load these local files first (no CDN), ensuring the page works offline.
 * - If local UMD files are absent, the loader will try CDN versions as a fallback.
 *
 * Notes:
 * - I cannot legally or practically inline the entire UMD library code here due to size and license/maintenance reasons.
 *   This loader gives you a true "no-node" drop-in experience: copy three files into a folder and update your HTML.
 *
 * Security:
 * - Keeps runtime minimal. Do not commit private RPC keys. Use meta tags (see README below) to set RPC & WC project id.
 *
 * Usage (short):
 * 1) Create assets/nola-wallet/
 * 2) Put this file and styles.nola.css into that folder.
 * 3) Download and put ethers.umd.min.js and walletconnect UMD index.min.js into same folder (exact URLs provided below).
 * 4) Add meta tags to each HTML page and link CSS + this script. Add class "connect-wallet" to buttons.
 *
 * Built to work with ethers v5 (5.7.2 recommended) and @walletconnect/ethereum-provider v2.x UMD.
 */

(function (window, document) {
  'use strict';

  // --- CONFIG (meta-based; prefer meta tags on each page so JS file doesn't contain secrets) ---
  const META_WC_PROJECT = document.querySelector('meta[name="nola-walletconnect-project-id"]');
  const META_POLYGON_RPC = document.querySelector('meta[name="nola-polygon-rpc"]');

  const WALLETCONNECT_PROJECT_ID = (META_WC_PROJECT && META_WC_PROJECT.content) ? META_WC_PROJECT.content.trim() : '';
  const POLYGON_RPC = (META_POLYGON_RPC && META_POLYGON_RPC.content) ? META_POLYGON_RPC.content.trim() : 'https://polygon-rpc.com/';

  const POLYGON_CHAIN_ID_HEX = '0x89';
  const POLYGON_CHAIN_ID_DEC = 137;

  // Local filenames to prefer (place these next to this loader file)
  const LOCAL_ETHERS = './ethers.umd.min.js';
  const LOCAL_WC = './index.min.js'; // walletconnect ethereum-provider UMD

  // CDN fallbacks (only used if local files absent)
  const CDN_ETHERS = 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';
  const CDN_WC = 'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.6.0/dist/umd/index.min.js';

  // Utility: determine base path of this script so local references work relative to script location
  function getThisScriptBasePath() {
    try {
      const scripts = document.getElementsByTagName('script');
      // last script is usually current one if included directly
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

  // Resolve local path relative to loader file
  const LOCAL_ETHERS_PATH = BASE_PATH + LOCAL_ETHERS.replace(/^\.\/+/, '');
  const LOCAL_WC_PATH = BASE_PATH + LOCAL_WC.replace(/^\.\/+/, '');

  // Script loader that tries local then CDN. Accepts a check function that returns true when desired global is present.
  function loadScriptPreferLocal(localUrl, cdnUrl, globalCheckFn, timeout = 12000) {
    return new Promise((resolve, reject) => {
      // Helper to insert a script
      function insertScript(url) {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => {
          setTimeout(() => {
            if (globalCheckFn && globalCheckFn()) {
              resolve({ url, loaded: true });
            } else if (!globalCheckFn) {
              resolve({ url, loaded: true });
            } else {
              // we loaded script but global didn't appear -> treat as failure for this URL
              reject(new Error('Loaded script but expected global not found: ' + url));
            }
          }, 30);
        };
        s.onerror = () => reject(new Error('Failed to load script: ' + url));
        document.head.appendChild(s);
      }

      // Try local first (but check for accessibility quickly via fetch HEAD)
      fetch(localUrl, { method: 'HEAD' }).then(headRes => {
        if (headRes.ok) {
          insertScript(localUrl);
        } else {
          // try CDN
          insertScript(cdnUrl);
        }
      }).catch(() => {
        // fetch failed (likely file not present) -> fallback to CDN
        insertScript(cdnUrl);
      });

      // safety timeout
      setTimeout(() => reject(new Error('Timeout loading ' + (localUrl || cdnUrl))), timeout);
    });
  }

  // --- UI helpers (inject styles + modal) ---
  const STYLE_ID = 'nola-wallet-style';
  const MODAL_ID = 'nola-chip-modal';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
:root{ --purple-700:#5a0fa8; --purple-500:#7b2bff; --purple-300:#b595ff; }
.nola-connect-btn{ background:linear-gradient(90deg,var(--purple-700),var(--purple-500)); color:#fff; padding:10px 14px; border-radius:10px; border:0; cursor:pointer; font-weight:600; display:inline-flex; gap:8px; align-items:center; }
.nola-connected-chip{ display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background: linear-gradient(90deg, rgba(123,43,255,0.12), rgba(90,15,168,0.04)); color:#fff; font-weight:700; cursor:pointer; }
.nola-chip-modal{ position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:linear-gradient(180deg, rgba(6,3,10,0.6), rgba(6,3,10,0.8)); z-index:100000; font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial; }
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

  function showModal() {
    createModalIfMissing();
    const m = document.getElementById(MODAL_ID);
    if (m) m.style.display = 'flex';
    hideStatus();
  }
  function hideModal() {
    const m = document.getElementById(MODAL_ID);
    if (m) m.style.display = 'none';
  }
  function showStatus(msg) {
    const s = document.getElementById('nola-modal-status');
    if (s) { s.style.display = 'block'; s.textContent = msg; }
    console.log('[NOLA-wallet] ' + msg);
  }
  function hideStatus() {
    const s = document.getElementById('nola-modal-status');
    if (s) { s.style.display = 'none'; s.textContent = ''; }
  }

  // --- State ---
  let rawProvider = null;
  let ethersProvider = null;
  let signer = null;
  let connectedAddress = null;
  let connectedBalance = null;

  function short(addr) { return addr ? addr.slice(0,6) + '…' + addr.slice(-4) : ''; }
  function updateButtons() {
    document.querySelectorAll('.connect-wallet').forEach(btn => {
      if (connectedAddress) {
        btn.innerHTML = '';
        const chip = document.createElement('div');
        chip.className = 'nola-connected-chip';
        chip.title = connectedAddress;
        chip.innerHTML = `<span style="font-family:monospace">${short(connectedAddress)}</span><span style="background:rgba(255,255,255,0.02);padding:4px 8px;border-radius:6px;color:#ffd6ff;margin-left:8px;font-weight:700">${connectedBalance} MATIC</span>`;
        chip.addEventListener('click', disconnect);
        btn.appendChild(chip);
      } else {
        const defaultText = btn.getAttribute('data-default-text') || 'Connect Wallet';
        btn.textContent = defaultText;
      }
    });
  }

  // --- Provider helpers ---
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
      raw.on('accountsChanged', (accounts) => {
        if (!accounts || accounts.length === 0) { disconnect(); return; }
        connectedAddress = window.ethers.utils.getAddress(accounts[0]);
        ethersProvider.getBalance(connectedAddress).then(b => {
          connectedBalance = Number(window.ethers.utils.formatEther(b)).toFixed(4);
          updateButtons();
        }).catch(()=> updateButtons());
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

  // --- Connect flows ---
  async function connectInjected() {
    try {
      if (!window.ethereum) {
        showStatus('No injected wallet detected. Use MetaMask or Binance extension/mobile.');
        return;
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
    } catch (err) {
      console.error('Injected connect error', err);
      showStatus('Injected connection failed: ' + (err?.message || err));
    }
  }

  async function connectWalletConnectV2() {
    try {
      // Ensure ethers present
      if (!window.ethers) {
        showStatus('Ethers library not loaded yet. Attempting to load...');
        await loadScriptPreferLocal(LOCAL_ETHERS_PATH, CDN_ETHERS, () => !!window.ethers).catch(e => {
          console.error('Failed to load ethers:', e);
          throw new Error('Ethers load failed');
        });
      }

      // Ensure WC provider present
      const wcAvailable = !!(window.WalletConnect && (window.WalletConnect.EthereumProvider || window.WalletConnect.default)) ||
                          !!window.WalletConnectEthereumProvider ||
                          !!window.WalletConnectProvider ||
                          !!window.EthereumProvider;
      if (!wcAvailable) {
        // try load local or CDN
        await loadScriptPreferLocal(LOCAL_WC_PATH, CDN_WC, () => {
          return !!(window.WalletConnect && (window.WalletConnect.EthereumProvider || window.WalletConnect.default)) ||
                 !!window.WalletConnectEthereumProvider ||
                 !!window.WalletConnectProvider ||
                 !!window.EthereumProvider;
        }).catch(err => {
          console.error('WalletConnect UMD load failed', err);
        });
      }

      // Evaluate available global
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
        showStatus('Missing WalletConnect Project ID. Add <meta name="nola-walletconnect-project-id" content="..."> to the page.');
        return;
      }

      // init provider (factory or constructor)
      let instance = null;
      if (typeof WC.init === 'function') {
        instance = await WC.init({
          projectId: WALLETCONNECT_PROJECT_ID,
          chains: [POLYGON_CHAIN_ID_DEC],
          showQrModal: true,
          rpcMap: { [POLYGON_CHAIN_ID_DEC]: POLYGON_RPC },
          metadata: {
            name: document.title || 'NOLA',
            description: 'Connect to Polygon via WalletConnect v2',
            url: window.location.origin,
            icons: []
          }
        });
      } else {
        // try construct
        instance = new WC({
          projectId: WALLETCONNECT_PROJECT_ID,
          chains: [POLYGON_CHAIN_ID_DEC],
          showQrModal: true,
          rpcMap: { [POLYGON_CHAIN_ID_DEC]: POLYGON_RPC },
          metadata: {
            name: document.title || 'NOLA',
            description: 'Connect to Polygon via WalletConnect v2',
            url: window.location.origin,
            icons: []
          }
        });
        if (typeof instance.init === 'function') await instance.init();
      }

      rawProvider = instance;
      await rawProvider.request({ method: 'eth_requestAccounts' });

      if (!window.ethers) {
        showStatus('Ethers still not available after attempt to load. Aborting.');
        return;
      }

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

  // --- Button wiring ---
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

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelectorAll('.connect-wallet').length > 0) {
      attachButtons('.connect-wallet');
    }
  });

  // Expose public API
  window.NolaWallet = {
    init: attachButtons,
    connectInjected,
    connectWalletConnectV2,
    disconnect,
    getAddress: () => connectedAddress,
    getBalance: () => connectedBalance,
    _internals: { BASE_PATH, LOCAL_ETHERS_PATH, LOCAL_WC_PATH }
  };

  console.log('Nola full bundle loader ready. Use NolaWallet.init() to configure programmatically.');
})(window, document);
