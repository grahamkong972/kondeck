const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: ANTHROPIC_API_KEY not set.' });
    }

    try {
        const { contents, system_instruction, messages } = req.body;

        // Extract system prompt from Gemini-format body
        const systemPrompt = system_instruction?.parts?.[0]?.text || '';

        let claudeMessages;

        if (messages) {
            // Multi-turn mode: messages already in Claude format with cache_control embedded
            claudeMessages = messages;
        } else {
            // Single-turn Gemini-compat mode (used by grading, syllabus check, etc.)
            const geminiParts = contents?.[0]?.parts || [];
            const rawContent = geminiParts.map(part => {
                if (part.text) return { type: 'text', text: part.text };
                if (part.inlineData) {
                    const { data, mimeType } = part.inlineData;
                    if (mimeType === 'application/pdf') {
                        return { type: 'document', source: { type: 'base64', media_type: mimeType, data } };
                    }
                    return { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
                }
                return null;
            }).filter(Boolean);
            // Mark every block except the last (the task) as cacheable
            const claudeContent = rawContent.map((block, i) =>
                i < rawContent.length - 1
                    ? { ...block, cache_control: { type: 'ephemeral' } }
                    : block
            );
            claudeMessages = [{ role: 'user', content: claudeContent }];
        }

        const claudeBody = {
            model: MODEL,
            max_tokens: 8096,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: claudeMessages
        };

        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'prompt-caching-2024-07-31'
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
