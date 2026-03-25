# MDT AI Reply — Zendesk App

A private Zendesk sidebar app that generates AI-powered reply suggestions for support tickets using the MDT knowledge base.

## Install

1. **Package the app:**
   ```bash
   cd zendesk-app
   zip -r mdt-ai-reply.zip manifest.json assets/ translations/
   ```

2. **Upload to Zendesk:**
   - Go to Zendesk Admin Center > Apps and integrations > Apps > Zendesk Support apps
   - Click **Upload Private App**
   - Upload `mdt-ai-reply.zip`
   - Enter your backend URL (e.g. `https://your-app.up.railway.app`)
   - Enter the API token (must match `ZENDESK_APP_TOKEN` in your backend config)
   - Click Install

3. **Set the backend token:**
   - In your MDT admin panel, go to Settings
   - Add config key `ZENDESK_APP_TOKEN` with a secure random string
   - Use the same string when installing the Zendesk app

## Usage

When viewing a ticket in Zendesk, the sidebar shows a **Suggest AI Reply** button. Click it to:
1. Auto-read the ticket subject, description, and comment history
2. Search the MDT knowledge base for relevant context
3. Generate a suggested reply via Claude
4. Click **Insert into Reply** to populate the reply box, or **Copy** to clipboard
