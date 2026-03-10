import { upsertHubSpotContact } from '@/lib/integrations/hubspot';
import { createClient } from '@supabase/supabase-js';

interface CalendlyBookingPayload {
  email: string;
  name: string | null;
  eventName: string;
  startTime: string | null;
  sessionToken?: string;
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

    let claraChatSummary: string | undefined;
    let claraSessionUrl: string | undefined;

    if (payload.sessionToken) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: chatSession } = await supabase
          .from('chat_sessions')
          .select('id, metadata')
          .eq('session_token', payload.sessionToken)
          .single();

        if (chatSession) {
          const metadata = chatSession.metadata as Record<string, unknown> | null;
          const summaryData = metadata?.summary as Record<string, unknown> | null;
          if (typeof summaryData?.summary === 'string') {
            claraChatSummary = summaryData.summary.slice(0, 500);
          }
          claraSessionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/sessions/${chatSession.id}`;
        }
      } catch (e) {
        console.error('[Calendly] Session lookup failed:', e);
      }
    }

    const note = `Booked: ${eventName}${startTime ? ` — ${new Date(startTime).toLocaleString()}` : ''}`;

    const hubspotPayload = {
      email,
      ...(name ? { firstname: name.split(' ')[0], lastname: name.split(' ').slice(1).join(' ') || undefined } : {}),
      lifecyclestage: 'salesqualifiedlead',
      lead_source: 'Clara',
      clara_chat_summary: claraChatSummary,
      clara_session_url: claraSessionUrl,
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
