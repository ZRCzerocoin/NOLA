/**
 * src/wallet.js
 *
 * A small, reusable wallet connector module:
 * - Bundles WalletConnect v2 (via npm) and ethers (v5)
 * - Exposes initNolaWallet(options) to bind connect behavior to buttons
 * - Auto-initializes buttons with class "connect-wallet" when loaded in the page
 *
 * Usage:
 * 1) Ensure you include the built script in every HTML file:
 *    <script type="module" src="/dist/assets/index.js"></script> (after build),
 *    or during dev: <script type="module" src="/src/wallet.js"></script>
 *
 * 2) Add a button anywhere:
 *    <button class="connect-wallet connect-btn">Connect Wallet</button>
 *
 * 3) The module will attach a modal and connect flows (injected + WalletConnect v2).
 *
 * CONFIG:
 * - Uses import.meta.env.VITE_POLYGON_RPC and VITE_WALLETCONNECT_PROJECT_ID (Vite .env)
 *
 * Security notes:
 * - Do not commit real keys. Use .env.local or your CI secrets for builds.
 * - WalletConnect Project ID must be valid.
 */

import { ethers } from 'ethers';
import EthereumProvider from '@walletconnect/ethereum-provider';

// Config (prefer env)
const POLYGON_CHAIN_ID_HEX = '0x89';
const POLYGON_CHAIN_ID_DEC = 137;
const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC || '';
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

/* -------------------------
   Small UI / DOM utilities
   ------------------------- */
function createModalIfMissing() {
  if (document.getElementById('nola-chip-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'nola-chip-modal';
  modal.className = 'nola-chip-modal';
  modal.innerHTML = `
    <div class="nola-chip-sheet" role="dialog" aria-modal="true" aria-label="Connect wallet">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-weight:700;color:var(--purple-300);font-size:16px">Connect Wallet</div>
          <div style="font-size:13px;color:#cfc7ee">Choose a wallet to connect to Polygon</div>
        </div>
        <button id="nola-close-modal" style="background:transparent;border:none;color:#dcd0ff;font-size:18px;cursor:pointer">✕</button>
      </div>

      <div id="nola-wallet-list">
        <div class="wallet-chip" data-kind="injected">
          <div>Injected Wallet</div>
          <div style="opacity:0.9">Browser / mobile injected wallets</div>
        </div>
        <div class="wallet-chip" data-kind="walletconnect">
          <div>WalletConnect</div>
          <div style="opacity:0.9">Mobile wallets & deep links (v2)</div>
        </div>
      </div>

      <div id="nola-modal-status" class="nola-status" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });
  document.getElementById('nola-close-modal').addEventListener('click', hideModal);

  // bind wallet chip clicks
  document.querySelectorAll('#nola-wallet-list .wallet-chip').forEach(el => {
    el.addEventListener('click', async () => {
      const kind = el.dataset.kind;
      if (kind === 'injected') {
        await connectInjected();
      } else {
        await connectWalletConnectV2();
      }
    });
  });
}

function showModal() {
  createModalIfMissing();
  const modal = document.getElementById('nola-chip-modal');
  const status = document.getElementById('nola-modal-status');
  if (modal) modal.style.display = 'flex';
  if (status) { status.style.display = 'none'; status.textContent = ''; }
}
function hideModal(){
  const modal = document.getElementById('nola-chip-modal');
  if (modal) modal.style.display = 'none';
}

/* -------------------------
   State
   ------------------------- */
let rawProvider = null; // underlying EIP-1193 provider
let provider = null;    // ethers provider (Web3Provider)
let signer = null;
let connectedAddress = null;
let connectedBalance = null;

/* -------------------------
   Helper functions
   ------------------------- */
function short(addr){ if(!addr) return ''; return addr.slice(0,6) + '…' + addr.slice(-4); }
function showStatus(msg){
  const s = document.getElementById('nola-modal-status');
  if (s) { s.style.display = 'block'; s.textContent = msg; }
}
function hideStatusModal(){ const s = document.getElementById('nola-modal-status'); if(s){ s.style.display='none'; s.textContent=''; } }

function updateAllButtonsUI(){
  const buttons = document.querySelectorAll('.connect-wallet');
  buttons.forEach(btn => {
    if (connectedAddress) {
      btn.innerHTML = '';
      const chip = document.createElement('div');
      chip.className = 'nola-connected-chip';
      chip.title = connectedAddress;
      chip.innerHTML = `<span style="font-family:monospace">${short(connectedAddress)}</span><span style="background:rgba(255,255,255,0.02);padding:4px 8px;border-radius:6px;color:#ffd6ff;margin-left:8px">${connectedBalance} MATIC</span>`;
      chip.addEventListener('click', disconnect);
      btn.appendChild(chip);
    } else {
      btn.innerHTML = 'Connect Wallet';
    }
  });
}

/* -------------------------
   Provider helpers
   ------------------------- */
async function ensurePolygonChain(raw){
  try{
    const current = await raw.request({ method: 'eth_chainId' });
    if(current && current.toLowerCase() === POLYGON_CHAIN_ID_HEX) return;
    await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] });
  }catch(err){
    const code = err?.code;
    if(code === 4902 || (err && /Unrecognized chain/i.test(err.message || ''))) {
      // add chain
      await raw.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: POLYGON_CHAIN_ID_HEX,
          chainName: 'Polygon Mainnet',
          nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
          rpcUrls: [POLYGON_RPC || 'https://polygon-rpc.com/'],
          blockExplorerUrls: ['https://polygonscan.com']
        }]
      });
      await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: POLYGON_CHAIN_ID_HEX }] });
    } else {
      throw err;
    }
  }
}

/* -------------------------
   Connect flows
   ------------------------- */
async function connectInjected(){
  try{
    if(!window.ethereum){
      showStatus('No injected wallet detected. Use MetaMask, Binance Mobile or mobile browser wallets.');
      return;
    }
    showStatus('Connecting injected wallet...');
    rawProvider = window.ethereum;
    await ensurePolygonChain(rawProvider);
    await rawProvider.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(rawProvider);
    signer = provider.getSigner();
    connectedAddress = await signer.getAddress();
    const bal = await provider.getBalance(connectedAddress);
    connectedBalance = Number(ethers.utils.formatEther(bal)).toFixed(4);
    hideModal();
    setupInjectedListeners(rawProvider);
    updateAllButtonsUI();
    hideStatusModal();
  }catch(err){
    console.error('Injected connect error', err);
    showStatus('Injected connection failed: ' + (err.message || err));
  }
}

async function connectWalletConnectV2(){
  try{
    if(!WALLETCONNECT_PROJECT_ID){
      showStatus('Missing WalletConnect Project ID. Set VITE_WALLETCONNECT_PROJECT_ID in env.');
      return;
    }
    showStatus('Opening WalletConnect modal...');
    
    // Initialize WalletConnect provider
    rawProvider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [POLYGON_CHAIN_ID_DEC],
      showQrModal: true,
      rpcMap: { [POLYGON_CHAIN_ID_DEC]: POLYGON_RPC || 'https://polygon-rpc.com/' },
      metadata: {
        name: document.title || 'NOLA',
        description: 'Connect to Polygon',
        url: window.location.origin,
        icons: []
      }
    });

    // CONNECT STEP MUST BE AWAITED
    await rawProvider.connect(); // ensures connect() before request()

    // Request accounts safely
    const accounts = await rawProvider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) throw new Error('No accounts returned from WalletConnect');

    provider = new ethers.providers.Web3Provider(rawProvider);
    signer = provider.getSigner();
    connectedAddress = ethers.utils.getAddress(accounts[0]);
    const bal = await provider.getBalance(connectedAddress);
    connectedBalance = Number(ethers.utils.formatEther(bal)).toFixed(4);

    // Wire events
    if(rawProvider.on){
      rawProvider.on('disconnect', () => disconnect());
      rawProvider.on('accountsChanged', async (accounts) => {
        if(!accounts || accounts.length === 0) { disconnect(); return; }
        connectedAddress = ethers.utils.getAddress(accounts[0]);
        const b = await provider.getBalance(connectedAddress);
        connectedBalance = Number(ethers.utils.formatEther(b)).toFixed(4);
        updateAllButtonsUI();
      });
      rawProvider.on('chainChanged', (chainId) => {
        if(chainId !== POLYGON_CHAIN_ID_HEX) showStatus('Please switch your wallet back to Polygon.');
        else hideStatusModal();
      });
    }

    hideModal();
    updateAllButtonsUI();
    hideStatusModal();
  }catch(err){
    console.error('WalletConnect v2 error', err);
    showStatus('WalletConnect failed: ' + (err.message || err));
  }
}

async function disconnect(){
  try{
    if(rawProvider && typeof rawProvider.disconnect === 'function'){
      try{ await rawProvider.disconnect(); }catch(e){ /* ignore */ }
    }
  }catch(e){/* ignore */}
  rawProvider = null; provider = null; signer = null;
  connectedAddress = null; connectedBalance = null;
  updateAllButtonsUI();
  hideStatusModal();
}

/* -------------------------
   Event wiring and init
   ------------------------- */
function setupInjectedListeners(raw){
  if(!raw || !raw.on) return;
  raw.on('accountsChanged', (accounts) => {
    if(!accounts || accounts.length === 0){ disconnect(); return; }
    connectedAddress = ethers.utils.getAddress(accounts[0]);
    provider.getBalance(connectedAddress).then(b => {
      connectedBalance = Number(ethers.utils.formatEther(b)).toFixed(4);
      updateAllButtonsUI();
    }).catch(()=>updateAllButtonsUI());
  });
  raw.on('chainChanged', (chainId) => {
    if(chainId !== POLYGON_CHAIN_ID_HEX) showStatus('Please switch your wallet back to Polygon network.');
    else hideStatusModal();
  });
  raw.on('disconnect', () => { disconnect(); });
}

/**
 * Attach connect behavior to buttons with class "connect-wallet"
 * Optional config:
 *   { selector: '.connect-wallet' }
 */
export function initNolaWallet(options = {}) {
  const selector = options.selector || '.connect-wallet';
  createModalIfMissing();
  // Attach handlers for each button
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (connectedAddress) {
        await disconnect();
        return;
      }
      showModal();
    });
  });

  // initial UI refresh
  updateAllButtonsUI();
}

// Auto-init when module is loaded in the browser (works for script type=module)
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.querySelectorAll('.connect-wallet').length > 0) {
      initNolaWallet();
    }
  });
}
async function confirmDisconnect() {
  return new Promise((resolve) => {
    const existing = document.getElementById('nola-disconnect-confirm');
    if (existing) existing.remove();

    const confirmBox = document.createElement('div');
    confirmBox.id = 'nola-disconnect-confirm';
    confirmBox.style = `
      position: fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background: rgba(50,0,80,0.85); color: #fff; padding: 20px;
      border-radius: 16px; text-align:center; z-index:10001;
      box-shadow:0 8px 24px rgba(0,0,0,0.3);
    `;
    confirmBox.innerHTML = `
      <div style="margin-bottom:12px;">Are you sure you want to disconnect?</div>
      <button id="nola-confirm-yes" style="margin:4px;padding:6px 12px;border-radius:8px;background:#ff4d6d;border:none;color:#fff;cursor:pointer;">Yes</button>
      <button id="nola-confirm-no" style="margin:4px;padding:6px 12px;border-radius:8px;background:#555;border:none;color:#fff;cursor:pointer;">No</button>
    `;
    document.body.appendChild(confirmBox);

    document.getElementById('nola-confirm-yes').onclick = () => {
      confirmBox.remove();
      resolve(true);
    };
    document.getElementById('nola-confirm-no').onclick = () => {
      confirmBox.remove();
      resolve(false);
    };
  });
}

// Update disconnect handler
async function disconnect() {
  if (!connectedAddress) return;
  const confirmed = await confirmDisconnect();
  if (!confirmed) return;

  try {
    if (rawProvider && typeof rawProvider.disconnect === 'function') {
      try { await rawProvider.disconnect(); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // Fade-out animation for connected chip
  document.querySelectorAll('.nola-connected-chip').forEach(chip => {
    chip.style.transition = 'opacity 0.25s ease';
    chip.style.opacity = 0;
    setTimeout(() => chip.remove(), 250);
  });

  rawProvider = null; provider = null; signer = null;
  connectedAddress = null; connectedBalance = null;
  updateAllButtonsUI();
  hideStatusModal();
}
