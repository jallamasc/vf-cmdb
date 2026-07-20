# GitHub Setup Instructions

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `vf-cmdb`
3. Description: `Virtualfactor IT CMDB - Self-hosted configuration management database`
4. Choose **Public** or **Private** (your preference)
5. **Do NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Push Code to GitHub

After creating the repository, run these commands in your terminal:

```bash
cd /home/ubuntu/vf_cmdb

# Add GitHub as remote
git remote add origin https://github.com/jallamasc/vf-cmdb.git

# Push code
git push -u origin master
```

## Step 3: Verify

Visit https://github.com/jallamasc/vf-cmdb to see your code!

## Alternative: Use SSH (Recommended)

If you have SSH keys set up with GitHub:

```bash
cd /home/ubuntu/vf_cmdb
git remote add origin git@github.com:jallamasc/vf-cmdb.git
git push -u origin master
```

## Cloning on Your Local Workstation

Once pushed, you can clone it anywhere:

```bash
# HTTPS
git clone https://github.com/jallamasc/vf-cmdb.git

# SSH
git clone git@github.com:jallamasc/vf-cmdb.git
```

Then open the folder in VS Code and start working!
