import { upsertHubSpotContact } from '@/lib/integrations/hubspot';

interface CalendlyBookingPayload {
  email: string;
  name: string | null;
  eventName: string;
  startTime: string | null;
}

export async function handleCalendlyBooking(payload: CalendlyBookingPayload): Promise<void> {
  const { email, name, eventName, startTime } = payload;

  try {
    console.log('[Calendly] Booking confirmed for:', email);

    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      console.error('[Calendly] HUBSPOT_API_KEY not set — cannot upgrade contact');
      return;
    }

    const note = `Booked: ${eventName}${startTime ? ` — ${new Date(startTime).toLocaleString()}` : ''}`;

    const hubspotPayload = {
      email,
      ...(name ? { firstname: name.split(' ')[0], lastname: name.split(' ').slice(1).join(' ') || undefined } : {}),
      lifecyclestage: 'salesqualifiedlead',
      lead_source: 'Website',
    };

    const result = await upsertHubSpotContact(hubspotPayload, apiKey);

    if (result.success && result.contactId) {
      console.log('[Calendly] HubSpot contact upgraded to SQL. contactId:', result.contactId);
      await addHubSpotNote(result.contactId, note, apiKey);
    } else {
      console.error('[Calendly] HubSpot upsert failed:', result.error);
    }
  } catch (error) {
    // Never throw — integrations fail silently per CONVENTIONS.md
    console.error('[Calendly] Failed to handle booking:', error);
  }
}

async function addHubSpotNote(contactId: string, note: string, apiKey: string): Promise<void> {
  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: note,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Calendly] Failed to add HubSpot note:', response.status, err);
    } else {
      console.log('[Calendly] Booking note added to HubSpot contact:', contactId);
    }
  } catch (error) {
    console.error('[Calendly] addHubSpotNote error:', error);
  }
}
