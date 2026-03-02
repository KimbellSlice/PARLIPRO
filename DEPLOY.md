# ParliPro — Deployment Guide

Everything you need to get ParliPro live on the internet with your own custom domain.

---

## What You'll Set Up

- **GitHub** — stores your code (free)
- **Vercel** — hosts the website, auto-deploys when you update code (free)
- **Custom domain** — your own URL like parlipro.app (~$10/year)

Total time: ~30 minutes. Total cost: ~$10/year for the domain.

---

## Step 1: Install Tools

You need two things installed on your computer.

### Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version (the big green button)
3. Run the installer, accept all defaults
4. Verify it worked — open your terminal and type:

```
node --version
```

You should see something like `v20.11.0`. The exact number doesn't matter.

**How to open a terminal:**
- **Mac:** Press `Cmd + Space`, type "Terminal", hit Enter
- **Windows:** Press `Win + R`, type "cmd", hit Enter (or search "Command Prompt")

### Git

1. Go to https://git-scm.com/downloads
2. Download and install for your operating system
3. Accept all defaults during installation
4. Verify:

```
git --version
```

---

## Step 2: Create a GitHub Account & Repository

1. Go to https://github.com and create a free account (if you don't have one)
2. Click the **+** in the top right → **New repository**
3. Name it `parlipro`
4. Keep it **Public**
5. Do NOT check "Add a README" or any other boxes
6. Click **Create repository**
7. Keep this page open — you'll need the URL it shows you

---

## Step 3: Download & Push the Code

Open your terminal and run these commands one at a time.

### Navigate to where you want the project

```
cd ~/Desktop
```

(This puts the project folder on your Desktop. You can choose anywhere.)

### Unzip the project

Move the `parlipro.zip` file I gave you to your Desktop, then:

```
unzip parlipro.zip -d parlipro
cd parlipro
```

### Install dependencies

```
npm install
```

This will take a minute. You'll see a progress bar.

### Test locally (optional but recommended)

```
npm run dev
```

Open http://localhost:5173 in your browser. You should see ParliPro!
Press `Ctrl + C` to stop the local server when you're done testing.

### Push to GitHub

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username:

```
git init
git add .
git commit -m "Initial ParliPro release"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/parlipro.git
git push -u origin main
```

If prompted to log in, enter your GitHub credentials. (GitHub may ask you
to use a Personal Access Token instead of a password — follow the prompts.)

Refresh your GitHub repository page. You should see all the files there.

---

## Step 4: Deploy on Vercel

1. Go to https://vercel.com
2. Click **Sign Up** → **Continue with GitHub**
3. Authorize Vercel to access your GitHub
4. Click **Add New...** → **Project**
5. Find `parlipro` in your repository list and click **Import**
6. Vercel auto-detects it's a Vite project — **don't change any settings**
7. Click **Deploy**
8. Wait ~60 seconds. You'll see a "Congratulations!" screen
9. Click the preview link — ParliPro is now live at `parlipro.vercel.app`!

---

## Step 5: Custom Domain

### Buy a domain

Good registrars (pick one):
- **Namecheap** (https://namecheap.com) — cheapest, good UI
- **Cloudflare** (https://dash.cloudflare.com) — at-cost pricing, slightly more technical
- **Google Domains** (https://domains.google) — simple, familiar

Search for your desired name (e.g., `parlipro.app`, `parlipro.org`, `parlipro.com`).
`.app` domains run ~$12/year. `.com` is ~$10/year.

### Connect it to Vercel

1. In Vercel, go to your `parlipro` project → **Settings** → **Domains**
2. Type your domain (e.g., `parlipro.app`) and click **Add**
3. Vercel will show you DNS records to add. It'll look something like:

```
Type: A
Name: @
Value: 76.76.21.21
```

and

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

4. Go to your domain registrar's DNS settings and add those records
5. Wait 5–30 minutes for DNS to propagate
6. Vercel will automatically give you a free HTTPS certificate

You're live! 🎉

---

## Updating ParliPro Later

Whenever you want to make changes:

1. Edit the files in your `parlipro` folder
2. Open terminal in that folder
3. Run:

```
git add .
git commit -m "Description of what you changed"
git push
```

Vercel automatically rebuilds and deploys within ~60 seconds.

---

## Troubleshooting

**"npm: command not found"**
→ Node.js didn't install correctly. Re-download from nodejs.org and restart your terminal.

**"git: command not found"**
→ Git didn't install correctly. Re-download from git-scm.com and restart your terminal.

**"Permission denied" when pushing to GitHub**
→ GitHub now requires a Personal Access Token instead of a password.
   Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Generate New Token.
   Use the token as your password when Git asks.

**Vercel build fails**
→ Make sure `npm run build` works locally first. If it does, the issue is
   usually a dependency — check the Vercel build logs for the error message.

**Domain not working after adding DNS records**
→ DNS can take up to 48 hours (usually 5–30 minutes). Check https://dnschecker.org
   to see if your records have propagated.
