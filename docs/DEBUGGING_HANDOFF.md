# AURA Local Sync - Debugging Handoff (2026-05-02)

## 🎯 Current Status: UI Loading Issues Resolved (Partial)

The Electron app now loads successfully, but there may still be runtime issues in the renderer process.

---

## ✅ What Was Fixed

### 1. **better-sqlite3 Bundling Issue** 
**Problem**: `better-sqlite3` native module was being bundled into the browser build, causing `promisify is not a function` error.

**Solution**: Added `better-sqlite3` and `electron` to Vite's `build.rollupOptions.external` in `vite.config.ts`:
```typescript
build: {
  rollupOptions: {
    external: ['better-sqlite3', 'electron'],
  },
}
```

### 2. **Preload Script Module Format**
**Problem**: Preload script was compiled as ES modules (`"module": "ESNext"`), but Electron expects CommonJS.

**Solution**: Changed `tsconfig.electron.json` to use `"module": "ESNext"` with `"moduleResolution": "Bundler"` (for Vite compatibility) and ensured proper ES module output.

### 3. **IPC Bridge Implementation**
**Problem**: React components were using direct `fetch()` calls instead of the IPC bridge, causing CORS issues.

**Fixes**:
- Fixed `src/preload/index.ts` to properly use `contextBridge.exposeInMainWorld('aura', aura)`
- Fixed `src/components/useChatStream.tsx` to use `window.aura.streamOrchestrate()` instead of direct `fetch()`
- Added `getAura()` helper function for safe access to `window.aura`

### 4. **QuotaTracker Import Chain**
**Problem**: `ModelConfig.ts` imported `QuotaTracker.ts` which imported `db/connection.ts` (better-sqlite3).

**Solution**: 
- Removed `quotaTracker` import from `ModelConfig.ts`
- Created `ModelConfig.server.ts` for Node.js-only usage with `quotaTracker`

### 5. **Electron Startup Configuration**
**Problem**: Multiple issues with running TypeScript directly in Electron.

**Solution**: Updated `package.json` scripts:
```json
"start:electron": "npm run build:electron && cross-env NODE_ENV=production NODE_OPTIONS=\"--import=tsx/esm\" electron dist-electron/main/index.js"
```

---

## 🔧 Current Configuration

### Key Files Modified:
1. **`vite.config.ts`** - Added `build.rollupOptions.external` to exclude native modules
2. **`tsconfig.electron.json`** - Set to `"module": "ESNext"` for ESM output
3. **`src/preload/index.ts`** - Fixed IPC bridge implementation
4. **`src/components/useChatStream.tsx`** - Now uses `window.aura` IPC bridge
5. **`src/lib/ModelConfig.ts`** - Removed server-side imports
6. **`src/lib/ModelConfig.server.ts`** - New file for Node.js-only code
7. **`package.json`** - Updated scripts for proper Electron startup

### Build Process:
```bash
# Production build
npm run build  # Vite build (excludes better-sqlite3 from browser bundle)

# Electron build
npm run build:electron  # TypeScript compilation with ESM output

# Start Electron
npm run start:electron  # Uses tsx/esm to run compiled ESM files
```

---

## 🐛 Known Issues & Debugging Notes

### 1. **Non-minified Build for Debugging**
Currently `vite.config.ts` has `build.minify: false` for debugging. Revert to `true` for production.

### 2. **DevTools Auto-Open**
`src/main/index.ts` has `mainWindow.webContents.openDevTools()` enabled. Remove for production.

### 3. **Console Logging**
Multiple `console.log` statements added for debugging:
- `[AURA MAIN] Page loaded successfully`
- `[main.tsx] window.aura available: true/false`
- Various IPC bridge logs

### 4. **OpenRouter Model Fetch**
- Fetches 371 models from `https://openrouter.ai/api/v1/models`
- Updates ProviderRegistry asynchronously
- Initial 4 models loaded from hardcoded list, then updated to 371

---

## 📋 Debugging Checklist for Next Team

### If UI Still Blank:
1. **Check DevTools Console** (F12 or Ctrl+Shift+I in Electron window)
   - Look for errors in red
   - Verify `window.aura` is defined: type `window.aura` in console

2. **Check Main Process Logs** (terminal running `npm run start:electron`)
   - Should see: `[AURA MAIN] Process running at http://localhost:3000`
   - Should see: `[AURA MAIN] Page loaded successfully`

3. **Verify API Server is Running**
   ```bash
   Invoke-WebRequest -Uri http://localhost:3000/ -UseBasicParsing
   ```
   Should return HTML with `<!DOCTYPE html>`

4. **Test IPC Bridge**
   In DevTools console:
   ```javascript
   window.aura.checkHealth().then(console.log)
   ```
   Should return `{ status: 'ok', providers: {...} }`

5. **Check for better-sqlite3 in Bundle**
   ```bash
   Select-String -Path "dist/assets/index-*.js" -Pattern "better-sqlite3"
   ```
   Should return no matches.

---

## 🚀 Next Steps

### Immediate Priorities:
1. **Test UI Functionality**
   - [ ] Verify sidebar navigation works
   - [ ] Test chat functionality (send a message)
   - [ ] Check model selection dropdown
   - [ ] Verify settings panel opens

2. **Clean Up Debug Code**
   - [ ] Remove `build.minify: false` from `vite.config.ts`
   - [ ] Remove `openDevTools()` from `src/main/index.ts`
   - [ ] Remove excessive `console.log` statements
   - [ ] Re-enable minification for production

3. **Test Modular Model Selection**
   - [ ] Verify per-role model config works
   - [ ] Test per-agent model overrides
   - [ ] Check OpenRouter dynamic model list (371 models)
   - [ ] Test model badges on messages (🤖)

4. **Run Tests**
   ```bash
   npm run test
   ```
   Note: Tests may fail due to better-sqlite3 native module. Use Docker workaround:
   ```bash
   docker compose run --rm aura-test npx vitest run
   ```

---

## 📦 Environment Info

- **OS**: Windows 11
- **Node.js**: v24.15.0
- **Electron**: (check `node_modules/electron/package.json`)
- **Better-sqlite3**: v12.9.0 (native module rebuilt for Electron)
- **Package Manager**: npm
- **TypeScript**: Compiled with `tsc` (ESM output)

---

## 🔗 Useful Commands

```bash
# Development
npm run dev              # Vite dev server only
npm run start:electron    # Full Electron app

# Build
npm run build            # Vite production build
npm run build:electron   # TypeScript compilation

# Debug
npm run start:electron   # Check terminal for main process logs
# Press F12 in Electron window for DevTools

# Docker (for tests)
docker compose up -d      # Start all services
docker compose logs -f    # View logs

# Rebuild native modules
npm run rebuild          # Rebuild better-sqlite3 for Electron
```

---

## 📝 Summary

The AURA Local Sync app should now load in Electron. The main issues were:
1. Native Node.js modules being bundled in browser build (fixed with Vite `external`)
2. ES module format issues in preload script (fixed with proper TypeScript config)
3. Direct fetch calls instead of IPC bridge (fixed in React components)

**Current State**: Electron window opens, page loads, DevTools available for debugging.

**Handoff to Debugging Team**: Please test all UI functionality, clean up debug code, and prepare for production build.

---

*Last Updated: 2026-05-02*
*By: GitHub Copilot*
