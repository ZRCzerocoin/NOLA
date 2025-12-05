import { defineConfig } from 'vite'
import { resolve } from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'))

const input = {}
for (const file of htmlFiles) {
  const name = file === 'index.html' ? 'index' : file.replace(/\.html$/, '')
  input[name] = resolve(__dirname, file)
}

export default defineConfig({
  base: '/',              // <-- leave '/' for root hosting; set to '/NOLA/' if deploying to https://<user>.github.io/NOLA/
  build: {
    rollupOptions: {
      input
    }
  }
})
JS

