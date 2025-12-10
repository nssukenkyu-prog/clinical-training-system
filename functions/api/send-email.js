export async function onRequestPost(context) {
    try {
        const { to, subject, body } = await context.request.json();

        // Check if Resend API key is configured
        const RESEND_API_KEY = context.env.RESEND_API_KEY;

        if (!RESEND_API_KEY) {
            // Fallback to mock mode if no API key
            console.log(`[Mock Email] To: ${to}, Subject: ${subject}`);
            console.log(`[Mock Email] Body: ${body}`);
            return new Response(JSON.stringify({
                success: true,
                message: "Email sent (mock mode - RESEND_API_KEY not configured)"
            }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        // Production: Send email via Resend API
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Clinical Training <noreply@resend.dev>',
                to: to,
                subject: subject,
                html: body
            })
        });

        const result = await res.json();

        if (!res.ok) {
            console.error('[Resend Error]', result);
            return new Response(JSON.stringify({
                success: false,
                error: result.message || 'Failed to send email'
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Email sent successfully",
            id: result.id
        }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error('[Email Error]', err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
