import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, mobile, date, time, consumed, total, remaining } = body;

    if (!mobile || !name) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const webhookUrl = process.env.WHATSAPP_API_URL;
    
    if (!webhookUrl) {
      console.warn('WHATSAPP_API_URL is not set in environment variables');
      return NextResponse.json({ success: false, error: 'Webhook URL not configured' }, { status: 500 });
    }

    // Strip non-numeric characters from mobile just in case
    let cleanMobile = mobile.replace(/\D/g, '');

    // Ensure mobile has country code (assuming India +91 for this specific implementation)
    // If it's exactly 10 digits, prepend 91.
    let formattedMobile = cleanMobile;
    if (cleanMobile.length === 10) {
      formattedMobile = `91${cleanMobile}`;
    }

    // Send the raw data directly to the WASimple Flow Webhook!
    // The WASimple Flow will catch this JSON and map it to the template parameters.
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: formattedMobile,
        name: name,
        date: date,
        time: time,
        consumed: consumed,
        total: total,
        remaining: remaining
      })
    };

    const response = await fetch(webhookUrl, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('WhatsApp Webhook Error:', errorText);
      return NextResponse.json({ success: false, error: 'Failed to trigger webhook', details: errorText }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Webhook triggered successfully' });

  } catch (error: any) {
    console.error('WhatsApp Route Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
