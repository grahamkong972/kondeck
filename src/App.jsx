import React, { useState, useEffect, useCallback } from 'react';
import { 
    BookOpen, Brain, ChevronLeft, ChevronRight, Settings, 
    Plus, Trash2, GraduationCap, FileText, Sparkles, 
    RotateCw, CheckCircle, XCircle, Folder, ChevronDown 
} from 'lucide-react';

// --- GEMINI AI SERVICE ---
const generateContent = async (apiKey, prompt, context) => {
    if (!apiKey) throw new Error("API Key is missing. Please add it in Settings.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const fullPrompt = `
        You are a strictly JSON-generating API for a study app.
        CONTEXT: ${context}
        
        TASK: ${prompt}
        
        REQUIREMENTS:
        1. Return ONLY valid JSON. No markdown formatting, no code blocks, no intro text.
        2. If creating flashcards, use format: [{"q": "Question", "a": "Answer"}]
        3. If creating MCQs, use format: [{"q": "Question", "options": ["A", "B", "C", "D"], "a": 0, "exp": "Explanation"}] (where 'a' is the index of correct option).
    `;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }]
        })
    });

    if (!response.ok) throw new Error(`AI Error: ${response.statusText}`);
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Cleanup JSON if the AI adds markdown blocks
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
};

// --- COMPONENTS ---

// 1. Sidebar Navigation
const Sidebar = ({ folders, decks, activeDeckId, onSelectDeck, onAddFolder, onDeleteFolder, onAddDeck, onDeleteDeck, onSettings }) => {
    const [expandedFolders, setExpandedFolders] = useState({});

    // Toggle folder expansion
    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderId]: !prev[folderId]
        }));
    };

    // Auto-expand folders that contain the active deck or if they are new
    useEffect(() => {
        if (activeDeckId) {
            const activeDeck = decks.find(d => d.id === activeDeckId);
            if (activeDeck) {
                setExpandedFolders(prev => ({ ...prev, [activeDeck.folderId]: true }));
            }
        }
    }, [activeDeckId, decks]);

    return (
        <div className="w-full md:w-64 bg-slate-900 text-white flex flex-col h-screen fixed md:relative z-20 shadow-xl border-r border-slate-800">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
                <h1 className="font-bold text-xl flex items-center gap-2">
                    <GraduationCap className="text-indigo-400" /> StudyGenie
                </h1>
                <button onClick={onSettings} className="hover:text-indigo-400 transition"><Settings size={18}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                {folders.map(folder => (
                    <div key={folder.id}>
                        {/* Folder Header */}
                        <div className="flex items-center justify-between group mb-2 select-none">
                            <div 
                                className="flex items-center gap-2 cursor-pointer hover:text-indigo-300 transition-colors flex-1" 
                                onClick={() => toggleFolder(folder.id)}
                            >
                                {expandedFolders[folder.id] ? <ChevronDown size={16} className="text-slate-500"/> : <ChevronRight size={16} className="text-slate-500"/>}
                                <Folder size={16} className="text-indigo-400 fill-indigo-400/20"/>
                                <span className="font-semibold text-sm truncate">{folder.name}</span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }} 
                                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition p-1"
                                title="Delete Folder"
                            >
                                <Trash2 size={14}/>
                            </button>
                        </div>

                        {/* Modules List */}
                        {expandedFolders[folder.id] && (
                            <div className="pl-6 space-y-1 border-l-2 border-slate-800 ml-2.5 transition-all">
                                {decks.filter(d => d.folderId === folder.id).map(deck => (
                                    <div key={deck.id} 
                                         onClick={() => onSelectDeck(deck.id)}
                                         className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all ${activeDeckId === deck.id ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                        <div className="truncate text-xs font-medium">{deck.title}</div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDeleteDeck(deck.id); }} 
                                            className={`opacity-0 group-hover:opacity-100 hover:text-red-400 transition ${activeDeckId === deck.id ? 'opacity-100' : ''}`}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                                
                                <button 
                                    onClick={() => onAddDeck(folder.id)} 
                                    className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800/50 rounded-md transition flex items-center gap-2 mt-1"
                                >
                                    <Plus size={12} /> New Module
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-slate-800 shrink-0">
                <button onClick={onAddFolder} className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition font-medium border border-slate-700">
                    <Plus size={16} /> New Folder
                </button>
            </div>
        </div>
    );
};

// 2. Input & Dashboard
const Dashboard = ({ deck, onUpdateDeck, apiKey }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [inputText, setInputText] = useState(deck.content || "");
    const [genType, setGenType] = useState("flashcards"); // or 'mcq'
    const [count, setCount] = useState(5);

    const handleGenerate = async () => {
        if (!inputText.trim()) return alert("Please enter some notes first!");
        if (!apiKey) return alert("Please enter your API Key in Settings.");

        setIsGenerating(true);
        try {
            let prompt = "";
            if (genType === "flashcards") {
                prompt = `Generate ${count} difficult flashcards from the context. Focus on key concepts, definitions, and relationships.`;
            } else {
                prompt = `Generate ${count} multiple choice questions with 4 options each from the context. Ensure the questions test understanding, not just recall.`;
            }

            const result = await generateContent(apiKey, prompt, inputText);
            
            const updatedDeck = { ...deck, content: inputText };
            if (genType === "flashcards") {
                updatedDeck.cards = [...(deck.cards || []), ...result];
            } else {
                updatedDeck.quiz = [...(deck.quiz || []), ...result];
            }
            
            onUpdateDeck(updatedDeck);
        } catch (error) {
            alert(error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-8">
                <input 
                    value={deck.title} 
                    onChange={(e) => onUpdateDeck({...deck, title: e.target.value})}
                    className="text-3xl font-bold bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none w-full pb-2 text-slate-800"
                    placeholder="Module Title (e.g. BABS2204)"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Area */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[600px] flex flex-col">
                    <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-indigo-500"/> Lecture Notes / Context
                    </h3>
                    <textarea 
                        className="flex-1 w-full bg-slate-50 p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm leading-relaxed"
                        placeholder="Paste your lecture notes, slides text, or summary here..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                    ></textarea>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-3">
                        <div className="flex gap-2 items-center justify-between text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                                <span>Generate:</span>
                                <select value={genType} onChange={(e) => setGenType(e.target.value)} className="bg-slate-100 rounded px-2 py-1 border border-slate-200">
                                    <option value="flashcards">Flashcards</option>
                                    <option value="mcq">Quiz (MCQ)</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>Count:</span>
                                <input type="number" min="1" max="20" value={count} onChange={(e) => setCount(e.target.value)} className="w-16 bg-slate-100 rounded px-2 py-1 border border-slate-200"/>
                            </div>
                        </div>
                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? <RotateCw className="animate-spin" size={18}/> : <Sparkles size={18}/>}
                            {isGenerating ? "Consulting AI..." : "Generate Content"}
                        </button>
                    </div>
                </div>

                {/* Stats / Quick Actions */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4">Module Stats</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                <div className="text-3xl font-bold text-indigo-600">{deck.cards?.length || 0}</div>
                                <div className="text-sm text-indigo-400 font-medium">Flashcards</div>
                            </div>
                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                                <div className="text-3xl font-bold text-emerald-600">{deck.quiz?.length || 0}</div>
                                <div className="text-sm text-emerald-400 font-medium">Quiz Questions</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <button onClick={() => onUpdateDeck({...deck, mode: 'flashcards'})} disabled={!deck.cards?.length} className="w-full bg-white border border-slate-200 hover:border-indigo-500 hover:shadow-md p-4 rounded-xl text-left transition disabled:opacity-50">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-slate-800">Study Flashcards</span>
                                <BookOpen size={20} className="text-indigo-500"/>
                            </div>
                            <p className="text-sm text-slate-500">Review terms and concepts with active recall.</p>
                        </button>
                        
                        <button onClick={() => onUpdateDeck({...deck, mode: 'quiz'})} disabled={!deck.quiz?.length} className="w-full bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-md p-4 rounded-xl text-left transition disabled:opacity-50">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-slate-800">Practice Quiz</span>
                                <Brain size={20} className="text-emerald-500"/>
                            </div>
                            <p className="text-sm text-slate-500">Test your knowledge with AI-generated MCQs.</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 3. Flashcard Mode
const FlashcardStudy = ({ cards, onBack, apiKey }) => {
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [aiHelp, setAiHelp] = useState(null);
    const [loadingHelp, setLoadingHelp] = useState(false);

    const card = cards[idx];

    // Navigation functions using functional state updates to be stable dependencies
    const next = useCallback(() => { 
        setFlipped(false); 
        setAiHelp(null); 
        setIdx((prev) => (prev + 1) % cards.length); 
    }, [cards.length]);

    const prev = useCallback(() => { 
        setFlipped(false); 
        setAiHelp(null); 
        setIdx((prev) => (prev - 1 + cards.length) % cards.length); 
    }, [cards.length]);

    const getHelp = async (type) => {
        if (!apiKey) return alert("Need API Key");
        setLoadingHelp(true);
        try {
            const prompt = type === 'simplify'
                ? `Explain simply. Return JSON: {"text": "explanation..."}. Context: Q: ${card.q}, A: ${card.a}`
                : `Create mnemonic. Return JSON: {"text": "mnemonic..."}. Context: Q: ${card.q}, A: ${card.a}`;
            
            const result = await generateContent(apiKey, prompt, "");
            setAiHelp(result.text);
        } catch (e) {
            alert("AI Error");
        } finally {
            setLoadingHelp(false);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent page scrolling
                setFlipped(prev => !prev);
            } else if (e.code === 'ArrowRight') {
                next();
            } else if (e.code === 'ArrowLeft') {
                prev();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [next, prev]);

    return (
        <div className="h-full flex flex-col p-6 max-w-4xl mx-auto w-full">
            <button onClick={onBack} className="self-start mb-4 flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition font-medium">
                <ChevronLeft size={20} /> Back to Dashboard
            </button>

            <div className="flex-1 flex flex-col items-center justify-center relative perspective-1000">
                 {/* Controls */}
                <div className="absolute top-1/2 -left-4 md:-left-16 transform -translate-y-1/2 z-10">
                    <button onClick={prev} className="p-3 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-600 hover:scale-110 transition" title="Previous (Left Arrow)"><ChevronLeft/></button>
                </div>
                <div className="absolute top-1/2 -right-4 md:-right-16 transform -translate-y-1/2 z-10">
                    <button onClick={next} className="p-3 bg-white rounded-full shadow-lg hover:bg-slate-50 text-slate-600 hover:scale-110 transition" title="Next (Right Arrow)"><ChevronRight/></button>
                </div>

                {/* Card */}
                <div className="w-full max-w-2xl h-96 relative cursor-pointer group" onClick={() => setFlipped(!flipped)}>
                    <div 
                        className="w-full h-full relative shadow-2xl rounded-2xl" 
                        style={{ 
                            transformStyle: 'preserve-3d', 
                            transition: 'transform 0.6s',
                            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                        }}
                    >
                        {/* Front */}
                        <div className="absolute w-full h-full bg-white rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 border border-slate-200" style={{ backfaceVisibility: 'hidden' }}>
                            <span className="absolute top-6 left-6 text-xs font-bold tracking-wider text-slate-400 uppercase">Question</span>
                            <div className="text-2xl font-medium text-slate-800 text-center">{card.q}</div>
                            <div className="absolute bottom-6 text-slate-400 text-sm animate-pulse">Click or Space to Flip</div>
                        </div>
                        {/* Back */}
                        <div className="absolute w-full h-full bg-indigo-600 rounded-2xl backface-hidden rotate-y-180 flex flex-col items-center justify-center p-8 text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <span className="absolute top-6 left-6 text-xs font-bold tracking-wider text-indigo-200 uppercase">Answer</span>
                            <div className="text-xl font-medium text-center leading-relaxed overflow-y-auto max-h-full custom-scroll">{card.a}</div>
                            
                            {/* AI Actions on Back */}
                            <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
                                <button onClick={() => getHelp('simplify')} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold backdrop-blur-sm border border-white/10">Simplify</button>
                                <button onClick={() => getHelp('mnemonic')} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold backdrop-blur-sm border border-white/10">Mnemonic</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Help Output */}
                {aiHelp && (
                    <div className="mt-6 bg-white p-4 rounded-lg shadow-lg max-w-xl w-full border border-indigo-100 animate-fade-in">
                        <div className="flex items-center gap-2 text-indigo-600 font-bold mb-2 text-sm">
                            <Sparkles size={14}/> AI Tutor
                        </div>
                        <p className="text-slate-700 text-sm">{aiHelp}</p>
                    </div>
                )}
                
                <div className="mt-8 text-slate-400 font-medium">Card {idx + 1} of {cards.length}</div>
            </div>
        </div>
    );
};

// 4. Quiz Mode
const QuizMode = ({ questions, onBack }) => {
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);

    const score = Object.keys(answers).reduce((acc, key) => {
        return acc + (answers[key] === questions[key].a ? 1 : 0);
    }, 0);

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center justify-between mb-8 sticky top-0 bg-[#f8fafc] py-4 z-10 border-b border-slate-200">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition font-medium">
                    <ChevronLeft size={20} /> Exit Quiz
                </button>
                {submitted && (
                    <div className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold">
                        <GraduationCap size={18}/> Score: {score} / {questions.length}
                    </div>
                )}
            </div>

            <div className="space-y-8 pb-12">
                {questions.map((q, idx) => {
                    const selected = answers[idx];
                    const isCorrect = selected === q.a;
                    const isSelected = selected !== undefined;
                    
                    let statusClass = "bg-white border-slate-200";
                    if (submitted) {
                        if (isCorrect) statusClass = "bg-emerald-50 border-emerald-200";
                        else if (isSelected && !isCorrect) statusClass = "bg-red-50 border-red-200";
                    }

                    return (
                        <div key={idx} className={`p-6 rounded-xl border shadow-sm ${statusClass} transition-colors`}>
                            <div className="font-medium text-lg text-slate-800 mb-4 flex gap-3">
                                <span className="text-slate-400 font-bold">{idx + 1}.</span>
                                {q.q}
                            </div>
                            <div className="space-y-2 pl-6">
                                {q.options.map((opt, oIdx) => {
                                    const isOptSelected = selected === oIdx;
                                    const isOptCorrect = q.a === oIdx;
                                    
                                    let btnClass = "hover:bg-slate-50 border-slate-200";
                                    if (submitted) {
                                        if (isOptCorrect) btnClass = "bg-emerald-100 border-emerald-300 text-emerald-800 font-bold";
                                        else if (isOptSelected && !isOptCorrect) btnClass = "bg-red-100 border-red-300 text-red-800";
                                        else btnClass = "opacity-60 border-slate-200";
                                    } else {
                                        if (isOptSelected) btnClass = "bg-indigo-50 border-indigo-400 text-indigo-700 ring-1 ring-indigo-400";
                                    }

                                    return (
                                        <button 
                                            key={oIdx}
                                            disabled={submitted}
                                            onClick={() => setAnswers({...answers, [idx]: oIdx})}
                                            className={`w-full text-left p-3 rounded-lg border transition flex items-center gap-3 ${btnClass}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isOptSelected ? 'border-current' : 'border-slate-300'}`}>
                                                {isOptSelected && <div className="w-2.5 h-2.5 rounded-full bg-current"></div>}
                                            </div>
                                            {opt}
                                        </button>
                                    )
                                })}
                            </div>
                            {submitted && (
                                <div className="mt-4 ml-6 p-3 text-sm bg-white/50 rounded border border-slate-200 text-slate-600">
                                    <span className="font-bold">Explanation:</span> {q.exp}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {!submitted && (
                <div className="sticky bottom-6 flex justify-center">
                    <button 
                        onClick={() => setSubmitted(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-xl hover:shadow-2xl transition transform hover:-translate-y-1 flex items-center gap-2"
                    >
                        <CheckCircle size={20}/> Submit Quiz
                    </button>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP ---
export default function App() {
    // --- STATE INITIALIZATION WITH MIGRATION ---
    const [folders, setFolders] = useState(() => {
        const savedFolders = localStorage.getItem('studyGenieFolders');
        if (savedFolders) return JSON.parse(savedFolders);
        // Default folder if starting fresh
        return [{ id: 1, name: 'General' }];
    });

    const [decks, setDecks] = useState(() => {
        const savedDecks = localStorage.getItem('studyGenieData');
        let initialDecks = savedDecks ? JSON.parse(savedDecks) : [{ id: 101, folderId: 1, title: 'Example Module', content: '', cards: [], quiz: [], mode: 'dashboard' }];
        
        // MIGRATION: Ensure all decks have a folderId
        const migratedDecks = initialDecks.map(deck => {
            if (!deck.folderId) return { ...deck, folderId: 1 }; // Assign to default 'General' folder (ID 1)
            return deck;
        });
        
        return migratedDecks;
    });

    const [activeDeckId, setActiveDeckId] = useState(decks[0]?.id || null);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiKey') || '');
    const [showSettings, setShowSettings] = useState(false);

    // Persist Data
    useEffect(() => {
        localStorage.setItem('studyGenieFolders', JSON.stringify(folders));
        localStorage.setItem('studyGenieData', JSON.stringify(decks));
        localStorage.setItem('geminiKey', apiKey);
    }, [folders, decks, apiKey]);

    // Derived State
    const activeDeck = decks.find(d => d.id === activeDeckId) || decks[0];

    // --- ACTIONS ---

    // Update the active deck content/mode/etc
    const updateDeck = (updatedDeck) => {
        setDecks(decks.map(d => d.id === updatedDeck.id ? updatedDeck : d));
    };

    // Add a new folder
    const addFolder = () => {
        const name = prompt("Enter folder name:");
        if (name) {
            setFolders([...folders, { id: Date.now(), name }]);
        }
    };

    // Delete a folder (and its decks, optionally - currently just deletes folder and decks inside)
    const deleteFolder = (folderId) => {
        if (confirm("Delete this folder and all its modules?")) {
            setDecks(decks.filter(d => d.folderId !== folderId));
            setFolders(folders.filter(f => f.id !== folderId));
            if (activeDeck?.folderId === folderId) setActiveDeckId(null);
        }
    };

    // Add a new deck (module) to a specific folder
    const addDeck = (folderId) => {
        const newId = Date.now();
        const newDeck = { 
            id: newId, 
            folderId: folderId, 
            title: 'New Module', 
            content: '', 
            cards: [], 
            quiz: [], 
            mode: 'dashboard' 
        };
        setDecks([...decks, newDeck]);
        setActiveDeckId(newId);
    };

    // Delete a deck
    const deleteDeck = (id) => {
        if(confirm("Are you sure you want to delete this module?")) {
            const newDecks = decks.filter(d => d.id !== id);
            setDecks(newDecks);
            if (activeDeckId === id) setActiveDeckId(newDecks[0]?.id || null);
        }
    };

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900">
            {/* KaTeX CSS Injection */}
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
            
            <Sidebar 
                folders={folders}
                decks={decks}
                activeDeckId={activeDeckId}
                onSelectDeck={(id) => {
                    const d = decks.find(deck => deck.id === id);
                    if(d) updateDeck({...d, mode: 'dashboard'});
                    setActiveDeckId(id);
                }}
                onAddFolder={addFolder}
                onDeleteFolder={deleteFolder}
                onAddDeck={addDeck}
                onDeleteDeck={deleteDeck}
                onSettings={() => setShowSettings(true)}
            />
            
            <main className="flex-1 overflow-y-auto custom-scroll relative bg-[#f8fafc]">
                {activeDeck ? (
                    <>
                        {activeDeck.mode === 'dashboard' && (
                            <Dashboard deck={activeDeck} onUpdateDeck={updateDeck} apiKey={apiKey} />
                        )}
                        {activeDeck.mode === 'flashcards' && (
                            <FlashcardStudy 
                                cards={activeDeck.cards} 
                                onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})}
                                apiKey={apiKey}
                            />
                        )}
                        {activeDeck.mode === 'quiz' && (
                            <QuizMode 
                                questions={activeDeck.quiz} 
                                onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} 
                            />
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <BookOpen size={48} className="mb-4 opacity-50"/>
                        <p className="text-lg font-medium">Select or create a module to start studying.</p>
                    </div>
                )}
            </main>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20}/> Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={24}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Gemini API Key</label>
                                <input 
                                    type="password" 
                                    value={apiKey} 
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="AIzaSy..."
                                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Required for AI generation. Your key is stored locally in your browser.
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-600 ml-1 hover:underline">Get a key here.</a>
                                </p>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 text-white font-medium py-2 rounded hover:bg-indigo-700">
                                Save & Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}