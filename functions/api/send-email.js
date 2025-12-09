export async function onRequestPost(context) {
    try {
        const { to, subject, body } = await context.request.json();

        // Mock Email Sending
        console.log(`[Mock Email] To: ${to}, Subject: ${subject}`);
        console.log(`[Mock Email] Body: ${body}`);

        // In production, use Resend or similar:
        // const res = await fetch('https://api.resend.com/emails', {
        //   method: 'POST',
        //   headers: {
        //     'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        //     'Content-Type': 'application/json'
        //   },
        //   body: JSON.stringify({
        //     from: 'onboarding@resend.dev',
        //     to: to,
        //     subject: subject,
        //     html: body
        //   })
        // });

        return new Response(JSON.stringify({ success: true, message: "Email sent (mock)" }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
