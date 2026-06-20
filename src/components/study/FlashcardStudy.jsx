import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, RotateCw, Clock } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { generateContent } from '../../services/aiService';
import { getCardStatus } from '../../utils/cardUtils';
import FormattedText from '../FormattedText';

const FlashcardStudy = ({ cards, onBack, onUpdateDeck, deck }) => {
    const toast = useToast();
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [aiHelp, setAiHelp] = useState(null);
    const [loadingHelp, setLoadingHelp] = useState(false);
    const [dueQueue, setDueQueue] = useState([]);
    const [currentCard, setCurrentCard] = useState(null);
    const [sessionComplete, setSessionComplete] = useState(false);
    const isSRS = deck.studyMode === 'srs';

    useEffect(() => {
        if (isSRS) {
            const now = Date.now();
            const queue = cards.map((c, i) => ({ ...c, originalIndex: i })).filter(c => !c.nextReview || c.nextReview <= now);
            setDueQueue(queue);
            if (queue.length > 0) setCurrentCard(queue[0]); else setSessionComplete(true);
        } else {
            if (cards.length > 0) setCurrentCard(cards[0]); else setSessionComplete(true);
        }
    }, [isSRS, cards]);

    const nextStandard = useCallback(() => { setFlipped(false); setAiHelp(null); const nextIdx = (idx + 1) % cards.length; setIdx(nextIdx); setCurrentCard(cards[nextIdx]); }, [idx, cards]);
    const prevStandard = useCallback(() => { setFlipped(false); setAiHelp(null); const prevIdx = (idx - 1 + cards.length) % cards.length; setIdx(prevIdx); setCurrentCard(cards[prevIdx]); }, [idx, cards]);

    const handleRate = useCallback((intervalMinutes) => {
        if (!currentCard) return;
        const now = Date.now();
        const nextReview = now + (intervalMinutes * 60 * 1000);
        const updatedCards = [...cards];
        const cardIndex = currentCard.originalIndex;
        if (cardIndex !== undefined) {
            updatedCards[cardIndex] = { ...cards[cardIndex], nextReview };
            const prevStats = deck.stats || {};
            onUpdateDeck({
                ...deck,
                cards: updatedCards,
                stats: {
                    ...prevStats,
                    lastStudied: now,
                    totalReviews: (prevStats.totalReviews || 0) + 1,
                },
            });
        }
        let newQueue = dueQueue.slice(1);
        if (intervalMinutes < 10) { const insertPos = Math.min(newQueue.length, Math.floor(Math.random() * 3) + 1); newQueue.splice(insertPos, 0, { ...currentCard, nextReview, originalIndex: cardIndex }); }
        setFlipped(false); setAiHelp(null); setDueQueue(newQueue);
        if (newQueue.length > 0) setCurrentCard(newQueue[0]); else setSessionComplete(true);
    }, [currentCard, cards, deck, dueQueue, onUpdateDeck]);

    useEffect(() => {
        const h = (e) => {
            if (e.code === 'Space') { e.preventDefault(); setFlipped(p=>!p); }
            else if (!isSRS && e.code === 'ArrowRight') nextStandard();
            else if (!isSRS && e.code === 'ArrowLeft') prevStandard();
            else if (isSRS && flipped) {
                if (e.key === '1') handleRate(1); if (e.key === '2') handleRate(10); if (e.key === '3') handleRate(1440); if (e.key === '4') handleRate(5760);
            }
        };
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    }, [isSRS, flipped, nextStandard, prevStandard, handleRate]);

    const getHelp = async (type) => {
        if (loadingHelp) return;
        setLoadingHelp(true);
        try {
            const helpPrompt = type === 'simplify'
                ? `A student is struggling to understand the following flashcard.

QUESTION: "${currentCard.q}"
ANSWER: "${currentCard.a}"

Your task: Rewrite the answer in the simplest possible terms for a student who has never seen this concept before.
- Use plain English. Avoid jargon unless you immediately explain it.
- Use an analogy or real-world comparison if it helps.
- Break it into short sentences or bullet points.
- Do NOT just copy the original answer with minor rewording — genuinely simplify it.

Return ONLY valid JSON: {"text": "..."}`
                : `A student wants a memorable mnemonic or memory trick for the following flashcard.

QUESTION: "${currentCard.q}"
ANSWER: "${currentCard.a}"

Your task: Create one of the following (choose whichever works best for this specific content):
- An acronym (e.g. LIFO = "Last In, First Out")
- A rhyme or phrase
- A vivid story or analogy that encodes the key facts
- A visual association

Rules:
- The mnemonic must directly encode the key facts from the answer, not just the question topic.
- Briefly explain how to use it (i.e. what each part of the mnemonic maps to).
- Keep it short and memorable — if it's too complex, it's useless.

Return ONLY valid JSON: {"text": "..."}`;
            const res = await generateContent(helpPrompt, ""); setAiHelp(res.text); }
        catch(e) { toast(e.message || "AI Error"); } finally { setLoadingHelp(false); }
    };

    if (sessionComplete) {
         if (isSRS) {
             const nextDue = cards.map(c => c.nextReview || 0).sort((a,b) => a-b)[0];
             return (<div className="h-full flex flex-col items-center justify-center p-8 text-center"><div className="bg-emerald-100 p-6 rounded-full mb-6 text-emerald-600"><CheckCircle size={48}/></div><h2 className="text-3xl font-bold text-slate-800 mb-2">Review Complete!</h2><div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mt-6 flex items-center gap-3"><Clock className="text-indigo-500"/><span className="text-sm font-medium text-slate-600">Next review: <strong>{nextDue ? new Date(nextDue).toLocaleTimeString() : "Now"}</strong></span></div><button onClick={onBack} className="mt-12 px-6 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition">Back to Dashboard</button></div>);
         } else { return <div className="h-full flex items-center justify-center">No cards available.</div>; }
    }

    if (!currentCard) return <div>Loading...</div>;
    const status = getCardStatus(currentCard);

    return (
        <div className="h-full flex flex-col p-6 max-w-4xl mx-auto w-full">
            <button onClick={onBack} className="self-start mb-4 flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Back</button>
            <div className="flex-1 flex flex-col items-center justify-center relative perspective-1000">
                {!isSRS && (<><button onClick={prevStandard} className="absolute left-0 p-3 bg-white rounded-full shadow hover:scale-110 transition z-10"><ChevronLeft/></button><button onClick={nextStandard} className="absolute right-0 p-3 bg-white rounded-full shadow hover:scale-110 transition z-10"><ChevronRight/></button></>)}
                <div className="w-full max-w-2xl min-h-64 relative cursor-pointer" onClick={() => setFlipped(!flipped)}>
                    <div className="w-full grid relative shadow-2xl rounded-2xl" style={{ transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="row-start-1 col-start-1 w-full min-h-64 relative bg-white rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 border" style={{ backfaceVisibility: 'hidden' }}>
                            <span className={`absolute top-6 right-6 px-3 py-1 rounded-full text-xs font-bold border ${status.color}`}>{status.label}</span>
                            <div className="text-2xl font-medium text-center"><FormattedText text={currentCard.q}/></div>
                            <div className="absolute bottom-6 text-slate-400 text-sm animate-pulse">Click to Flip</div>
                        </div>
                        <div className="row-start-1 col-start-1 w-full min-h-64 relative bg-indigo-600 rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <div className="text-xl font-medium text-center"><FormattedText text={currentCard.a}/></div>
                            <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
                                <button onClick={() => getHelp('simplify')} disabled={loadingHelp} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1">{loadingHelp ? <RotateCw className="animate-spin" size={12}/> : null} Simplify</button>
                                <button onClick={() => getHelp('mnemonic')} disabled={loadingHelp} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1">{loadingHelp ? <RotateCw className="animate-spin" size={12}/> : null} Mnemonic</button>
                            </div>
                        </div>
                    </div>
                </div>
                {isSRS && flipped && (
                    <div className="mt-8 flex gap-3 animate-fade-in-up">
                        <button onClick={() => handleRate(1)} className="flex flex-col items-center px-6 py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl transition border-b-4 border-red-200 hover:border-red-300 active:border-b-0 active:translate-y-1"><span className="font-bold">Again</span><span className="text-[10px] opacity-70">1m (1)</span></button>
                        <button onClick={() => handleRate(10)} className="flex flex-col items-center px-6 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl transition border-b-4 border-orange-200 hover:border-orange-300 active:border-b-0 active:translate-y-1"><span className="font-bold">Hard</span><span className="text-[10px] opacity-70">10m (2)</span></button>
                        <button onClick={() => handleRate(1440)} className="flex flex-col items-center px-6 py-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl transition border-b-4 border-emerald-200 hover:border-emerald-300 active:border-b-0 active:translate-y-1"><span className="font-bold">Good</span><span className="text-[10px] opacity-70">1d (3)</span></button>
                        <button onClick={() => handleRate(5760)} className="flex flex-col items-center px-6 py-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl transition border-b-4 border-blue-200 hover:border-blue-300 active:border-b-0 active:translate-y-1"><span className="font-bold">Easy</span><span className="text-[10px] opacity-70">4d (4)</span></button>
                    </div>
                )}
                {!isSRS && flipped && (<div className="mt-8"><button onClick={nextStandard} className="px-8 py-3 bg-slate-800 text-white rounded-full font-bold shadow-lg hover:bg-slate-700 transition">Next Card</button></div>)}
                {aiHelp && <div className="mt-6 bg-white p-4 rounded-lg shadow border border-indigo-100 max-w-xl w-full text-sm text-slate-700 animate-fade-in"><strong className="text-indigo-600 block mb-1">AI Helper:</strong> <FormattedText text={aiHelp}/></div>}
                <div className="mt-8 text-slate-400 font-medium">{isSRS ? `Queue: ${dueQueue.length} remaining` : `Card ${idx + 1} / ${cards.length}`}</div>
            </div>
        </div>
    );
};

export default FlashcardStudy;
