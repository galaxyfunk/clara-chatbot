import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { handleCalendlyBooking } from '@/lib/integrations/calendly';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Only process booking confirmations
    if (body.event !== 'invitee.created') {
      return NextResponse.json({ received: true });
    }

    const email = body.payload?.invitee?.email as string | undefined;
    const name = body.payload?.invitee?.name as string | undefined;
    const eventName = (body.payload?.scheduled_event?.name as string | undefined) ?? 'Discovery Call';
    const startTime = body.payload?.scheduled_event?.start_time as string | undefined;

    if (!email) {
      return NextResponse.json({ error: 'No email in payload' }, { status: 400 });
    }

    after(async () => {
      await handleCalendlyBooking({
        email,
        name: name ?? null,
        eventName,
        startTime: startTime ?? null,
      });
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
