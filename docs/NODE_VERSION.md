# Node.js Version Setup

This project is configured to use **Node.js 24.10.0** to avoid native module compatibility issues.

## Automatic Version Switching with fnm

The project includes two files that tell fnm which Node version to use:

- `.node-version` - Used by fnm and other version managers
- `.nvmrc` - Compatibility with nvm users

### How it works:

When you `cd` into this directory, fnm will automatically switch to Node 24.10.0 **if you have shell integration enabled**.

## Setup Instructions

### 1. Enable fnm Shell Integration (One-time setup)

Add this to your shell configuration file:

**For Bash** (`~/.bashrc`):
```bash
eval "$(fnm env --use-on-cd)"
```

**For Zsh** (`~/.zshrc`):
```zsh
eval "$(fnm env --use-on-cd)"
```

**For Fish** (`~/.config/fish/config.fish`):
```fish
fnm env --use-on-cd | source
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### 2. Install Node 24 (if not already installed)

```bash
fnm install 24
```

### 3. Test Automatic Switching

```bash
# Leave and re-enter the directory
cd ..
cd mismo.dj_app_server

# You should see:
# Using Node v24.10.0

# Verify:
node --version
# v24.10.0
```

## Manual Switching

If you don't want automatic switching, you can manually switch:

```bash
fnm use 24
```

Or use the project's Node version:
```bash
fnm use
```

## Why Node 24?

We upgraded to Node 24 and switched from `xxhash-addon` (native module) to `xxhash-wasm` (WebAssembly) to solve compatibility issues with Address Sanitizer (ASan) builds.

**Benefits:**
- ✅ No native compilation needed
- ✅ Works across all platforms
- ✅ No ASan conflicts
- ✅ Faster startup (no rebuild needed)

## Troubleshooting

### fnm not auto-switching?

Check if shell integration is enabled:
```bash
echo $FNM_DIR
# Should output a path like: /home/user/.local/share/fnm
```

If empty, you need to add the eval line to your shell config (see step 1).

### Wrong Node version after cd?

```bash
# Force reload fnm
fnm use

# Or restart your terminal
```

### Can't find Node 24?

```bash
# List available versions
fnm list-remote | grep v24

# Install latest Node 24
fnm install 24

# Set as default (optional)
fnm default 24
```

## For Contributors

If you're contributing to this project, make sure you're using Node 24:

```bash
node --version
# Should show: v24.10.0

# If not, run:
fnm use
```

Then install dependencies:
```bash
npm install
```

The project will work correctly! 🚀
