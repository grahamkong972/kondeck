const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: ANTHROPIC_API_KEY not set.' });
    }

    try {
        const { contents, system_instruction } = req.body;

        // Extract system prompt from Gemini-format body
        const systemPrompt = system_instruction?.parts?.[0]?.text || '';

        // Extract user message parts from Gemini-format body
        const geminiParts = contents?.[0]?.parts || [];

        // Convert Gemini parts to Claude content blocks
        const claudeContent = geminiParts.map(part => {
            if (part.text) {
                return { type: 'text', text: part.text };
            }
            if (part.inlineData) {
                const { data, mimeType } = part.inlineData;
                if (mimeType === 'application/pdf') {
                    return { type: 'document', source: { type: 'base64', media_type: mimeType, data } };
                }
                // image/*
                return { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
            }
            return null;
        }).filter(Boolean);

        const claudeBody = {
            model: MODEL,
            max_tokens: 8096,
            system: systemPrompt,
            messages: [{ role: 'user', content: claudeContent }]
        };

        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(claudeBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Anthropic API Error:", response.status, errorText);
            return res.status(response.status).json({
                error: `Anthropic API call failed. Status: ${response.status}`,
                details: errorText
            });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text;

        if (!text) {
            return res.status(500).json({ error: 'No content returned from Claude.' });
        }

        // Return in Gemini shape so the frontend needs zero changes
        return res.status(200).json({
            candidates: [{ content: { parts: [{ text }] } }]
        });

    } catch (error) {
        console.error("Proxy Function Error:", error.message);
        return res.status(500).json({
            error: 'Internal Server Error during AI request processing.',
            details: error.message
        });
    }
}
