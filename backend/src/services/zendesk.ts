import { getConnectionConfig } from "./connections.js";

export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

async function getConfig(): Promise<ZendeskConfig | null> {
  const c = await getConnectionConfig("zendesk");
  if (!c?.subdomain || !c?.email || !c?.apiToken) return null;
  return { subdomain: c.subdomain, email: c.email, apiToken: c.apiToken };
}

export async function createTicket(params: {
  subject: string;
  description: string;
  requesterEmail: string;
  requesterName?: string;
}): Promise<{ id?: number; error?: string }> {
  const config = await getConfig();
  if (!config) {
    return { error: "Zendesk not configured" };
  }

  const auth = Buffer.from(`${config.email}/token:${config.apiToken}`).toString(
    "base64"
  );

  const body = {
    ticket: {
      subject: params.subject,
      comment: { body: params.description },
      requester: {
        email: params.requesterEmail,
        name: params.requesterName || params.requesterEmail,
      },
    },
  };

  const res = await fetch(
    `https://${config.subdomain}.zendesk.com/api/v2/tickets.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    return { error: data.error || "Failed to create ticket" };
  }
  return { id: data.ticket?.id };
}
