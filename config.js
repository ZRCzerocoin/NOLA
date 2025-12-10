// config.js
// ================================
// NOLA Metrics configuration file for Cloudflare Pages
// ================================

// Access Cloudflare secrets
const SANBASE = window.__SANBASE__ || "";   // Cloudflare secret: SANBASE
const COINGECKO = window.__COINGECKO__ || ""; // Cloudflare secret: COINGECKO

// Expose globally for your HTML
window.SANBASE = SANBASE;
window.COINGECKO = COINGECKO;
