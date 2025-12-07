import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    BookOpen, Brain, ChevronLeft, ChevronRight, Settings, 
    Plus, Trash2, GraduationCap, FileText, Sparkles, 
    RotateCw, CheckCircle, XCircle, Folder, ChevronDown,
    Mic, Presentation, BookOpenText, PieChart, AlertCircle,
    LayoutDashboard, Image as ImageIcon, X, FileType, LogOut, Lock, Mail
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
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

    if (!text) return null;

    const processText = (str) => {
        if (typeof str !== 'string') return str;
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

    // Helper to cleanup and parse response
    const parseResponse = (text) => {
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // NUCLEAR FIX for "Bad escaped character"
        // This regex finds any backslash that is NOT followed by a valid JSON escape char (", \, /, b, f, n, r, t, u)
        // It replaces it with a double backslash. This fixes LaTeX like \alpha -> \\alpha without breaking \n -> \\n
        cleanText = cleanText.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

        try {
            return JSON.parse(cleanText);
        } catch (e) {
            // Recovery for truncated JSON
            if (cleanText.trim().startsWith('[') && !cleanText.trim().endsWith(']')) {
                const lastObjectEnd = cleanText.lastIndexOf('}');
                if (lastObjectEnd !== -1) return JSON.parse(cleanText.substring(0, lastObjectEnd + 1) + ']');
            }
            if (cleanText.trim().startsWith('{') && !cleanText.trim().endsWith('}')) {
                 const lastQuote = cleanText.lastIndexOf('"');
                 if (lastQuote !== -1) return JSON.parse(cleanText.substring(0, lastQuote + 1) + '"}'); 
            }
            throw e;
        }
    };

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: contentsPart }],
                    system_instruction: { parts: [{ text: fullSystemPrompt }] }
                })
            });

            if (response.status === 429) {
                // If local rate limit hit
                throw new Error("Quota Exceeded. Please wait a moment or check your Google Cloud billing.");
            }

            if (!response.ok) throw new Error(`Direct API Error: ${response.statusText}`);
            
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("No content generated.");

            return parseResponse(text);

        } catch (error) {
            if (attempt === 2) throw error; 
            await sleep(2000 * (attempt + 1)); 
        }
    }
};

// --- AUTH COMPONENT ---
const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleAuth = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            setError(err.message.replace("Firebase: ", ""));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 mb-4">
                        <GraduationCap size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Welcome to StudyGenie</h1>
                    <p className="text-slate-500 mt-2">Your AI-powered study companion.</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="student@university.edu"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg flex items-center gap-2"><AlertCircle size={14}/> {error}</div>}

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {loading ? <RotateCw className="animate-spin" size={20}/> : (isLogin ? "Sign In" : "Create Account")}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                        {isLogin ? "Need an account? Sign Up" : "Already have an account? Sign In"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- APP COMPONENTS ---

const Sidebar = ({ folders, decks, activeId, viewMode, onSelectDeck, onSelectFolder, onAddFolder, onDeleteFolder, onAddDeck, onDeleteDeck, onSettings }) => {
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
                        <div className="flex items-center justify-between group mb-2 select-none">
                            <div 
                                className="flex items-center gap-2 cursor-pointer hover:text-indigo-300 transition-colors flex-1" 
                                onClick={() => toggleFolder(folder.id)}
                            >
                                {expandedFolders[folder.id] ? <ChevronDown size={16} className="text-slate-500"/> : <ChevronRight size={16} className="text-slate-500"/>}
                                <Folder size={16} className="text-indigo-400 fill-indigo-400/20"/>
                                <span className="font-semibold text-sm truncate">{folder.name}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition p-1"><Trash2 size={14}/></button>
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
            
            <div className="p-4 border-t border-slate-800 shrink-0 space-y-2">
                <button onClick={onAddFolder} className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white transition font-medium border border-slate-700"><Plus size={16} /> New Folder</button>
                <button onClick={() => signOut(auth)} className="w-full flex items-center justify-center gap-2 p-2.5 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded-lg text-sm transition"><LogOut size={16}/> Sign Out</button>
            </div>
        </div>
    );
};

const FolderDashboard = ({ folder, decks, onUpdateFolder, apiKey }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [syllabusText, setSyllabusText] = useState(folder.syllabus || "");

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

            // Count this as 1 item for usage limit
            const result = await generateContent(apiKey, prompt, context, "", null, 1);
            onUpdateFolder({ ...folder, syllabus: syllabusText, coverage: result });
        } catch (error) { 
            alert(error.message); 
        } finally { setIsAnalyzing(false); }
    };

    const totalCards = decks.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
    const totalQuestions = decks.reduce((sum, d) => sum + (d.quiz?.length || 0), 0);

    return (
        <div className="max-w-6xl mx-auto p-6 h-full flex flex-col">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3"><Folder size={32} className="text-indigo-500"/> {folder.name} <span className="text-slate-400 text-lg font-normal">/ Course Overview</span></h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                <div className="lg:col-span-8 flex flex-col gap-4 h-full">
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
                            <div className="bg-emerald-50 p-4 rounded-lg text-center col-span-2"><div className="text-2xl font-bold text-emerald-600">{totalQuestions}</div><div className="text-xs text-emerald-400 uppercase">Quiz Questions</div></div>
                        </div>
                    </div>
                </div>
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
    
    const [inputs, setInputs] = useState({ notes: "", transcript: "", slides: "" });

    useEffect(() => {
        setInputs({ notes: deck.notes || deck.content || "", transcript: deck.transcript || "", slides: deck.slides || "" });
        setAttachment(null); 
    }, [deck.id]);

    const handleInputChange = (field, value) => {
        const newInputs = { ...inputs, [field]: value };
        setInputs(newInputs);
        onUpdateDeck({ ...deck, ...newInputs }); // Autosave to DB
    };

    const clearContent = (type) => {
        const key = type === 'flashcards' ? 'cards' : 'quiz';
        if (!deck[key] || deck[key].length === 0) return;
        if (confirm(`Delete all ${type}?`)) onUpdateDeck({ ...deck, [key]: [] });
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

    const handleGenerate = async () => {
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

            const BATCH_SIZE = 5; 
            const totalBatches = Math.ceil(count / BATCH_SIZE);
            let accumulatedResults = [];

            for (let i = 0; i < totalBatches; i++) {
                setStatusMessage(`Generating batch ${i + 1} of ${totalBatches}...`);
                if (i > 0) await sleep(1000);

                const itemsRemaining = count - accumulatedResults.length;
                const currentBatchCount = Math.min(BATCH_SIZE, itemsRemaining);
                const avoidInstruction = accumulatedResults.length > 0 ? ` Do NOT repeat: ${accumulatedResults.slice(-5).map(item => item.q.substring(0, 15)).join(", ")}...` : "";

                let prompt = genType === "flashcards" 
                    ? `Generate ${currentBatchCount} flashcards (JSON: [{"q":..., "a":...}]).${avoidInstruction}`
                    : `Generate ${currentBatchCount} MCQs (JSON: [{"q":..., "options":..., "a":..., "exp":...}]).${avoidInstruction}`;

                try {
                    const batchResult = await generateContent(apiKey, prompt, combinedContext, systemInstruction, attachmentPayload, currentBatchCount);
                    accumulatedResults = [...accumulatedResults, ...batchResult];
                } catch (batchError) { 
                    alert(batchError.message);
                    console.error(batchError); break; 
                }
            }
            
            setStatusMessage("Saving...");
            const updatedDeck = { ...deck, ...currentInputs }; 
            if (genType === "flashcards") updatedDeck.cards = [...(deck.cards || []), ...accumulatedResults];
            else updatedDeck.quiz = [...(deck.quiz || []), ...accumulatedResults];
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
                                <span className="font-medium">Gen:</span>
                                <select value={genType} onChange={(e) => setGenType(e.target.value)} className="bg-white rounded-md px-3 py-1.5 border border-slate-300 focus:outline-none">
                                    <option value="flashcards">Cards</option>
                                    <option value="mcq">Quiz</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium">Count:</span>
                                <input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} className="w-16 bg-white rounded-md px-3 py-1.5 border border-slate-300 focus:outline-none"/>
                            </div>
                        </div>
                        <button onClick={handleGenerate} disabled={isGenerating} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm">
                            {isGenerating ? <RotateCw className="animate-spin" size={18}/> : <Sparkles size={18}/>} {isGenerating ? statusMessage : "Generate"}
                        </button>
                    </div>
                </div>
                {/* Stats block */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Brain size={18}/> Stats</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex flex-col items-center justify-center text-center relative group">
                                <button onClick={() => clearContent('flashcards')} className="absolute top-2 right-2 text-indigo-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"><Trash2 size={14}/></button>
                                <div className="text-3xl font-bold text-indigo-600 mb-1">{deck.cards?.length || 0}</div>
                                <div className="text-xs text-indigo-400 font-bold uppercase">Cards</div>
                            </div>
                            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 flex flex-col items-center justify-center text-center relative group">
                                <button onClick={() => clearContent('quiz')} className="absolute top-2 right-2 text-emerald-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"><Trash2 size={14}/></button>
                                <div className="text-3xl font-bold text-emerald-600 mb-1">{deck.quiz?.length || 0}</div>
                                <div className="text-xs text-emerald-400 font-bold uppercase">Quiz</div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <button onClick={() => onUpdateDeck({...deck, mode: 'flashcards'})} disabled={!deck.cards?.length} className="group w-full bg-white border border-slate-200 hover:border-indigo-500 hover:shadow-md p-4 rounded-xl text-left transition disabled:opacity-50">
                            <div className="flex items-center justify-between mb-1"><span className="font-bold text-slate-800 group-hover:text-indigo-600">Study Flashcards</span><BookOpen size={20} className="text-indigo-500"/></div>
                            <p className="text-sm text-slate-500">Review terms.</p>
                        </button>
                        <button onClick={() => onUpdateDeck({...deck, mode: 'quiz'})} disabled={!deck.quiz?.length} className="group w-full bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-md p-4 rounded-xl text-left transition disabled:opacity-50">
                            <div className="flex items-center justify-between mb-1"><span className="font-bold text-slate-800 group-hover:text-emerald-600">Practice Quiz</span><Brain size={20} className="text-emerald-500"/></div>
                            <p className="text-sm text-slate-500">Test retention.</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FlashcardStudy = ({ cards, onBack, apiKey }) => {
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [aiHelp, setAiHelp] = useState(null);
    const [loadingHelp, setLoadingHelp] = useState(false);
    const card = cards[idx];

    const next = useCallback(() => { setFlipped(false); setAiHelp(null); setIdx((prev) => (prev + 1) % cards.length); }, [cards.length]);
    const prev = useCallback(() => { setFlipped(false); setAiHelp(null); setIdx((prev) => (prev - 1 + cards.length) % cards.length); }, [cards.length]);

    useEffect(() => {
        const h = (e) => { if (e.code === 'Space') { e.preventDefault(); setFlipped(p=>!p); } else if (e.code === 'ArrowRight') next(); else if (e.code === 'ArrowLeft') prev(); };
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    }, [next, prev]);

    const getHelp = async (type) => {
        if (loadingHelp) return;
        
        setLoadingHelp(true);
        try {
            const res = await generateContent(apiKey, `Provide a ${type} for: Q: ${card.q}, A: ${card.a}. Return JSON: {"text": "..."}`, "");
            setAiHelp(res.text);
        } catch(e) { alert("AI Error"); }
        finally { setLoadingHelp(false); }
    };

    return (
        <div className="h-full flex flex-col p-6 max-w-4xl mx-auto w-full">
            <button onClick={onBack} className="self-start mb-4 flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Back</button>
            <div className="flex-1 flex flex-col items-center justify-center relative perspective-1000">
                <button onClick={prev} className="absolute left-0 p-3 bg-white rounded-full shadow hover:scale-110 transition z-10"><ChevronLeft/></button>
                <button onClick={next} className="absolute right-0 p-3 bg-white rounded-full shadow hover:scale-110 transition z-10"><ChevronRight/></button>
                <div className="w-full max-w-2xl h-96 relative cursor-pointer" onClick={() => setFlipped(!flipped)}>
                    <div className="w-full h-full relative shadow-2xl rounded-2xl" style={{ transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="absolute w-full h-full bg-white rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 border" style={{ backfaceVisibility: 'hidden' }}>
                            <div className="text-2xl font-medium text-center"><FormattedText text={card.q}/></div>
                            <div className="absolute bottom-6 text-slate-400 text-sm animate-pulse">Click to Flip</div>
                        </div>
                        <div className="absolute w-full h-full bg-indigo-600 rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <div className="text-xl font-medium text-center overflow-y-auto max-h-full custom-scroll"><FormattedText text={card.a}/></div>
                            <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
                                <button 
                                    onClick={() => getHelp('simplify')} 
                                    disabled={loadingHelp}
                                    className="px-3 py-1 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-wait rounded-full text-xs font-bold border border-white/10 flex items-center gap-1"
                                >
                                    {loadingHelp ? <RotateCw className="animate-spin" size={12}/> : null} Simplify
                                </button>
                                <button 
                                    onClick={() => getHelp('mnemonic')} 
                                    disabled={loadingHelp}
                                    className="px-3 py-1 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-wait rounded-full text-xs font-bold border border-white/10 flex items-center gap-1"
                                >
                                    {loadingHelp ? <RotateCw className="animate-spin" size={12}/> : null} Mnemonic
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                {aiHelp && <div className="mt-6 bg-white p-4 rounded-lg shadow border border-indigo-100 max-w-xl w-full text-sm text-slate-700 animate-fade-in"><strong className="text-indigo-600 block mb-1">AI Helper:</strong> <FormattedText text={aiHelp}/></div>}
                <div className="mt-8 text-slate-400 font-medium">Card {idx + 1} / {cards.length}</div>
            </div>
        </div>
    );
};

const QuizMode = ({ questions, onBack }) => {
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const score = Object.keys(answers).reduce((acc, key) => acc + (answers[key] === questions[key].a ? 1 : 0), 0);

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex justify-between mb-8 sticky top-0 bg-[#f8fafc] py-4 z-10 border-b">
                <button onClick={onBack} className="flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Exit</button>
                {submitted && <div className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold">Score: {score} / {questions.length}</div>}
            </div>
            <div className="space-y-8 pb-12">
                {questions.map((q, idx) => {
                    const sel = answers[idx];
                    const correct = q.a === idx;
                    let status = "bg-white border-slate-200";
                    if (submitted) status = (sel === q.a) ? "bg-emerald-50 border-emerald-200" : (sel !== undefined ? "bg-red-50 border-red-200" : status);
                    
                    return (
                        <div key={idx} className={`p-6 rounded-xl border shadow-sm ${status}`}>
                            <div className="font-medium text-lg mb-4 flex gap-3"><span className="text-slate-400 font-bold">{idx + 1}.</span><FormattedText text={q.q}/></div>
                            <div className="space-y-2 pl-6">
                                {q.options.map((opt, oIdx) => (
                                    <button key={oIdx} disabled={submitted} onClick={() => setAnswers({...answers, [idx]: oIdx})} className={`w-full text-left p-3 rounded-lg border transition flex gap-3 ${submitted ? (oIdx === q.a ? "bg-emerald-100 border-emerald-300 font-bold" : (sel === oIdx ? "bg-red-100 border-red-300" : "opacity-60")) : (sel === oIdx ? "bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400" : "hover:bg-slate-50")}`}>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${sel === oIdx ? 'border-current' : 'border-slate-300'}`}>{sel === oIdx && <div className="w-2.5 h-2.5 rounded-full bg-current"></div>}</div>
                                        <FormattedText text={opt}/>
                                    </button>
                                ))}
                            </div>
                            {submitted && <div className="mt-4 ml-6 p-3 text-sm bg-white/50 rounded border text-slate-600"><strong>Explanation:</strong> <FormattedText text={q.exp}/></div>}
                        </div>
                    );
                })}
            </div>
            {!submitted && <div className="sticky bottom-6 flex justify-center"><button onClick={() => setSubmitted(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-xl transition hover:-translate-y-1">Submit Quiz</button></div>}
        </div>
    );
};

export default function App() {
    const [user, setUser] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    
    // Data State (Now synced with Firestore)
    const [folders, setFolders] = useState([]);
    const [decks, setDecks] = useState([]);
    const [userProfile, setUserProfile] = useState({ age: '', degree: '' });
    const [apiKey, setApiKey] = useState('');
    
    const [viewMode, setViewMode] = useState('deck'); 
    const [activeId, setActiveId] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    // Auth Listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    // Firestore Listeners (Run only when logged in)
    useEffect(() => {
        if (!user) return;

        // Sync Folders
        const qFolders = query(collection(db, `users/${user.uid}/folders`), orderBy('createdAt', 'desc'));
        const unsubFolders = onSnapshot(qFolders, (snapshot) => {
            setFolders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Sync Decks
        const qDecks = query(collection(db, `users/${user.uid}/decks`), orderBy('createdAt', 'desc'));
        const unsubDecks = onSnapshot(qDecks, (snapshot) => {
            setDecks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Sync Settings/Profile
        const profileRef = doc(db, `users/${user.uid}/settings`, 'profile');
        getDoc(profileRef).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setUserProfile(data.userProfile || { age: '', degree: '' });
                setApiKey(data.apiKey || '');
            }
        });

        return () => { unsubFolders(); unsubDecks(); };
    }, [user]);

    // Save Settings to Firestore
    const saveSettings = async () => {
        if (!user) return;
        try {
            await setDoc(doc(db, `users/${user.uid}/settings`, 'profile'), {
                userProfile, apiKey
            }, { merge: true });
            setShowSettings(false);
        } catch (e) { alert("Failed to save settings: " + e.message); }
    };

    // Actions (Updated for Firestore)
    const activeDeck = viewMode === 'deck' ? decks.find(d => d.id === activeId) : null;
    const activeFolder = viewMode === 'folder' ? folders.find(f => f.id === activeId) : null;

    const addFolder = async () => {
        const name = prompt("Enter folder name:");
        if (name && user) {
            try {
                await addDoc(collection(db, `users/${user.uid}/folders`), {
                    name, createdAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error adding folder:", error);
                alert("Failed to add folder. Check console for details. (Likely Firestore Permissions)");
            }
        }
    };

    const deleteFolder = async (folderId) => {
        if (!confirm("Delete folder and all contents?")) return;
        await deleteDoc(doc(db, `users/${user.uid}/folders`, folderId));
        const decksToDelete = decks.filter(d => d.folderId === folderId);
        for (const d of decksToDelete) {
            await deleteDoc(doc(db, `users/${user.uid}/decks`, d.id));
        }
        setActiveId(null);
    };

    const addDeck = async (folderId) => {
        if (!user) return;
        const ref = await addDoc(collection(db, `users/${user.uid}/decks`), {
            folderId, title: 'New Module', content: '', notes: '', transcript: '', slides: '',
            cards: [], quiz: [], mode: 'dashboard', createdAt: serverTimestamp()
        });
        setViewMode('deck');
        setActiveId(ref.id);
    };

    const updateDeck = async (updatedDeck) => {
        if (!user) return;
        await updateDoc(doc(db, `users/${user.uid}/decks`, updatedDeck.id), updatedDeck);
    };

    const deleteDeck = async (id) => {
        if(confirm("Delete module?")) {
            await deleteDoc(doc(db, `users/${user.uid}/decks`, id));
            if(activeId === id) setActiveId(null);
        }
    };

    const updateFolder = async (updatedFolder) => {
        await updateDoc(doc(db, `users/${user.uid}/folders`, updatedFolder.id), updatedFolder);
    };

    if (loadingAuth) return <div className="h-screen flex items-center justify-center"><RotateCw className="animate-spin text-indigo-600"/></div>;
    if (!user) return <AuthPage />;

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
            <Sidebar 
                folders={folders} decks={decks} activeId={activeId} viewMode={viewMode}
                onSelectDeck={(id) => { setViewMode('deck'); setActiveId(id); if(decks.find(d=>d.id===id)) updateDeck({...decks.find(d=>d.id===id), mode: 'dashboard'}); }}
                onSelectFolder={(id) => { setViewMode('folder'); setActiveId(id); }}
                onAddFolder={addFolder} onDeleteFolder={deleteFolder} onAddDeck={addDeck} onDeleteDeck={deleteDeck}
                onSettings={() => setShowSettings(true)}
            />
            <main className="flex-1 overflow-y-auto custom-scroll relative bg-[#f8fafc]">
                {viewMode === 'folder' && activeFolder && <FolderDashboard folder={activeFolder} decks={decks.filter(d => d.folderId === activeFolder.id)} onUpdateFolder={updateFolder} apiKey={apiKey} />}
                {viewMode === 'deck' && activeDeck && (
                    <>
                        {activeDeck.mode === 'dashboard' && <ModuleDashboard deck={activeDeck} onUpdateDeck={updateDeck} apiKey={apiKey} userProfile={userProfile} />}
                        {activeDeck.mode === 'flashcards' && <FlashcardStudy cards={activeDeck.cards} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} apiKey={apiKey} />}
                        {activeDeck.mode === 'quiz' && <QuizMode questions={activeDeck.quiz} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} />}
                    </>
                )}
                {!activeDeck && !activeFolder && <div className="flex h-full items-center justify-center text-slate-400"><BookOpen size={48} className="opacity-50"/></div>}
            </main>
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
                            <button onClick={saveSettings} className="w-full bg-indigo-600 text-white font-bold py-2 rounded">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}