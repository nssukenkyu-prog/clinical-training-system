import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { reservation_id } = await req.json();

        if (!reservation_id) {
            throw new Error("Reservation ID is required");
        }

        // Fetch reservation details with student and slot info
        const { data: reservation, error: fetchError } = await supabase
            .from("reservations")
            .select(`
        *,
        student:students (
          name,
          email
        ),
        slot:slots (
          date,
          start_time,
          end_time,
          training_type
        )
      `)
            .eq("id", reservation_id)
            .single();

        if (fetchError || !reservation) {
            throw new Error("Reservation not found");
        }

        const { student, slot } = reservation;
        const trainingTypeLabel = { 'I': '臨床実習Ⅰ', 'II': '臨床実習Ⅱ', 'IV': '臨床実習Ⅳ' }[slot.training_type];

        // Send Email
        const { data, error: emailError } = await resend.emails.send({
            from: "Clinical Training <onboarding@resend.dev>", // User should update this domain
            to: [student.email],
            subject: `【予約確定】${trainingTypeLabel} (${slot.date})`,
            html: `
        <div style="font-family: sans-serif; color: #333;">
          <h1>予約が確定しました</h1>
          <p>${student.name} さん</p>
          <p>以下の内容で実習予約を受け付けました。</p>
          
          <div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>実習区分:</strong> ${trainingTypeLabel}</p>
            <p><strong>日付:</strong> ${slot.date}</p>
            <p><strong>時間:</strong> ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}</p>
          </div>

          <p style="color: #ef4444; font-size: 0.9em;">
            <strong>※キャンセルについて</strong><br>
            予約の変更・キャンセルは開始時刻の12時間前まで可能です。<br>
            それ以降の変更は、Teamsでご連絡ください。
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 0.8em; color: #666;">
            日本体育大学スポーツキュアセンター<br>
            臨床実習管理システム
          </p>
        </div>
      `,
        });

        if (emailError) {
            console.error("Email error:", emailError);
            throw emailError;
        }

        return new Response(JSON.stringify({ success: true, data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
