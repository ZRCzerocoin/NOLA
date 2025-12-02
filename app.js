import Onboard from 'https://cdn.jsdelivr.net/npm/@web3-onboard/core@2.12.0/dist/esm/index.js';
import injectedModule from 'https://cdn.jsdelivr.net/npm/@web3-onboard/injected-wallets@1.9.1/dist/esm/index.js';
import walletConnectModule from 'https://cdn.jsdelivr.net/npm/@web3-onboard/walletconnect@2.6.3/dist/esm/index.js';
import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.9.0/dist/ethers.esm.min.js';

// Wallet modules
const injected = injectedModule();
const walletConnect = walletConnectModule({
  projectId: '6557a92e3698182727669d41cbeb95a1',
});

// Polygon chain config (public RPC)
const polygonChain = {
  id: '0x89', // Polygon Mainnet
  token: 'MATIC',
  label: 'Polygon Mainnet',
  rpcUrl: 'https://polygon-rpc.com'
};

// Initialize Onboard
const onboard = Onboard({
  wallets: [injected, walletConnect],
  chains: [polygonChain],
  appMetadata: {
    name: 'Polygon Wallet Connect Demo',
    description: 'Connect wallet on Polygon network',
  }
});

async function connectWallet() {
  const btn = document.getElementById('connectBtn');
  try {
    // Connect wallet
    const wallets = await onboard.connectWallet();
    if (!wallets || wallets.length === 0) {
      alert('No wallet connected.');
      return;
    }

    const wallet = wallets[0];

    // Make sure wallet is on Polygon
    const currentChain = await onboard.getState().chains.find(c => c.id === polygonChain.id);
    if (!currentChain) {
      alert('Switch to Polygon Mainnet in your wallet.');
      return;
    }

    // Ethers provider & signer
    const provider = new ethers.BrowserProvider(wallet.provider, 'any');
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    // Success feedback
    alert(`Connected to Polygon: ${address}`);
    btn.innerText = 'Connected ✅';
    btn.disabled = true;
    console.log('Connected wallet:', address);

  } catch (err) {
    console.error('Connection failed:', err);
    alert('Connection failed: ' + (err.message || err));
  }
}

document.getElementById('connectBtn').addEventListener('click', connectWallet);
