# Node.js Version Management Guide

## Current Setup
- **Required Version**: Node.js 24.10.0
- **Version Manager**: fnm (Fast Node Manager)
- **Version Files**: `.nvmrc` and `.node-version`

## Setting Node.js 24.10.0 as Default

### Option 1: Set Global Default (Recommended)
```bash
fnm default 24.10.0
```

This sets 24.10.0 as the default for all new shells.

### Option 2: Use Auto-Switching
fnm can automatically switch to the version specified in `.nvmrc` when you `cd` into the directory:

Add this to your `~/.bashrc` or `~/.zshrc`:
```bash
eval "$(fnm env --use-on-cd)"
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

## For Claude Code / VSCode

Claude Code runs in VSCode's integrated terminal, which may not inherit your shell's fnm configuration. Here are solutions:

### Solution 1: Set Default (Already Done)
```bash
fnm default 24.10.0
```

### Solution 2: VSCode Settings
Add to VSCode settings (`.vscode/settings.json`):
```json
{
  "terminal.integrated.env.linux": {
    "PATH": "/home/chester/.local/share/fnm/node-versions/v24.10.0/installation/bin:${env:PATH}"
  }
}
```

### Solution 3: Always Use fnm use
Before running any npm commands in Claude Code, ensure correct version:
```bash
fnm use 24.10.0
```

## Quick Commands

### Check Current Version
```bash
node --version
```

### Switch to Required Version
```bash
fnm use 24.10.0
```

### Rebuild Native Modules
If you switch Node versions and get native module errors:
```bash
npm run rebuild-native
# or
npm rebuild better-sqlite3
```

### Full Reset
```bash
fnm use 24.10.0
npm rebuild better-sqlite3
npm start
```

## npm Scripts Added

The following scripts have been added to `package.json`:

- `npm run check-node` - Verify you're using Node.js 24.x
- `npm run rebuild-native` - Rebuild better-sqlite3
- `npm postinstall` - Automatically runs after `npm install` to rebuild native modules

## For Claude Code Users

When Claude Code runs commands, it should:

1. First run: `fnm use 24.10.0`
2. Then run the actual command

Example:
```bash
fnm use 24.10.0 && npm install
fnm use 24.10.0 && npm rebuild better-sqlite3
fnm use 24.10.0 && npm start
```

## Troubleshooting

### Error: "NODE_MODULE_VERSION mismatch"
This means native modules were compiled for a different Node.js version.

**Fix:**
```bash
fnm use 24.10.0
npm rebuild better-sqlite3
```

### Check What Version is Active
```bash
which node
node --version
fnm current
```

### List All Installed Versions
```bash
fnm list
```

## Why Node.js 24.10.0?

- Required by project dependencies
- Specified in `engines` field of package.json
- `.nvmrc` and `.node-version` files enforce this version
- Better compatibility with modern ES modules and features used in this project
