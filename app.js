// ES module version using Web3-Onboard + ethers.js
import Onboard from 'https://cdn.jsdelivr.net/npm/@web3-onboard/core@2.12.0/dist/esm/index.js';
import injectedModule from 'https://cdn.jsdelivr.net/npm/@web3-onboard/injected-wallets@1.9.1/dist/esm/index.js';
import walletConnectModule from 'https://cdn.jsdelivr.net/npm/@web3-onboard/walletconnect@2.6.3/dist/esm/index.js';
import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.9.0/dist/ethers.esm.min.js';

// Your WalletConnect project ID
const PROJECT_ID = "6557a92e3698182727669d41cbeb95a1";

// Configure wallets
const injected = injectedModule();
const walletConnect = walletConnectModule({
  projectId: PROJECT_ID,
});

// Polygon chain config
const polygonChain = {
  id: '0x89', // 137
  token: 'MATIC',
  label: 'Polygon Mainnet',
  rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/8ikEzpLeLerL-8xNW23fV'
};

// Initialize Onboard
const onboard = Onboard({
  wallets: [injected, walletConnect],
  chains: [polygonChain],
  appMetadata: {
    name: 'Polygon Wallet Connect DApp',
    description: 'Demo to connect wallet on Polygon',
  }
});

async function connectWallet() {
  const btn = document.getElementById('connectBtn');

  try {
    // Connect wallet (will handle mobile deep link or QR)
    const wallets = await onboard.connectWallet();
    if (!wallets || wallets.length === 0) {
      alert('No wallet connected.');
      return;
    }

    const wallet = wallets[0];

    // Create ethers provider and signer
    const provider = new ethers.BrowserProvider(wallet.provider, 'any');
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    // Confirm network is Polygon
    const network = await provider.getNetwork();
    if (network.chainId !== 137) {
      alert('Please switch your wallet to Polygon Mainnet.');
      return;
    }

    btn.innerText = 'Connected ✅';
    btn.disabled = true;

    alert(`Connected to Polygon: ${address}`);
    console.log('Connected wallet:', address);

    // Optional: you can now use provider/signer to read/write blockchain
  } catch (err) {
    console.error('Wallet connection failed:', err);
    alert('Connection failed: ' + (err.message || err));
  }
}

document.getElementById('connectBtn').addEventListener('click', connectWallet);
