import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    BookOpen, Brain, ChevronLeft, ChevronRight, Settings, 
    Plus, Trash2, GraduationCap, FileText, Sparkles, 
    RotateCw, CheckCircle, XCircle, Folder, ChevronDown,
    Mic, Presentation, BookOpenText, PieChart, AlertCircle,
    LayoutDashboard, Image as ImageIcon, X, FileType, LogOut, Lock, Mail, Edit3, Edit2,
    Clock, Layers, Zap, Tag, Hash, Timer, Award, FileQuestion
} from 'lucide-react';

// --- FIREBASE IMPORTS (Optional/Placeholder for future) ---
import { initializeApp } from "firebase/app";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, onAuthStateChanged 
} from "firebase/auth";
import { 
    getFirestore, collection, addDoc, updateDoc, deleteDoc, 
    doc, onSnapshot, query, orderBy, setDoc, getDoc, serverTimestamp 
} from "firebase/firestore";

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCqowVnkUXzjgutGHRKKptEm5NjCl7C4yQ",
  authDomain: "studygenie-691e5.firebaseapp.com",
  projectId: "studygenie-691e5",
  storageBucket: "studygenie-691e5.firebasestorage.app",
  messagingSenderId: "524154104312",
  appId: "1:524154104312:web:bc5f8b1d46ce9ee6e8ce0d",
  measurementId: "G-BVLGXPV56E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UTILS ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = reader.result.split(',')[1]; 
            resolve({
                inlineData: {
                    data: base64String,
                    mimeType: file.type
                }
            });
        };
        reader.onerror = (error) => reject(error);
    });
};

const getCardStatus = (card) => {
    if (!card.nextReview) return { label: 'New', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    const now = Date.now();
    if (card.nextReview <= now) return { label: 'Due', color: 'bg-orange-100 text-orange-700 border-orange-200' };
    
    const oneDay = 24 * 60 * 60 * 1000;
    if (card.nextReview > now + (3 * oneDay)) return { label: 'Mastered', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    
    return { label: 'Learning', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
};

// --- DATA SANITIZER ---
const validateAndFixData = (data, type) => {
    if (!Array.isArray(data)) return [];
    
    return data.map(item => {
        // Fix Flashcards
        if (type === 'flashcards') {
            return {
                q: String(item.q || "Error: Question missing"),
                a: String(item.a || "Error: Answer missing"),
                nextReview: item.nextReview || null 
            };
        }
        // Fix MCQs (Quiz or Exam)
        if (type === 'mcq' || type === 'exam') {
            let options = item.options;
            if (!options || !Array.isArray(options)) {
                options = ["True", "False"]; 
            }
            options = options.map(opt => String(opt));
            
            return {
                q: String(item.q || "Error: Question missing"),
                options: options,
                a: (typeof item.a === 'number' && item.a < options.length) ? item.a : 0, 
                exp: String(item.exp || "No explanation provided.")
            };
        }
        return item;
    }).filter(item => item); 
};

// --- NUCLEAR JSON PARSER ---
const cleanAndParseJSON = (text) => {
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    clean = clean.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");

    try {
        return JSON.parse(clean);
    } catch (e) {
        if (clean.startsWith('[') && !clean.endsWith(']')) {
            const lastClose = clean.lastIndexOf('}');
            if (lastClose !== -1) {
                const fixed = clean.substring(0, lastClose + 1) + ']';
                try { return JSON.parse(fixed); } catch (e2) { console.error("Repair failed", e2); }
            }
        }
        if (clean.startsWith('{') && !clean.endsWith('}')) {
             const lastQuote = clean.lastIndexOf('"');
             if (lastQuote !== -1) {
                 const fixed = clean.substring(0, lastQuote + 1) + '"}';
                 try { return JSON.parse(fixed); } catch(e3) { console.error("Object repair failed", e3); }
             }
        }
        console.error("JSON Parse Error:", e);
        throw new Error("Failed to parse AI response.");
    }
};

// --- TEXT RENDERER COMPONENT ---
const FormattedText = ({ text, className = "" }) => {
    const containerRef = useRef(null);

    const renderMath = () => {
        if (window.renderMathInElement && containerRef.current) {
            window.renderMathInElement(containerRef.current, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\(", right: "\\)", display: false},
                    {left: "\\[", right: "\\]", display: true}
                ],
                throwOnError: false
            });
        }
    };

    useEffect(() => {
        if (!window.renderMathInElement) {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
            script.onload = () => {
                const autoRender = document.createElement('script');
                autoRender.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js";
                autoRender.onload = () => renderMath();
                document.head.appendChild(autoRender);
            };
            document.head.appendChild(script);
        } else {
            renderMath();
        }
    }); 

    if (text === null || text === undefined) return null;

    const processText = (str) => {
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/ewline/g, '<br/>') 
            .replace(/\\newline/g, '<br/>') 
            .replace(/\\\\n/g, '<br/>') 
            .replace(/\\n/g, '<br/>')   
            .replace(/\n/g, '<br/>')    
            .replace(/\\textbf\{([^\}]+)\}/g, '<strong>$1</strong>')
            .replace(/\\text\{([^\}]+)\}/g, '$1')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/:\$/g, ':');
    };

    return (
        <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: processText(text) }} />
    );
};

// --- GEMINI AI SERVICE (DIRECT CLIENT MODE) ---
const generateContent = async (apiKey, prompt, context, systemInstruction, attachmentData = null, quantity = 1) => {
    if (!apiKey) throw new Error("API Key is missing. Please add your own Google Gemini Key in Settings.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const fullSystemPrompt = `
        You are StudyGenie, an advanced AI tutor.
        ${systemInstruction || ''}
        CRITICAL OUTPUT RULES:
        1. Return ONLY valid JSON.
        2. Do NOT use markdown code blocks.
        3. Double-escape all backslashes in LaTeX (e.g. \\\\alpha).
        4. Use HTML <br/> for line breaks.
        5. Use MARKDOWN for text formatting (e.g. **bold**).
        6. Use LaTeX ($...$) ONLY for mathematical formulas.
    `;

    const contentsPart = [{ text: `CONTEXT:\n${context}\n\nTASK:\n${prompt}` }];
    if (attachmentData) {
        contentsPart.push(attachmentData); 
        contentsPart[0].text += "\n\n[DOCUMENT CONTEXT]: Analyze the attached image or PDF document carefully.";
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: contentsPart }],
                    system_instruction: { parts: [{ text: fullSystemPrompt }] },
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (response.status === 429) {
                throw new Error("Quota Exceeded. Please wait a moment or check your Google Cloud billing.");
            }

            if (!response.ok) throw new Error(`Direct API Error: ${response.statusText}`);
            
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("No content generated.");

            return cleanAndParseJSON(text);

        } catch (error) {
            console.warn(`Attempt ${attempt + 1} failed:`, error.message);
            if (attempt === 2) throw error; 
            await sleep(2000 * (attempt + 1)); 
        }
    }
};

// --- AUTH COMPONENT ---
// (Included but currently bypassed by LocalStorage logic in main App)
const AuthPage = () => {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="text-center text-slate-500">
                Auth currently disabled for Local Mode.
            </div>
        </div>
    );
};

// --- EXAM SETUP MODAL ---
const ExamSetupModal = ({ modules, onClose, onStartExam }) => {
    const [selectedModuleIds, setSelectedModuleIds] = useState([]);

    const toggleModule = (id) => {
        setSelectedModuleIds(prev => 
            prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
        );
    };

    const handleStart = () => {
        if (selectedModuleIds.length === 0) return alert("Select at least one module.");
        onStartExam(selectedModuleIds);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                    <FileQuestion className="text-red-500"/> Mock Exam Setup
                </h3>
                <p className="text-sm text-slate-500 mb-4">Select modules to include in this exam simulation.</p>
                
                <div className="max-h-60 overflow-y-auto custom-scroll mb-6 border rounded-lg">
                    {modules.map(m => (
                        <div 
                            key={m.id} 
                            onClick={() => toggleModule(m.id)}
                            className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer hover:bg-slate-50 ${selectedModuleIds.includes(m.id) ? 'bg-indigo-50' : ''}`}
                        >
                            <span className="text-sm font-medium text-slate-700">{m.title}</span>
                            {selectedModuleIds.includes(m.id) && <CheckCircle size={16} className="text-indigo-600"/>}
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm">Cancel</button>
                    <button onClick={handleStart} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm font-bold flex items-center gap-2">
                        Start Exam
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- APP COMPONENTS ---

const Sidebar = ({ folders, decks, activeId, viewMode, onSelectDeck, onSelectFolder, onAddFolder, onDeleteFolder, onRenameFolder, onAddDeck, onDeleteDeck, onSettings }) => {
    const [expandedFolders, setExpandedFolders] = useState({});

    const toggleFolder = (folderId) => {
        setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    useEffect(() => {
        if (viewMode === 'deck' && activeId) {
            const activeDeck = decks.find(d => d.id === activeId);
            if (activeDeck) setExpandedFolders(prev => ({ ...prev, [activeDeck.folderId]: true }));
        } else if (viewMode === 'folder' && activeId) {
            setExpandedFolders(prev => ({ ...prev, [activeId]: true }));
        }
    }, [activeId, viewMode, decks]);

    return (
        <div className="w-full md:w-72 bg-slate-900 text-white flex flex-col h-screen fixed md:relative z-20 shadow-xl border-r border-slate-800">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
                <h1 className="font-bold text-xl flex items-center gap-2">
                    <GraduationCap className="text-indigo-400" /> StudyGenie
                </h1>
                <button onClick={onSettings} className="hover:text-indigo-400 transition"><Settings size={18}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                {folders.map(folder => (
                    <div key={folder.id}>
                        <div className="flex items-center justify-between group mb-2 select-none">
                            <div 
                                className="flex items-center gap-2 cursor-pointer hover:text-indigo-300 transition-colors flex-1 overflow-hidden" 
                                onClick={() => toggleFolder(folder.id)}
                            >
                                {expandedFolders[folder.id] ? <ChevronDown size={16} className="text-slate-500 flex-shrink-0"/> : <ChevronRight size={16} className="text-slate-500 flex-shrink-0"/>}
                                <Folder size={16} className="text-indigo-400 fill-indigo-400/20 flex-shrink-0"/>
                                <span className="font-semibold text-sm truncate">{folder.name}</span>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-1">
                                <button onClick={(e) => { e.stopPropagation(); onRenameFolder(folder); }} className="text-slate-500 hover:text-indigo-400 p-1" title="Rename Folder"><Edit2 size={12}/></button>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }} className="text-slate-500 hover:text-red-400 p-1" title="Delete Folder"><Trash2 size={12}/></button>
                            </div>
                        </div>

                        {expandedFolders[folder.id] && (
                            <div className="pl-6 space-y-1 border-l-2 border-slate-800 ml-2.5 transition-all">
                                <div 
                                    onClick={() => onSelectFolder(folder.id)}
                                    className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all mb-1 ${viewMode === 'folder' && activeId === folder.id ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                                >
                                    <PieChart size={14} />
                                    <div className="truncate text-xs font-medium">Course Overview</div>
                                </div>

                                {decks.filter(d => d.folderId === folder.id).map(deck => (
                                    <div key={deck.id} 
                                         onClick={() => onSelectDeck(deck.id)}
                                         className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all ${viewMode === 'deck' && activeId === deck.id ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                        <div className="truncate text-xs font-medium">{deck.title}</div>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteDeck(deck.id); }} className={`opacity-0 group-hover:opacity-100 hover:text-red-400 transition ${viewMode === 'deck' && activeId === deck.id ? 'opacity-100' : ''}`}><Trash2 size={12} /></button>
                                    </div>
                                ))}
                                <button onClick={() => onAddDeck(folder.id)} className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800/50 rounded-md transition flex items-center gap-2 mt-1"><Plus size={12} /> New Module</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            <div className="p-4 border-t border-slate-800 shrink-0">
                <button onClick={onAddFolder} className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition font-medium border border-slate-700"><Plus size={16} /> New Folder</button>
            </div>
        </div>
    );
};

const FolderDashboard = ({ folder, decks, onUpdateFolder, onUpdateDeck, apiKey }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [syllabusText, setSyllabusText] = useState(folder.syllabus || "");
    const [isGlobalStudy, setIsGlobalStudy] = useState(false);
    
    // NEW: Exam Setup State
    const [showExamSetup, setShowExamSetup] = useState(false);
    const [activeExamData, setActiveExamData] = useState(null); // For global exam

    useEffect(() => { setSyllabusText(folder.syllabus || ""); }, [folder.id]);
    const handleSaveSyllabus = () => onUpdateFolder({ ...folder, syllabus: syllabusText }); 

    const handleAnalyze = async () => {
        if (!syllabusText.trim()) return alert("Please paste the Course Outline first.");
        
        setIsAnalyzing(true);
        try {
            const allContent = decks.map(d => `MODULE: ${d.title}\nNOTES: ${d.notes || ''}\nSLIDES: ${d.slides || ''}\nTRANSCRIPT: ${d.transcript || ''}`).join("\n\n----------------\n\n");
            if (!allContent.trim()) return alert("No content found in modules!");

            const prompt = `Analyze 'STUDENT MATERIALS' against 'OFFICIAL SYLLABUS'. Return JSON: {"score": 0-100, "analysis": "summary", "missing": "missing topics"}`;
            const context = `OFFICIAL SYLLABUS:\n${syllabusText}\n\nSTUDENT MATERIALS:\n${allContent}`;

            const result = await generateContent(apiKey, prompt, context, "", null, 1);
            onUpdateFolder({ ...folder, syllabus: syllabusText, coverage: result });
        } catch (error) { 
            alert(error.message); 
        } finally { setIsAnalyzing(false); }
    };

    // Prepare global deck
    const globalCards = decks.flatMap(d => (d.cards || []).map(c => ({...c, _deckId: d.id})));

    const handleGlobalUpdate = (updatedGlobalDeck) => {
        const cardsByDeck = {};
        updatedGlobalDeck.cards.forEach(c => {
            if (c._deckId) {
                if (!cardsByDeck[c._deckId]) cardsByDeck[c._deckId] = [];
                cardsByDeck[c._deckId].push(c);
            }
        });

        Object.keys(cardsByDeck).forEach(deckId => {
            const originalDeck = decks.find(d => d.id === deckId);
            if (originalDeck) {
                onUpdateDeck({ ...originalDeck, cards: cardsByDeck[deckId] });
            }
        });
    };

    // HANDLER FOR STARTING MOCK EXAM
    const handleStartMockExam = (moduleIds) => {
        // Aggregate 'exams' questions from selected modules
        const examQuestions = decks
            .filter(d => moduleIds.includes(d.id))
            .flatMap(d => (d.exams || []));
        
        if (examQuestions.length === 0) return alert("No exam questions found in selected modules. Generate 'Exam Prep' content inside the modules first.");
        
        // Shuffle
        const shuffled = [...examQuestions].sort(() => 0.5 - Math.random());
        setActiveExamData(shuffled);
        setShowExamSetup(false);
    };

    if (isGlobalStudy) {
        const virtualDeck = { 
            id: 'global', 
            title: `${folder.name} (Global)`, 
            studyMode: 'srs', // Force SRS for global study usually
            cards: globalCards 
        };
        return <FlashcardStudy 
            cards={globalCards} 
            deck={virtualDeck} 
            apiKey={apiKey} 
            onUpdateDeck={handleGlobalUpdate}
            onBack={() => setIsGlobalStudy(false)} 
        />;
    }

    // Render Active Global Exam
    if (activeExamData) {
         const virtualExamDeck = { quizMode: 'exam' };
         return <QuizMode questions={activeExamData} deck={virtualExamDeck} onBack={() => setActiveExamData(null)} />;
    }

    const totalCards = decks.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
    const totalQuestions = decks.reduce((sum, d) => sum + (d.quiz?.length || 0), 0);
    const totalExamQs = decks.reduce((sum, d) => sum + (d.exams?.length || 0), 0);

    return (
        <div className="max-w-6xl mx-auto p-6 h-full flex flex-col">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3"><Folder size={32} className="text-indigo-500"/> {folder.name} <span className="text-slate-400 text-lg font-normal">/ Course Overview</span></h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                <div className="lg:col-span-8 flex flex-col gap-4 h-full">
                     {/* Syllabus Analysis Panel */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2"><BookOpenText size={20} className="text-emerald-500"/> Course Syllabus</h3>
                            <button onClick={handleSaveSyllabus} className="text-xs text-indigo-600 font-medium hover:underline">Save Text</button>
                        </div>
                        <textarea className="flex-1 w-full p-4 bg-slate-50 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-mono leading-relaxed" placeholder="Paste course outline here..." value={syllabusText} onChange={(e) => setSyllabusText(e.target.value)} onBlur={handleSaveSyllabus}></textarea>
                        <div className="mt-4">
                            <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70">
                                {isAnalyzing ? <RotateCw className="animate-spin"/> : <PieChart/>} {isAnalyzing ? "Auditing..." : "Analyze Coverage"}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4 space-y-6 overflow-y-auto">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><CheckCircle size={18} className="text-indigo-500"/> Content Audit</h3>
                        {folder.coverage ? (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-end gap-2">
                                    <span className={`text-4xl font-bold ${folder.coverage.score >= 80 ? 'text-emerald-600' : folder.coverage.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{folder.coverage.score}%</span>
                                    <span className="text-sm text-slate-500 mb-1">Coverage Score</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${folder.coverage.score}%` }}></div></div>
                                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-100"><FormattedText text={folder.coverage.analysis}/></div>
                                {folder.coverage.missing && <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700 border border-red-100"><div className="font-bold flex items-center gap-2 mb-1"><AlertCircle size={14}/> Missing:</div><FormattedText text={folder.coverage.missing}/></div>}
                            </div>
                        ) : <div className="text-center text-slate-400 py-8 text-sm">Run analysis to check coverage.</div>}
                    </div>
                    
                    {/* Course Totals */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4">Course Totals</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-slate-800">{decks.length}</div><div className="text-xs text-slate-500 uppercase">Modules</div></div>
                            <div className="bg-indigo-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-indigo-600">{totalCards}</div><div className="text-xs text-indigo-400 uppercase">Cards</div></div>
                            <div className="bg-emerald-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-emerald-600">{totalQuestions}</div><div className="text-xs text-emerald-400 uppercase">Practice</div></div>
                            <div className="bg-red-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-red-600">{totalExamQs}</div><div className="text-xs text-red-400 uppercase">Exam Qs</div></div>
                        </div>
                    </div>
                    
                    {/* GLOBAL BUTTONS */}
                    <div className="space-y-3">
                        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 rounded-xl shadow-md text-white">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Layers/> Global Study</h3>
                            <button onClick={() => setIsGlobalStudy(true)} disabled={totalCards === 0} className="w-full bg-white text-indigo-600 font-bold py-3 rounded-lg hover:bg-indigo-50 transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"><Zap size={18}/> Study All (SRS)</button>
                        </div>
                        <div className="bg-gradient-to-br from-red-500 to-rose-600 p-6 rounded-xl shadow-md text-white">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><FileQuestion/> Mock Exam</h3>
                            <button onClick={() => setShowExamSetup(true)} disabled={totalExamQs === 0} className="w-full bg-white text-red-600 font-bold py-3 rounded-lg hover:bg-red-50 transition disabled:opacity-70 flex items-center justify-center gap-2"><Timer size={18}/> Build Exam</button>
                        </div>
                    </div>
                </div>
            </div>
            
            {showExamSetup && (
                <ExamSetupModal 
                    modules={decks} 
                    onClose={() => setShowExamSetup(false)} 
                    onStartExam={handleStartMockExam} 
                />
            )}
        </div>
    );
};

// --- MANAGE CONTENT MODAL ---
const ManageModal = ({ type, items, onClose, onDeleteItem, onDeleteAll }) => {
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        {type === 'flashcards' ? <BookOpen className="text-indigo-500"/> : <Brain className="text-emerald-500"/>}
                        Manage {type === 'flashcards' ? 'Flashcards' : 'Quiz Questions'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X size={24}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scroll">
                    {items.length === 0 ? (
                        <div className="text-center text-slate-400 py-12">No items to show.</div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((item, i) => {
                                // Calculate visual status badge for List Item
                                const status = type === 'flashcards' ? getCardStatus(item) : null;
                                
                                return (
                                    <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-slate-300 transition">
                                        <div className="flex flex-col items-center gap-1 mt-1">
                                            <span className="text-xs font-bold text-slate-400">{i + 1}.</span>
                                            {status && (
                                                <div className={`w-2 h-2 rounded-full ${status.color.replace('text-', 'bg-').split(' ')[0]}`} title={status.label}></div>
                                            )}
                                        </div>
                                        <div className="flex-1 text-sm text-slate-700">
                                            <div className="font-medium mb-1 flex items-center gap-2">
                                                <FormattedText text={item.q} />
                                                {status && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${status.color}`}>{status.label}</span>}
                                            </div>
                                            <div className="text-xs text-slate-500 line-clamp-1 opacity-70">
                                                {type === 'flashcards' ? <FormattedText text={item.a} /> : 'Multiple Choice'}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => onDeleteItem(i)}
                                            className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition"
                                            title="Delete Item"
                                        >
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-slate-50 rounded-b-xl flex justify-between items-center">
                    <span className="text-xs text-slate-500">{items.length} items total</span>
                    <button 
                        onClick={onDeleteAll}
                        className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-lg transition"
                    >
                        <Trash2 size={16}/> Delete All
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- NAME INPUT MODAL ---
const NameModal = ({ isOpen, type, initialValue, onClose, onSave }) => {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (value.trim()) onSave(value.trim());
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-lg text-slate-800 mb-4">{type === 'create' ? 'New Folder' : 'Rename Folder'}</h3>
                <form onSubmit={handleSubmit}>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={value} 
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-4 text-slate-800"
                        placeholder="Folder Name"
                    />
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition text-sm font-bold">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const ModuleDashboard = ({ deck, onUpdateDeck, apiKey, userProfile }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [genType, setGenType] = useState("flashcards");
    const [count, setCount] = useState(10);
    const [activeTab, setActiveTab] = useState('notes');
    const fileInputRef = useRef(null);
    const [attachment, setAttachment] = useState(null);
    
    // Management Modal State
    const [manageMode, setManageMode] = useState(null); 

    const [inputs, setInputs] = useState({ notes: "", transcript: "", slides: "" });

    useEffect(() => {
        setInputs({ notes: deck.notes || deck.content || "", transcript: deck.transcript || "", slides: deck.slides || "" });
        setAttachment(null); 
    }, [deck.id]);

    const handleInputChange = (field, value) => {
        const newInputs = { ...inputs, [field]: value };
        setInputs(newInputs);
        onUpdateDeck({ ...deck, ...newInputs });
    };

    // DELETION HANDLERS
    const handleDeleteItem = (index) => {
        const key = manageMode === 'flashcards' ? 'cards' : (manageMode === 'quiz' ? 'quiz' : 'exams');
        const newItems = [...(deck[key] || [])];
        newItems.splice(index, 1);
        onUpdateDeck({ ...deck, [key]: newItems });
    };

    const handleDeleteAll = () => {
        const key = manageMode === 'flashcards' ? 'cards' : (manageMode === 'quiz' ? 'quiz' : 'exams');
        if (confirm(`Delete ALL ${manageMode}? This cannot be undone.`)) {
            onUpdateDeck({ ...deck, [key]: [] });
            setManageMode(null);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { return alert("File too large (>10MB)."); }

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => setAttachment({ type: 'image', data: e.target.result, file });
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            setAttachment({ type: 'pdf', name: file.name, file });
        }
    };

    // Mode Toggle
    const toggleStudyMode = (mode) => {
        onUpdateDeck({ ...deck, studyMode: mode });
    };
    
    // Quiz Mode Toggle
    const toggleQuizMode = (mode) => {
        onUpdateDeck({ ...deck, quizMode: mode });
    }

    const handleGenerate = async (type) => {
        const hasText = inputs.notes.trim() || inputs.transcript.trim() || inputs.slides.trim();
        const hasAttachment = !!attachment;
        if (!hasText && !hasAttachment) return alert("Please add text or a file.");
        
        setIsGenerating(true);
        setStatusMessage("Initializing...");
        const currentInputs = { ...inputs };

        try {
            const combinedContext = `MODULE: ${deck.title}\nNOTES: ${currentInputs.notes}\nTRANSCRIPT: ${currentInputs.transcript}\nSLIDES TEXT: ${currentInputs.slides}`;
            let systemInstruction = `Target audience: ${userProfile.age || 'University'} student`;
            if (userProfile.degree) systemInstruction += ` studying ${userProfile.degree}.`;

            let attachmentPayload = null;
            if (attachment?.file) attachmentPayload = await fileToBase64(attachment.file);

            const BATCH_SIZE = (type === 'flashcards') ? 20 : 10; 
            const totalBatches = Math.ceil(count / BATCH_SIZE);
            let accumulatedResults = [];

            // Determine target array
            const targetKey = type === 'flashcards' ? 'cards' : (type === 'exam' ? 'exams' : 'quiz');
            const existingItems = deck[targetKey] || [];
            const existingSample = existingItems.slice(-30).map(item => item.q.substring(0, 30)).join(" | ");

            for (let i = 0; i < totalBatches; i++) {
                setStatusMessage(`Generating batch ${i + 1} of ${totalBatches}...`);
                if (i > 0) await sleep(1000);

                const itemsRemaining = count - accumulatedResults.length;
                const currentBatchCount = Math.min(BATCH_SIZE, itemsRemaining);
                
                const currentSessionSample = accumulatedResults.map(item => item.q.substring(0, 30)).join(" | ");
                const exclusionList = `${existingSample} | ${currentSessionSample}`;
                
                const avoidInstruction = exclusionList.length > 5 ? ` CRITICAL: Do NOT generate questions similar to these: [${exclusionList.substring(0, 500)}...]` : "";

                let prompt = "";
                if (type === "flashcards") {
                    prompt = `Generate ${currentBatchCount} flashcards (JSON: [{"q":..., "a":...}]).${avoidInstruction}`;
                } else if (type === "exam") {
                    // SPECIAL EXAM PROMPT
                    prompt = `Generate ${currentBatchCount} HARD, scenario-based multiple choice questions for a FINAL EXAM. Focus on application of knowledge, critical thinking, and synthesis. Return JSON: [{"q":..., "options":..., "a":..., "exp":...}].${avoidInstruction}`;
                } else {
                    prompt = `Generate ${currentBatchCount} multiple choice questions (JSON: [{"q":..., "options":..., "a":..., "exp":...}]).${avoidInstruction}`;
                }

                try {
                    const batchResult = await generateContent(apiKey, prompt, combinedContext, systemInstruction, attachmentPayload, currentBatchCount);
                    // Safe handling for result + data validation
                    const safeResult = Array.isArray(batchResult) ? batchResult : (batchResult ? [batchResult] : []);
                    const validatedResult = validateAndFixData(safeResult, type === 'exam' ? 'mcq' : type);
                    
                    accumulatedResults = [...accumulatedResults, ...validatedResult];
                } catch (batchError) { 
                    console.error(batchError); break; 
                }
            }
            
            setStatusMessage("Saving...");
            const updatedDeck = { ...deck, ...currentInputs }; 
            updatedDeck[targetKey] = [...(deck[targetKey] || []), ...accumulatedResults];
            onUpdateDeck(updatedDeck);

        } catch (error) { 
            alert(error.message); 
        } finally { setIsGenerating(false); setStatusMessage(""); }
    };

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="mb-6"><input value={deck.title} onChange={(e) => onUpdateDeck({...deck, title: e.target.value})} className="text-3xl font-bold bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none w-full pb-2 text-slate-800" placeholder="Module Title"/></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-slate-200 h-[650px] flex flex-col overflow-hidden">
                    <div className="flex border-b border-slate-200 bg-slate-50/50">
                        {['notes', 'transcript', 'slides'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${activeTab === tab ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                {tab === 'notes' && <FileText size={16}/>}
                                {tab === 'transcript' && <Mic size={16}/>}
                                {tab === 'slides' && <Presentation size={16}/>}
                                {tab}
                                {inputs[tab].length > 0 && <span className={`ml-1 w-2 h-2 rounded-full ${activeTab === tab ? 'bg-indigo-400' : 'bg-slate-300'}`} />}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 relative">
                        <textarea className="w-full h-full p-6 resize-none focus:outline-none focus:bg-slate-50/30 text-sm leading-relaxed font-mono text-slate-700" placeholder={`Paste your ${activeTab} content here...`} value={inputs[activeTab]} onChange={(e) => handleInputChange(activeTab, e.target.value)}></textarea>
                        {attachment && (
                            <div className="absolute bottom-4 right-4 w-32 h-32 bg-white p-2 shadow-lg rounded-lg border border-slate-200 group flex flex-col items-center justify-center text-center">
                                {attachment.type === 'image' ? <img src={attachment.data} alt="Preview" className="w-full h-20 object-cover rounded mb-1"/> : <div className="w-full h-20 flex flex-col items-center justify-center bg-red-50 rounded mb-1 border border-red-100"><FileType size={32} className="text-red-500 mb-1"/><span className="text-[10px] font-bold text-red-700 uppercase">PDF</span></div>}
                                <span className="text-[10px] text-slate-500 truncate w-full px-1">{attachment.type === 'pdf' ? attachment.name : 'Image'}</span>
                                <button onClick={() => { setAttachment(null); fileInputRef.current.value = ""; }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition"><X size={12}/></button>
                            </div>
                        )}
                    </div>
                    
                    {/* UPDATED CONTROL BAR */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div className="flex gap-4 text-sm text-slate-600 items-center">
                            <div className="relative">
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} className={`p-2 rounded-lg border transition flex items-center gap-2 ${attachment ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`} title="Upload Slide Image or PDF">
                                    {attachment ? (attachment.type === 'pdf' ? <FileType size={18}/> : <ImageIcon size={18}/>) : <Plus size={18}/>} {attachment ? (attachment.type === 'pdf' ? "PDF" : "Image") : "File"}
                                </button>
                            </div>
                            <div className="h-6 w-px bg-slate-300 mx-2 hidden sm:block"></div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-500">Count:</span>
                                <div className="relative flex items-center">
                                    <Hash size={14} className="absolute left-2.5 text-slate-400 pointer-events-none"/>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="50" 
                                        value={count} 
                                        onChange={(e) => setCount(Number(e.target.value))} 
                                        className="w-20 pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700 font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => handleGenerate('flashcards')} disabled={isGenerating} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm">
                                {isGenerating ? <RotateCw className="animate-spin" size={16}/> : <Sparkles size={16}/>} {isGenerating ? statusMessage : "Cards"}
                            </button>
                            <button onClick={() => handleGenerate('mcq')} disabled={isGenerating} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm">
                                {isGenerating ? <RotateCw className="animate-spin" size={16}/> : <Brain size={16}/>} {isGenerating ? statusMessage : "Quiz"}
                            </button>
                            {/* NEW: Exam Prep Button */}
                            <button onClick={() => handleGenerate('exam')} disabled={isGenerating} className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm" title="Generate Hard Exam Questions">
                                {isGenerating ? <RotateCw className="animate-spin" size={16}/> : <FileQuestion size={16}/>} {isGenerating ? statusMessage : "Exam"}
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* Stats block */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Brain size={18}/> Stats</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex flex-col items-center justify-center text-center relative group">
                                <button onClick={() => setManageMode('flashcards')} className="absolute top-2 right-2 text-indigo-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition p-1" title="Manage Flashcards"><Edit3 size={14}/></button>
                                <div className="text-3xl font-bold text-indigo-600 mb-1">{deck.cards?.length || 0}</div>
                                <div className="text-xs text-indigo-400 font-bold uppercase">Cards</div>
                            </div>
                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 flex flex-col items-center justify-center text-center relative group">
                                <button onClick={() => setManageMode('quiz')} className="absolute top-2 right-2 text-emerald-300 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition p-1" title="Manage Questions"><Edit3 size={14}/></button>
                                <div className="text-3xl font-bold text-emerald-600 mb-1">{deck.quiz?.length || 0}</div>
                                <div className="text-xs text-emerald-400 font-bold uppercase">Practice</div>
                            </div>
                            {/* EXAM STATS */}
                            <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex flex-col items-center justify-center text-center relative group col-span-2">
                                <button onClick={() => setManageMode('exams')} className="absolute top-2 right-2 text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition p-1" title="Manage Exam Questions"><Edit3 size={14}/></button>
                                <div className="text-3xl font-bold text-red-600 mb-1">{deck.exams?.length || 0}</div>
                                <div className="text-xs text-red-400 font-bold uppercase">Exam Questions</div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                             <div className="flex justify-between items-center mb-3">
                                 <span className="font-bold text-slate-700">Study Mode</span>
                                 <div className="flex bg-slate-100 rounded-lg p-1">
                                     <button onClick={() => toggleStudyMode('standard')} className={`px-3 py-1 rounded-md text-xs font-bold transition ${(!deck.studyMode || deck.studyMode === 'standard') ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Standard</button>
                                     <button onClick={() => toggleStudyMode('srs')} className={`px-3 py-1 rounded-md text-xs font-bold transition ${deck.studyMode === 'srs' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Smart</button>
                                 </div>
                             </div>
                             <button onClick={() => onUpdateDeck({...deck, mode: 'flashcards'})} disabled={!deck.cards?.length} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                 <BookOpen size={18}/> Study Flashcards
                             </button>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                            <button onClick={() => onUpdateDeck({...deck, mode: 'quiz', quizMode: 'practice'})} disabled={!deck.quiz?.length} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <Brain size={18}/> Practice Quiz
                            </button>
                            <button onClick={() => onUpdateDeck({...deck, mode: 'exam', quizMode: 'exam'})} disabled={!deck.exams?.length} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <FileQuestion size={18}/> Simulate Exam
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {manageMode && (
                <ManageModal 
                    type={manageMode}
                    items={manageMode === 'flashcards' ? (deck.cards || []) : (manageMode === 'quiz' ? (deck.quiz || []) : (deck.exams || []))}
                    onClose={() => setManageMode(null)}
                    onDeleteItem={handleDeleteItem}
                    onDeleteAll={handleDeleteAll}
                />
            )}
        </div>
    );
};

const FlashcardStudy = ({ cards, onBack, apiKey, onUpdateDeck, deck }) => {
    // Determine Mode
    const mode = deck.studyMode || 'standard';
    const isSRS = mode === 'srs';

    // SRS STATE (Only used if isSRS is true)
    const [dueQueue, setDueQueue] = useState([]);
    
    // STANDARD STATE (Only used if isSRS is false)
    const [idx, setIdx] = useState(0);

    const [currentCard, setCurrentCard] = useState(null);
    const [flipped, setFlipped] = useState(false);
    const [aiHelp, setAiHelp] = useState(null);
    const [loadingHelp, setLoadingHelp] = useState(false);
    const [sessionComplete, setSessionComplete] = useState(false);

    // Initialization logic
    useEffect(() => {
        if (isSRS) {
            // SRS Init: Filter for due cards
            const now = Date.now();
            const queue = cards
                .map((c, i) => ({ ...c, originalIndex: i }))
                .filter(c => !c.nextReview || c.nextReview <= now);
            
            setDueQueue(queue);
            if (queue.length > 0) setCurrentCard(queue[0]);
            else setSessionComplete(true);
        } else {
            // Standard Init: Just show first card
            if (cards.length > 0) setCurrentCard(cards[0]);
            else setSessionComplete(true); // Empty deck
        }
    }, [isSRS, cards]);

    // STANDARD NAVIGATION
    const nextStandard = useCallback(() => { 
        setFlipped(false); setAiHelp(null); 
        const nextIdx = (idx + 1) % cards.length;
        setIdx(nextIdx);
        setCurrentCard(cards[nextIdx]);
    }, [idx, cards]);

    const prevStandard = useCallback(() => { 
        setFlipped(false); setAiHelp(null); 
        const prevIdx = (idx - 1 + cards.length) % cards.length;
        setIdx(prevIdx);
        setCurrentCard(cards[prevIdx]);
    }, [idx, cards]);

    // SRS RATING HANDLER
    const handleRate = useCallback((intervalMinutes) => {
        // Prevent action if no card
        if (!currentCard) return;

        const now = Date.now();
        const nextReview = now + (intervalMinutes * 60 * 1000);
        
        // Update main deck in Firestore
        const updatedCards = [...cards];
        const cardIndex = currentCard.originalIndex; // Need original index for SRS updates
        if (cardIndex !== undefined) {
             updatedCards[cardIndex] = { ...cards[cardIndex], nextReview };
             onUpdateDeck({ ...deck, cards: updatedCards });
        }

        // Update Queue for current session
        let newQueue = dueQueue.slice(1);
        if (intervalMinutes < 10) {
             // Re-queue card at end if "Again" or "Hard"
             // Using a random position in the next 3 cards to prevent immediate repetition if queue > 1
             const insertPos = Math.min(newQueue.length, Math.floor(Math.random() * 3) + 1);
             const cardToRequeue = { ...currentCard, nextReview, originalIndex: cardIndex };
             newQueue.splice(insertPos, 0, cardToRequeue);
        }
        
        setFlipped(false);
        setAiHelp(null);
        setDueQueue(newQueue);
        
        if (newQueue.length > 0) setCurrentCard(newQueue[0]);
        else setSessionComplete(true);
    }, [currentCard, cards, deck, dueQueue, onUpdateDeck]);

    // Keyboard Shortcuts
    useEffect(() => {
        const h = (e) => { 
            if (e.code === 'Space') { 
                e.preventDefault(); 
                setFlipped(p=>!p); 
            } 
            else if (!isSRS && e.code === 'ArrowRight') nextStandard(); 
            else if (!isSRS && e.code === 'ArrowLeft') prevStandard();
            else if (isSRS && flipped) {
                // Number shortcuts for SRS
                if (e.key === '1') handleRate(1);      // Again
                if (e.key === '2') handleRate(10);     // Hard
                if (e.key === '3') handleRate(1440);   // Good
                if (e.key === '4') handleRate(5760);   // Easy
            }
        };
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    }, [isSRS, flipped, nextStandard, prevStandard, handleRate]);

    const getHelp = async (type) => {
        if (loadingHelp) return;
        if (!apiKey) return alert("Need API Key");
        setLoadingHelp(true);
        try {
            const res = await generateContent(apiKey, `Provide a ${type} for: Q: ${currentCard.q}, A: ${currentCard.a}. Return JSON: {"text": "..."}`, "");
            setAiHelp(res.text);
        } catch(e) { alert("AI Error"); }
        finally { setLoadingHelp(false); }
    };

    if (sessionComplete) {
         if (isSRS) {
             const nextDue = cards.map(c => c.nextReview || 0).sort((a,b) => a-b)[0];
             const date = new Date(nextDue);
             return (
                 <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                     <div className="bg-emerald-100 p-6 rounded-full mb-6 text-emerald-600"><CheckCircle size={48}/></div>
                     <h2 className="text-3xl font-bold text-slate-800 mb-2">Review Complete!</h2>
                     <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mt-6 flex items-center gap-3">
                         <Clock className="text-indigo-500"/>
                         <span className="text-sm font-medium text-slate-600">Next review: <strong>{nextDue ? date.toLocaleTimeString() : "Now"}</strong></span>
                     </div>
                     <button onClick={onBack} className="mt-12 px-6 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition">Back to Dashboard</button>
                 </div>
             );
         } else {
             return <div className="h-full flex items-center justify-center">No cards available.</div>;
         }
    }
    
    if (!currentCard) return <div>Loading...</div>;

    // Get status for badge
    const status = getCardStatus(currentCard);

    return (
        <div className="h-full flex flex-col p-6 max-w-4xl mx-auto w-full">
            <button onClick={onBack} className="self-start mb-4 flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Back</button>
            <div className="flex-1 flex flex-col items-center justify-center relative perspective-1000">
                
                {/* Standard Mode Arrows */}
                {!isSRS && (
                    <>
                        <button onClick={prevStandard} className="absolute left-0 p-3 bg-white rounded-full shadow hover:scale-110 transition z-10"><ChevronLeft/></button>
                        <button onClick={nextStandard} className="absolute right-0 p-3 bg-white rounded-full shadow hover:scale-110 transition z-10"><ChevronRight/></button>
                    </>
                )}

                <div className="w-full max-w-2xl h-96 relative cursor-pointer" onClick={() => setFlipped(!flipped)}>
                    <div className="w-full h-full relative shadow-2xl rounded-2xl" style={{ transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="absolute w-full h-full bg-white rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 border" style={{ backfaceVisibility: 'hidden' }}>
                            {/* STATUS BADGE */}
                            <span className={`absolute top-6 right-6 px-3 py-1 rounded-full text-xs font-bold border ${status.color}`}>
                                {status.label}
                            </span>
                            <div className="text-2xl font-medium text-center"><FormattedText text={currentCard.q}/></div>
                            <div className="absolute bottom-6 text-slate-400 text-sm animate-pulse">Click to Flip</div>
                        </div>
                        <div className="absolute w-full h-full bg-indigo-600 rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <div className="text-xl font-medium text-center overflow-y-auto max-h-full custom-scroll"><FormattedText text={currentCard.a}/></div>
                            
                            {/* AI Helper Actions (Always Visible on Back) */}
                            <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
                                <button onClick={() => getHelp('simplify')} disabled={loadingHelp} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1">{loadingHelp ? <RotateCw className="animate-spin" size={12}/> : null} Simplify</button>
                                <button onClick={() => getHelp('mnemonic')} disabled={loadingHelp} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1">{loadingHelp ? <RotateCw className="animate-spin" size={12}/> : null} Mnemonic</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* SRS Controls - Only show when flipped and in SRS Mode */}
                {isSRS && flipped && (
                    <div className="mt-8 flex gap-3 animate-fade-in-up">
                        <button onClick={() => handleRate(1)} className="flex flex-col items-center px-6 py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl transition border-b-4 border-red-200 hover:border-red-300 active:border-b-0 active:translate-y-1">
                            <span className="font-bold">Again</span><span className="text-[10px] opacity-70">1m (1)</span>
                        </button>
                        <button onClick={() => handleRate(10)} className="flex flex-col items-center px-6 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl transition border-b-4 border-orange-200 hover:border-orange-300 active:border-b-0 active:translate-y-1">
                            <span className="font-bold">Hard</span><span className="text-[10px] opacity-70">10m (2)</span>
                        </button>
                        <button onClick={() => handleRate(1440)} className="flex flex-col items-center px-6 py-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl transition border-b-4 border-emerald-200 hover:border-emerald-300 active:border-b-0 active:translate-y-1">
                            <span className="font-bold">Good</span><span className="text-[10px] opacity-70">1d (3)</span>
                        </button>
                        <button onClick={() => handleRate(5760)} className="flex flex-col items-center px-6 py-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl transition border-b-4 border-blue-200 hover:border-blue-300 active:border-b-0 active:translate-y-1">
                            <span className="font-bold">Easy</span><span className="text-[10px] opacity-70">4d (4)</span>
                        </button>
                    </div>
                )}
                
                {/* Standard Mode Navigation Hint */}
                {!isSRS && flipped && (
                     <div className="mt-8">
                         <button onClick={nextStandard} className="px-8 py-3 bg-slate-800 text-white rounded-full font-bold shadow-lg hover:bg-slate-700 transition">Next Card</button>
                     </div>
                )}

                {aiHelp && <div className="mt-6 bg-white p-4 rounded-lg shadow border border-indigo-100 max-w-xl w-full text-sm text-slate-700 animate-fade-in"><strong className="text-indigo-600 block mb-1">AI Helper:</strong> <FormattedText text={aiHelp}/></div>}
                
                {/* Progress Indicator */}
                <div className="mt-8 text-slate-400 font-medium">
                    {isSRS ? `Queue: ${dueQueue.length} remaining` : `Card ${idx + 1} / ${cards.length}`}
                </div>
            </div>
        </div>
    );
};

const QuizMode = ({ questions, onBack, deck }) => {
    // Determine Mode
    const isExam = deck?.quizMode === 'exam';

    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(questions.length * 90); // 1.5 mins per question

    // Calculate Score
    const score = Object.keys(answers).reduce((acc, key) => acc + (answers[key] === questions[key].a ? 1 : 0), 0);
    const percentage = Math.round((score / questions.length) * 100);

    // Timer Logic for Exam Mode
    useEffect(() => {
        if (isExam && !submitted && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
            return () => clearInterval(timer);
        } else if (timeLeft === 0 && !submitted) {
            setSubmitted(true); // Auto-submit on time up
        }
    }, [isExam, submitted, timeLeft]);

    // Format Time
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // Grade Calculation
    const getGrade = (pct) => {
        if (pct >= 85) return { grade: "HD", color: "text-emerald-600", text: "High Distinction" };
        if (pct >= 75) return { grade: "D", color: "text-blue-600", text: "Distinction" };
        if (pct >= 65) return { grade: "C", color: "text-indigo-600", text: "Credit" };
        if (pct >= 50) return { grade: "P", color: "text-orange-600", text: "Pass" };
        return { grade: "F", color: "text-red-600", text: "Fail" };
    };

    const grade = getGrade(percentage);

    return (
        <div className="max-w-3xl mx-auto p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-[#f8fafc] py-4 z-10 border-b">
                <button onClick={onBack} className="flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Exit</button>
                
                {isExam && !submitted && (
                    <div className={`font-mono font-bold text-xl flex items-center gap-2 ${timeLeft < 60 ? 'text-red-600 animate-pulse' : 'text-slate-700'}`}>
                        <Clock size={20}/> {formatTime(timeLeft)}
                    </div>
                )}
                
                {submitted && (
                    <div className="flex items-center gap-3">
                         {isExam && <div className={`text-xl font-bold ${grade.color}`}>{grade.grade} ({percentage}%)</div>}
                         {!isExam && <div className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold">Score: {score} / {questions.length}</div>}
                    </div>
                )}
            </div>

            {/* Results Screen for Exam Mode */}
            {submitted && isExam && (
                <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 text-center mb-8 animate-fade-in">
                    <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
                        <Award size={48} className={grade.color} />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-800 mb-2">{grade.text}</h2>
                    <p className="text-slate-500 mb-6">You scored {score} out of {questions.length} ({percentage}%)</p>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div className={`h-full ${grade.color.replace('text-', 'bg-')}`} style={{ width: `${percentage}%` }}></div>
                    </div>
                </div>
            )}

            {/* Questions List */}
            <div className="space-y-8 pb-12">
                {questions.map((q, idx) => {
                    const sel = answers[idx];
                    const correct = q.a === idx;
                    
                    let status = "bg-white border-slate-200";
                    if (submitted) {
                        status = (sel === q.a) ? "bg-emerald-50 border-emerald-200" : (sel !== undefined ? "bg-red-50 border-red-200" : status);
                    }
                    
                    return (
                        <div key={idx} className={`p-6 rounded-xl border shadow-sm ${status}`}>
                            <div className="font-medium text-lg mb-4 flex gap-3"><span className="text-slate-400 font-bold">{idx + 1}.</span><FormattedText text={q.q}/></div>
                            <div className="space-y-2 pl-6">
                                {q.options.map((opt, oIdx) => {
                                    // Visual Logic for Options
                                    let btnClass = `w-full text-left p-3 rounded-lg border transition flex gap-3 `;
                                    
                                    if (submitted) {
                                        // In Exam Mode, show correct answers ONLY after submission
                                        // In Practice Mode, highlight immediately
                                        if (oIdx === q.a) btnClass += "bg-emerald-100 border-emerald-300 font-bold "; 
                                        else if (sel === oIdx) btnClass += "bg-red-100 border-red-300 "; 
                                        else btnClass += "opacity-60 ";
                                    } else {
                                        // Active State during selection
                                        // In Practice Mode: Instant Feedback Logic
                                        if (!isExam && sel !== undefined) {
                                             if (oIdx === q.a) btnClass += "bg-emerald-100 border-emerald-300 font-bold ";
                                             else if (sel === oIdx) btnClass += "bg-red-100 border-red-300 ";
                                             else btnClass += "opacity-60 ";
                                        } else {
                                             btnClass += (sel === oIdx) ? "bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400 " : "hover:bg-slate-50 ";
                                        }
                                    }

                                    return (
                                        <button key={oIdx} disabled={submitted && isExam} onClick={() => setAnswers({...answers, [idx]: oIdx})} className={btnClass}>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${sel === oIdx ? 'border-current' : 'border-slate-300'}`}>{sel === oIdx && <div className="w-2.5 h-2.5 rounded-full bg-current"></div>}</div>
                                            <FormattedText text={opt}/>
                                        </button>
                                    );
                                })}
                            </div>
                            
                            {/* Explanation logic:
                                - Exam Mode: Show only after submit
                                - Practice Mode: Show immediately if answer selected
                            */}
                            {(!isExam && sel !== undefined) || (isExam && submitted) ? (
                                <div className="mt-4 ml-6 p-3 text-sm bg-white/50 rounded border text-slate-600 animate-fade-in">
                                    <strong>Explanation:</strong> <FormattedText text={q.exp}/>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            
            {(!submitted || !isExam) && (
                <div className="sticky bottom-6 flex justify-center">
                    <button 
                        onClick={() => setSubmitted(true)} 
                        className={`text-white font-bold py-3 px-8 rounded-full shadow-xl transition hover:-translate-y-1 ${isExam ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {isExam ? "Finish Exam" : "Submit Quiz"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default function App() {
    const [folders, setFolders] = useState(() => JSON.parse(localStorage.getItem('studyGenieFolders')) || [{ id: 1, name: 'General' }]);
    const [decks, setDecks] = useState(() => {
        const d = JSON.parse(localStorage.getItem('studyGenieData')) || [{ id: 101, folderId: 1, title: 'Example Module' }];
        return d.map(x => x.folderId ? x : { ...x, folderId: 1 });
    });
    const [userProfile, setUserProfile] = useState(() => JSON.parse(localStorage.getItem('studyGenieProfile')) || { age: '', degree: '' });
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiKey') || '');
    const [viewMode, setViewMode] = useState('deck'); 
    const [activeId, setActiveId] = useState(decks[0]?.id || null);
    const [showSettings, setShowSettings] = useState(false);
    
    // Name Modal State
    const [nameModal, setNameModal] = useState({ isOpen: false, type: '', folder: null, value: '' });

    useEffect(() => {
        localStorage.setItem('studyGenieFolders', JSON.stringify(folders));
        localStorage.setItem('studyGenieData', JSON.stringify(decks));
        localStorage.setItem('studyGenieProfile', JSON.stringify(userProfile));
        localStorage.setItem('geminiKey', apiKey);
    }, [folders, decks, userProfile, apiKey]);

    const activeDeck = viewMode === 'deck' ? decks.find(d => d.id === activeId) : null;
    const activeFolder = viewMode === 'folder' ? folders.find(f => f.id === activeId) : null;

    const updateDeck = (d) => setDecks(decks.map(x => x.id === d.id ? d : x));
    const updateFolder = (f) => setFolders(folders.map(x => x.id === f.id ? f : x));
    
    // New Folder / Rename Logic
    const openAddFolder = () => setNameModal({ isOpen: true, type: 'create', folder: null, value: '' });
    const openRenameFolder = (folder) => setNameModal({ isOpen: true, type: 'rename', folder: folder, value: folder.name });

    const handleSaveName = (name) => {
        if (nameModal.type === 'create') {
            setFolders([...folders, { id: Date.now(), name }]);
        } else {
            setFolders(folders.map(f => f.id === nameModal.folder.id ? { ...f, name } : f));
        }
        setNameModal({ isOpen: false, type: '', folder: null, value: '' });
    };

    const deleteFolder = (id) => { if(confirm("Delete folder?")) { setDecks(decks.filter(d => d.folderId !== id)); setFolders(folders.filter(f => f.id !== id)); setActiveId(null); }};
    const addDeck = (fid) => { const nid = Date.now(); setDecks([...decks, { id: nid, folderId: fid, title: 'New Module', mode: 'dashboard' }]); setViewMode('deck'); setActiveId(nid); };
    const deleteDeck = (id) => { if(confirm("Delete module?")) { const rem = decks.filter(d => d.id !== id); setDecks(rem); if(activeId === id) setActiveId(rem[0]?.id || null); }};

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
            <Sidebar 
                folders={folders} decks={decks} activeId={activeId} viewMode={viewMode}
                onSelectDeck={(id) => { setViewMode('deck'); setActiveId(id); if(decks.find(d=>d.id===id)) updateDeck({...decks.find(d=>d.id===id), mode: 'dashboard'}); }}
                onSelectFolder={(id) => { setViewMode('folder'); setActiveId(id); }}
                onAddFolder={openAddFolder} onDeleteFolder={deleteFolder} onRenameFolder={openRenameFolder} 
                onAddDeck={addDeck} onDeleteDeck={deleteDeck}
                onSettings={() => setShowSettings(true)}
            />
            <main className="flex-1 overflow-y-auto custom-scroll relative bg-[#f8fafc]">
                {viewMode === 'folder' && activeFolder && <FolderDashboard folder={activeFolder} decks={decks.filter(d => d.folderId === activeFolder.id)} onUpdateFolder={updateFolder} apiKey={apiKey} />}
                {viewMode === 'deck' && activeDeck && (
                    <>
                        {activeDeck.mode === 'dashboard' && <ModuleDashboard deck={activeDeck} onUpdateDeck={updateDeck} apiKey={apiKey} userProfile={userProfile} />}
                        {activeDeck.mode === 'flashcards' && <FlashcardStudy cards={activeDeck.cards || []} deck={activeDeck} onUpdateDeck={updateDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} apiKey={apiKey} />}
                        {activeDeck.mode === 'quiz' && <QuizMode questions={activeDeck.quiz || []} deck={activeDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} />}
                        {activeDeck.mode === 'exam' && <QuizMode questions={activeDeck.exams || []} deck={activeDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} />}
                    </>
                )}

                {!activeDeck && !activeFolder && <div className="flex h-full items-center justify-center text-slate-400"><BookOpen size={48} className="opacity-50"/></div>}
            </main>

            {/* Name Input Modal */}
            <NameModal 
                isOpen={nameModal.isOpen}
                type={nameModal.type}
                initialValue={nameModal.value}
                onClose={() => setNameModal({ ...nameModal, isOpen: false })}
                onSave={handleSaveName}
            />

            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">Settings</h3><button onClick={() => setShowSettings(false)}><XCircle/></button></div>
                        <div className="space-y-4">
                            <div><label className="text-sm font-bold">API Key</label><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full p-2 border rounded"/></div>
                            <div className="pt-4 border-t"><h4 className="font-bold mb-2">Profile</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <input placeholder="Age" type="number" value={userProfile.age} onChange={e=>setUserProfile({...userProfile, age: e.target.value})} className="p-2 border rounded"/>
                                    <input placeholder="Degree" value={userProfile.degree} onChange={e=>setUserProfile({...userProfile, degree: e.target.value})} className="p-2 border rounded"/>
                                </div>
                            </div>
                            <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 text-white font-bold py-2 rounded">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}