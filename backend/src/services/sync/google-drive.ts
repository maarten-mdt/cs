import { google } from "googleapis";
import { getConnectionConfig } from "../connections.js";

async function getDriveClient() {
  const c = await getConnectionConfig("google_drive");
  const creds = c?.serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!creds) throw new Error("Google Drive not configured. Add service account JSON in Connections.");
  const key = typeof creds === "string" ? JSON.parse(creds) : creds;
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

function extractFolderId(input: string): string {
  input = input.trim();
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  throw new Error("Invalid folder ID or URL. Use a folder URL like https://drive.google.com/drive/folders/XXX or the folder ID.");
}

export async function fetchGoogleDriveFolder(
  folderInput: string
): Promise<{ url: string; title: string; content: string }[]> {
  const folderId = extractFolderId(folderInput);
  const drive = await getDriveClient();
  const results: { url: string; title: string; content: string }[] = [];

  async function processFolder(parentId: string, depth: number): Promise<void> {
    if (depth > 15) return;
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 500,
        pageToken: pageToken,
      });
      const files = res.data.files || [];

    for (const f of files) {
      if (!f.id || !f.name) continue;
      const mime = f.mimeType || "";

      if (mime === "application/vnd.google-apps.folder") {
        await processFolder(f.id, depth + 1);
        continue;
      }

      let content = "";
      try {
        if (mime === "application/vnd.google-apps.document") {
          const exportRes = await drive.files.export({
            fileId: f.id,
            mimeType: "text/plain",
          }, { responseType: "text" });
          content = (exportRes.data as string) || "";
        } else if (
          mime === "text/plain" ||
          mime === "text/csv" ||
          mime === "text/markdown" ||
          mime.startsWith("text/")
        ) {
          const downloadRes = await drive.files.get({
            fileId: f.id,
            alt: "media",
          }, { responseType: "text" });
          content = (downloadRes.data as string) || "";
        } else if (mime === "application/pdf") {
          const downloadRes = await drive.files.get({
            fileId: f.id,
            alt: "media",
          }, { responseType: "arraybuffer" });
          const buf = downloadRes.data as ArrayBuffer;
          content = `[PDF: ${f.name}] (${buf.byteLength} bytes - PDF content not extracted, add text version for indexing)`;
        }
      } catch (err) {
        console.warn("Skip file", f.name, err);
        continue;
      }

      if (content.length > 50) {
        results.push({
          url: `https://drive.google.com/file/d/${f.id}/view`,
          title: f.name,
          content: `${f.name}\n\n${content}`.trim(),
        });
      }
    }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  await processFolder(folderId, 0);
  return results;
}
