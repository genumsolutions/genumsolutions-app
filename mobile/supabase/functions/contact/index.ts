import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl =
  Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "";
const supabaseAnonKey =
  Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const contactEmail =
  Deno.env.get("CONTACT_EMAIL") || "genumsolutions@gmail.com";
const sender =
  Deno.env.get("RESEND_FROM_EMAIL") || "GENUM website <onboarding@resend.dev>";

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ContactForm {
  name: string;
  email: string;
  message: string;
}

serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // Persist the message to customer_messages table
    const { error: dbError } = await supabase.from("customer_messages").insert({
      name,
      email,
      message,
      status: "new",
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      // Continue anyway - still try to send email
    }

    // Send email via Resend
    if (resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: [contactEmail],
          reply_to: email,
          subject: `New website inquiry from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, persisted: !dbError }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Contact Edge Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
