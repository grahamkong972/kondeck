import { URL } from 'url';

// 🚨 CRITICAL: The Vercel function automatically accesses the environment variables 
// set in your project dashboard. The variable must be named GEMINI_API_KEY on Vercel.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Vercel's Serverless Functions use the Node.js HTTP request/response pattern
export default async function handler(req, res) {
    // 1. Security Check: Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Key Check: Ensure the secret key is available (it should be set on Vercel)
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY not set.' });
    }

    // 3. Rate Limiting (Optional but Recommended): 
    // Implement simple rate limiting here based on IP (req.headers['x-forwarded-for']) 
    // or user ID if you can pass it from the client securely.

    // 4. Forward Request to Gemini API
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    
    // We append the secret key here on the server
    const targetUrl = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;

    try {
        // Parse the incoming body from the client
        const clientBody = req.body;
        
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // The request body contains all the contents, system_instruction, etc.
            body: JSON.stringify(clientBody)
        });

        // 5. Handle Errors from Gemini API
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error:", response.status, errorText);
            return res.status(response.status).json({ 
                error: `Gemini API call failed. Status: ${response.status}`,
                details: errorText
            });
        }

        // 6. Forward Successful Response to Client
        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Proxy Function Error:", error.message);
        return res.status(500).json({ 
            error: 'Internal Server Error during AI request processing.',
            details: error.message 
        });
    }
}