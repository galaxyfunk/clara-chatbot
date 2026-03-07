import type { HubSpotContactPayload } from '@/types/integrations';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * Creates or updates a HubSpot contact by email (upsert).
 * Safe to call multiple times — same email = update, not duplicate.
 */
export async function upsertHubSpotContact(
  payload: HubSpotContactPayload,
  apiKey: string
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  console.log('[HubSpot Debug] upsertHubSpotContact called with:', JSON.stringify({ email: payload.email, lead_source: payload.lead_source, lifecyclestage: payload.lifecyclestage, has_summary: !!payload.clara_chat_summary, has_session_url: !!payload.clara_session_url }));

  try {
    const properties: Record<string, string> = {
      email: payload.email,
      lead_source: payload.lead_source ?? 'Website',
      lifecyclestage: payload.lifecyclestage ?? 'marketingqualifiedlead',
    };

    if (payload.firstname) properties.firstname = payload.firstname;
    if (payload.lastname) properties.lastname = payload.lastname;
    if (payload.company) properties.company = payload.company;
    if (payload.clara_chat_summary) {
      properties.clara_chat_summary = payload.clara_chat_summary.slice(0, 500);
    }
    if (payload.clara_session_url) {
      properties.clara_session_url = payload.clara_session_url;
    }

    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/batch/upsert`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: [{
            idProperty: 'email',
            id: payload.email,
            properties,
          }],
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[HubSpot] Contact upsert failed:', response.status, errorBody);
      return { success: false, error: `HubSpot API error: ${response.status}` };
    }

    const data = await response.json();
    const contactId = data?.results?.[0]?.id;
    console.log('[HubSpot Debug] API response status:', response.status, '| contactId:', contactId, '| full response:', JSON.stringify(data));
    return { success: true, contactId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HubSpot] upsertHubSpotContact error:', message);
    return { success: false, error: message };
  }
}
