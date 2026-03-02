/**
 * Vercel Serverless Function: /api/generate-ai-content
 *
 * Proxies requests to the Google Gemini API.
 * The GEMINI_API_KEY is stored as a server-side environment variable
 * and is NEVER exposed to the client/browser.
 *
 * Setup:
 *   - Local: add GEMINI_API_KEY=your_key to .env
 *   - Vercel: add GEMINI_API_KEY in Project Settings → Environment Variables
 */

const MODEL = "gemini-2.5-flash-latest";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return res
      .status(500)
      .json({ error: "Server configuration error: API key missing." });
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  try {
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      // Forward the Gemini error status and message
      const errorMessage =
        data?.error?.message || `Gemini API error: ${geminiResponse.statusText}`;
      console.error("Gemini API Error:", errorMessage);
      return res.status(geminiResponse.status).json({ error: errorMessage });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Proxy fetch error:", error);
    return res.status(500).json({ error: `Proxy error: ${error.message}` });
  }
}
