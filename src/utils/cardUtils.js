export const getCardStatus = (card) => {
    if (!card.nextReview) return { label: 'New', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    const now = Date.now();
    if (card.nextReview <= now) return { label: 'Due', color: 'bg-orange-100 text-orange-700 border-orange-200' };

    const oneDay = 24 * 60 * 60 * 1000;
    if (card.nextReview > now + (3 * oneDay)) return { label: 'Mastered', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };

    return { label: 'Learning', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
};

export const validateAndFixData = (data, type) => {
    if (!Array.isArray(data)) return [];

    return data.map(item => {
        if (!item) return null;

        if (type === 'flashcards') {
            return {
                id: item.id || Math.random().toString(36).substr(2, 9),
                q: String(item.q || "Error: Question missing"),
                a: String(item.a || 'Error: Answer missing'),
                nextReview: item.nextReview || null,
                ease: item.ease || 2.5,
                interval: item.interval || 0,
                step: item.step || 0
            };
        }
        if (type === 'mcq' || type === 'exam') {
            let options = item.options;
            if (!options || !Array.isArray(options)) options = ["True", "False"];
            options = options.map(opt => { const s = String(opt); return s.length > 100 ? s.slice(0, 100) + '…' : s; });

            return {
                type: 'mcq',
                q: String(item.q || "Error: Question missing"),
                options: options,
                a: (typeof item.a === 'number' && item.a < options.length) ? item.a : 0,
                exp: (() => { const v = String(item.exp || 'No explanation provided.'); return v.length > 300 ? v.slice(0, 300) + '…' : v; })()
            };
        }
        if (type === 'saq') {
            return {
                type: 'saq',
                q: String(item.q || "Error: Question missing"),
                model: String(item.model || "No model answer provided."),
                marks: typeof item.marks === 'number' ? item.marks : 5
            };
        }
        return item;
    }).filter(item => item);
};
