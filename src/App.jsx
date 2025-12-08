import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
    BookOpen, Brain, ChevronLeft, ChevronRight, Settings, 
    Plus, Trash2, GraduationCap, FileText, Sparkles, 
    RotateCw, CheckCircle, XCircle, Folder, ChevronDown,
    Mic, Presentation, BookOpenText, PieChart, AlertCircle,
    LayoutDashboard, Image as ImageIcon, X, FileType, LogOut, Lock, Mail, Edit3, Edit2,
    Clock, Layers, Zap, Tag, Hash, Timer, Award, FileQuestion, PenTool, CheckSquare, Sliders, Check
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
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.log("Firebase init skipped (local mode)");
}

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
        if (!item) return null;

        if (type === 'flashcards') {
            return {
                id: item.id || Math.random().toString(36).substr(2, 9),
                q: String(item.q || "Error: Question missing"),
                a: String(item.a || "Error: Answer missing"),
                nextReview: item.nextReview || null,
                ease: item.ease || 2.5,
                interval: item.interval || 0,
                step: item.step || 0
            };
        }
        if (type === 'mcq' || type === 'exam') {
            let options = item.options;
            if (!options || !Array.isArray(options)) options = ["True", "False"]; 
            options = options.map(opt => String(opt));
            
            return {
                type: 'mcq',
                q: String(item.q || "Error: Question missing"),
                options: options,
                a: (typeof item.a === 'number' && item.a < options.length) ? item.a : 0, 
                exp: String(item.exp || "No explanation provided.")
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

// --- NUCLEAR JSON PARSER ---
const cleanAndParseJSON = (text) => {
    if (!text) return null;
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
        console.error("JSON Parse Error:", e);
        return null;
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
        if (typeof str === 'object') return JSON.stringify(str);
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

// --- GEMINI AI SERVICE (Refactored to use Vercel Proxy) ---
const generateContent = async (prompt, context, systemInstruction, attachmentData = null, quantity = 1) => {
    // The apiKey check is now removed from the client side.
    
    // Define the client-side proxy endpoint
    const PROXY_URL = `/api/generate-ai-content`; 
    
    const fullSystemPrompt = `
        You are KonDeck, an advanced AI tutor.
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

    const requestBody = {
        contents: [{ parts: contentsPart }],
        system_instruction: { parts: [{ text: fullSystemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json"
        }
    };
    
    // The key is now handled by the proxy function on the server
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(PROXY_URL, { // Use the proxy URL
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody) // Send the full request body
            });

            if (response.status === 429) {
                throw new Error("Quota Exceeded. Too many requests. Please wait a moment or check your Google Cloud billing.");
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`AI Request Proxy Error: ${errorData.error || response.statusText}`);
            }
            
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
const AuthPage = ({ onAuthSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');


    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            let userCredential;
            if (isLogin) {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                // Create a user document in Firestore upon signup
                const userDocRef = doc(db, "users", userCredential.user.uid);
                await setDoc(userDocRef, {
                    folders: [{ id: 1, name: 'General' }],
                    decks: [{ id: 101, folderId: 1, title: 'Example Module', content: 'Welcome! Add notes here.', notes: 'Welcome! Add notes here.' }],
                    subscription: {
                        tier: 'free',
                        credits: 180
                    },
                    profile: { age: '', degree: '' },
                    createdAt: serverTimestamp()
                });
            }
            onAuthSuccess(userCredential.user);
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''));
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center bg-slate-100">
            <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-xl">
                <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">KonDeck</h2>
                <p className="text-center text-slate-500 mb-6">{isLogin ? 'Welcome back!' : 'Create your account'}</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" required />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" required />
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <button type="submit" className="w-full p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">{isLogin ? 'Log In' : 'Sign Up'}</button>
                </form>
                <p className="text-center text-sm text-slate-500 mt-6">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-bold text-indigo-600 hover:underline ml-1">
                        {isLogin ? 'Sign Up' : 'Log In'}
                    </button>
                </p>
            </div>
        </div>
    );
};

// --- MODALS ---
const NameModal = ({ isOpen, type, initialValue, onClose, onSave }) => {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef(null);
    useEffect(() => { if (isOpen) { setValue(initialValue); setTimeout(() => inputRef.current?.focus(), 100); } }, [isOpen, initialValue]);
    if (!isOpen) return null;
    const handleSubmit = (e) => { e.preventDefault(); if (value.trim()) onSave(value.trim()); };
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="font-bold text-lg text-slate-800 mb-4">{type === 'create' ? 'New Folder' : 'Rename Folder'}</h3>
                <form onSubmit={handleSubmit}>
                    <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-4 text-slate-800" placeholder="Folder Name"/>
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition text-sm font-bold">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ManageModal = ({ type, items, onClose, onDeleteItem, onDeleteAll }) => {
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        {type === 'flashcards' ? <BookOpen className="text-indigo-500"/> : (type === 'saq' ? <PenTool className="text-purple-500"/> : <Brain className="text-emerald-500"/>)}
                        Manage {type === 'flashcards' ? 'Flashcards' : (type === 'saq' ? 'SAQs' : 'Quiz Questions')}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X size={24}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scroll">
                    {items.length === 0 ? <div className="text-center text-slate-400 py-12">No items to show.</div> : (
                        <div className="space-y-2">
                            {items.map((item, i) => {
                                const status = type === 'flashcards' ? getCardStatus(item) : null;
                                return (
                                    <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-slate-300 transition">
                                        <div className="flex flex-col items-center gap-1 mt-1">
                                            <span className="text-xs font-bold text-slate-400">{i + 1}.</span>
                                            {type === 'flashcards' && item.nextReview && <div className={`w-2 h-2 rounded-full ${getCardStatus(item).color.replace('text-', 'bg-').split(' ')[0]}`} title={getCardStatus(item).label}></div>}
                                        </div>
                                        <div className="flex-1 text-sm text-slate-700">
                                            <div className="font-medium mb-1 flex items-center gap-2"><FormattedText text={item.q} /></div>
                                            <div className="text-xs text-slate-500 line-clamp-1 opacity-70">
                                                {type === 'flashcards' ? <FormattedText text={item.a} /> : (type === 'saq' ? 'Model Answer Provided' : 'Multiple Choice')}
                                            </div>
                                        </div>
                                        <button onClick={() => onDeleteItem(i)} className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition" title="Delete Item"><Trash2 size={16}/></button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t bg-slate-50 rounded-b-xl flex justify-between items-center">
                    <span className="text-xs text-slate-500">{items.length} items total</span>
                    <button onClick={onDeleteAll} className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-lg transition"><Trash2 size={16}/> Delete All</button>
                </div>
            </div>
        </div>
    );
};

const ExamSetupModal = ({ modules, onClose, onStartExam }) => {
    const [selectedModuleIds, setSelectedModuleIds] = useState(modules.map(m => m.id)); 
    const [totalMarks, setTotalMarks] = useState(100);
    const [mcqPercentage, setMcqPercentage] = useState(50);
    const [timeLimit, setTimeLimit] = useState(120);

    const saqPercentage = 100 - mcqPercentage;
    const mcqMarks = Math.floor(totalMarks * (mcqPercentage / 100));
    const saqMarks = totalMarks - mcqMarks;
    const numMCQs = mcqMarks;
    const numSAQs = saqMarks > 0 ? Math.max(1, Math.round(saqMarks / 5)) : 0;

    const toggleModule = (id) => {
        setSelectedModuleIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };

    const handleStart = () => {
        if (selectedModuleIds.length === 0) return alert("Select at least one module.");
        onStartExam({
            moduleIds: selectedModuleIds,
            numMCQs,
            numSAQs,
            timeLimit
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2">
                    <FileQuestion className="text-red-500"/> Exam Configuration
                </h3>
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total Marks</label>
                            <input type="number" value={totalMarks} onChange={(e) => setTotalMarks(Number(e.target.value))} className="w-full p-2 border rounded-lg font-mono"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Time (Mins)</label>
                            <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} className="w-full p-2 border rounded-lg font-mono"/>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm font-medium mb-2">
                            <span className="text-emerald-600">{mcqPercentage}% MCQ ({numMCQs} Qs)</span>
                            <span className="text-purple-600">{saqPercentage}% SAQ (~{numSAQs} Qs)</span>
                        </div>
                        <input type="range" min="0" max="100" step="10" value={mcqPercentage} onChange={(e) => setMcqPercentage(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Include Modules</label>
                        <div className="max-h-40 overflow-y-auto border rounded-lg custom-scroll">
                            {modules.map(m => (
                                <div key={m.id} onClick={() => toggleModule(m.id)} className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer hover:bg-slate-50 ${selectedModuleIds.includes(m.id) ? 'bg-indigo-50' : ''}`}>
                                    <span className="text-sm font-medium text-slate-700 truncate pr-2">{m.title}</span>
                                    {selectedModuleIds.includes(m.id) && <CheckCircle size={16} className="text-indigo-600 shrink-0"/>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm">Cancel</button>
                        <button onClick={handleStart} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm font-bold flex items-center gap-2">Start Exam</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- EXAM RUNNER ---
const ExamRunner = ({ questions, timeLimit, onBack }) => {
    const [answers, setAnswers] = useState({});
    const [saqFeedback, setSaqFeedback] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(timeLimit ? timeLimit * 60 : 600); 
    const [gradingLoading, setGradingLoading] = useState({});

    useEffect(() => {
        if (!submitted && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(p => p - 1), 1000);
            return () => clearInterval(timer);
        } else if (timeLeft === 0 && !submitted) {
            setSubmitted(true);
        }
    }, [submitted, timeLeft]);

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const mcqQuestions = questions.filter(q => q.type !== 'saq');
    const mcqCount = mcqQuestions.length;
    const mcqScore = mcqQuestions.reduce((acc, q) => {
        const idx = questions.indexOf(q);
        if (answers[idx] === q.a) return acc + 1;
        return acc;
    }, 0);

    const gradeSAQ = async (index, userProfile) => {
        if (userProfile.subscription?.tier !== 'pro') {
            alert("AI Grading is a Pro feature. Please upgrade to use it.");
            return;
        }
        setGradingLoading(prev => ({ ...prev, [index]: true }));
        try {
            const q = questions[index];
            const userAns = answers[index] || "No answer provided.";
            const marks = q.marks || 5;
            const prompt = `Grade this SAQ out of ${marks}. Question: "${q.q}". Model: "${q.model}". Student: "${userAns}". Return JSON: { "score": number, "feedback": "string", "missing": "string" }`; // Note: This is a placeholder for the actual prompt
            const result = await generateContent(prompt, "", "");
            setSaqFeedback(prev => ({ ...prev, [index]: result }));
        } catch (e) { alert(e.message); } 
        finally { setGradingLoading(prev => ({ ...prev, [index]: false })); }
    };

    return (
        <div className="max-w-4xl mx-auto p-6" userProfile={userProfile}>
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-[#f8fafc] py-4 z-10 border-b">
                <button onClick={onBack} className="flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Exit</button>
                {!submitted ? (
                    <div className={`font-mono font-bold text-xl flex items-center gap-2 ${timeLeft < 300 ? 'text-red-600 animate-pulse' : 'text-slate-700'}`}>
                        <Clock size={20}/> {formatTime(timeLeft)}
                    </div>
                ) : (
                    <div className="font-bold text-xl text-slate-800">Exam Finished</div>
                )}
            </div>

            {submitted && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">MCQ Results</h2>
                        <p className="text-slate-500">You scored {mcqScore} / {mcqCount} on multiple choice.</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase">SAQ Review</div>
                        <p className="text-slate-500 text-sm">Scroll down to self-mark or AI-grade your written answers.</p>
                    </div>
                </div>
            )}

            <div className="space-y-8 pb-20">
                {questions.map((q, idx) => {
                    const isSAQ = q.type === 'saq';
                    return (
                        <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex gap-3 mb-4">
                                <span className="font-bold text-slate-400">{idx + 1}.</span>
                                <div className="flex-1">
                                    <div className="font-medium text-lg text-slate-800">
                                        <FormattedText text={`${q.q} ${isSAQ ? `(${q.marks || 5} marks)` : ''}`}/>
                                    </div>
                                    {isSAQ && <span className="inline-block mt-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">Short Answer</span>}
                                </div>
                            </div>
                            {isSAQ ? (
                                <div className="pl-6">
                                    <textarea 
                                        className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="Type your answer..."
                                        value={answers[idx] || ""}
                                        onChange={(e) => setAnswers({...answers, [idx]: e.target.value})}
                                        disabled={submitted}
                                    />
                                    {submitted && (
                                        <div className="mt-4 space-y-4">
                                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Model Answer</div>
                                                <div className="text-sm text-slate-700"><FormattedText text={q.model}/></div>
                                            </div>
                                            {!saqFeedback[idx] ? (
                                                <button onClick={() => gradeSAQ(idx, userProfile)} disabled={gradingLoading[idx] || userProfile.subscription?.tier !== 'pro'} className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                                    {gradingLoading[idx] ? <RotateCw className="animate-spin" size={14}/> : <Sparkles size={14}/>} Grade with AI
                                                </button>
                                            ) : (
                                                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-fade-in">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="font-bold text-purple-800">AI Feedback</span>
                                                        <span className="bg-white px-2 py-1 rounded text-xs font-bold text-purple-600 border border-purple-200">Score: {saqFeedback[idx].score}/{q.marks || 5}</span>
                                                    </div>
                                                    <div className="text-sm text-purple-900 mb-2"><FormattedText text={saqFeedback[idx].feedback}/></div>
                                                    {saqFeedback[idx].missing && <div className="text-xs text-red-600 mt-2 pt-2 border-t border-purple-100"><strong>Missing:</strong> <FormattedText text={saqFeedback[idx].missing}/></div>}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="pl-6 space-y-2">
                                    {q.options.map((opt, oIdx) => {
                                        const isSelected = answers[idx] === oIdx;
                                        let btnClass = "w-full text-left p-3 rounded-lg border transition flex gap-3 ";
                                        if (submitted) {
                                            if (oIdx === q.a) btnClass += "bg-emerald-100 border-emerald-300 font-bold text-emerald-800";
                                            else if (isSelected) btnClass += "bg-red-100 border-red-300 text-red-800";
                                            else btnClass += "opacity-50";
                                        } else {
                                            btnClass += isSelected ? "bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400" : "hover:bg-slate-50";
                                        }
                                        return (
                                            <button key={oIdx} onClick={() => !submitted && setAnswers({...answers, [idx]: oIdx})} className={btnClass}>
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-current' : 'border-slate-300'}`}>{isSelected && <div className="w-2.5 h-2.5 rounded-full bg-current"></div>}</div>
                                                <FormattedText text={opt}/>
                                            </button>
                                        )
                                    })}
                                    {submitted && <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600"><strong>Explanation:</strong> <FormattedText text={q.exp}/></div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {!submitted && <div className="sticky bottom-6 flex justify-center"><button onClick={() => setSubmitted(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full shadow-xl transition hover:-translate-y-1">Submit Exam</button></div>}
        </div>
    );
};

// --- SAQ MODE ---
const SAQMode = ({ questions, onBack, userProfile }) => {
    const [idx, setIdx] = useState(0);
    const [userAnswer, setUserAnswer] = useState("");
    const [grading, setGrading] = useState(false);
    const [feedback, setFeedback] = useState(null); 

    const question = questions[idx];
    const isPro = userProfile.subscription?.tier === 'pro';
    const handleProClick = () => {
        if (!isPro) alert("AI Grading is a Pro feature. Please upgrade to unlock.");
    };

    const handleGrade = async () => {
        if (!userAnswer.trim()) return alert("Please type an answer first.");

        setGrading(true);
        const marks = question.marks || 5;
        try {
            const prompt = `
                Act as a strict university professor. 
                QUESTION: "${question.q}" (Worth ${marks} marks)
                MODEL ANSWER: "${question.model}"
                STUDENT ANSWER: "${userAnswer}"
                
                TASK: Grade the student answer out of ${marks}. Be critical but constructive.
                RETURN JSON: { "score": number, "feedback": "Specific feedback", "missing": "Concepts missed" }
            `;
            const result = await generateContent(prompt, "", "");
            setFeedback(result);
        } catch (e) { alert(e.message); } finally { setGrading(false); }
    };

    const nextQuestion = () => { setFeedback(null); setUserAnswer(""); setIdx(prev => (prev + 1) % questions.length); };

    return (
        <div className="max-w-4xl mx-auto p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onBack} className="flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Exit SAQ</button>
                <div className="text-sm font-bold text-slate-400">Question {idx + 1} of {questions.length}</div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Question</h3>
                    <div className="text-xl font-medium text-slate-800"><FormattedText text={`${question.q} (${question.marks || 5} marks)`}/></div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                    <textarea 
                        className="w-full h-40 p-4 bg-slate-50 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none text-sm leading-relaxed"
                        placeholder="Type your answer here..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        disabled={!!feedback}
                    ></textarea>
                    {!feedback && (
                        <div className="mt-4 flex justify-end">
                            <button onClick={isPro ? handleGrade : handleProClick} disabled={grading} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition flex items-center gap-2 disabled:opacity-70">
                                {grading ? <RotateCw className="animate-spin" size={18}/> : (isPro ? <CheckSquare size={18}/> : <Lock size={18}/>)} {grading ? "Grading..." : (isPro ? "Submit Answer" : "AI Grade (Pro)")}
                            </button>
                        </div>
                    )}
                </div>
                {feedback && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-indigo-100 animate-fade-in-up mb-20">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Sparkles className="text-indigo-500" size={20}/> AI Grading</h3>
                            <div className={`px-4 py-1 rounded-full text-sm font-bold ${feedback.score >= (question.marks || 5)*0.7 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>Score: {feedback.score}/{question.marks || 5}</div>
                        </div>
                        <div className="space-y-4">
                            <div><h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Feedback</h4><p className="text-sm text-slate-700 leading-relaxed"><FormattedText text={feedback.feedback}/></p></div>
                            {feedback.missing && <div className="bg-red-50 p-3 rounded-lg border border-red-100"><h4 className="text-xs font-bold text-red-500 uppercase mb-1">Missing Concepts</h4><p className="text-sm text-red-700"><FormattedText text={feedback.missing}/></p></div>}
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Model Answer</h4><p className="text-sm text-slate-600 italic"><FormattedText text={question.model}/></p></div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end"><button onClick={nextQuestion} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition flex items-center gap-2">Next Question <ChevronRight size={16}/></button></div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- FLASHCARD STUDY COMPONENT ---
const FlashcardStudy = ({ cards, onBack, onUpdateDeck, deck }) => {
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
        if (cardIndex !== undefined) { updatedCards[cardIndex] = { ...cards[cardIndex], nextReview }; onUpdateDeck({ ...deck, cards: updatedCards }); }
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
        try { const res = await generateContent(`Provide a ${type} for: Q: ${currentCard.q}, A: ${currentCard.a}. Return JSON: {"text": "..."}`, ""); setAiHelp(res.text); } 
        catch(e) { alert("AI Error"); } finally { setLoadingHelp(false); }
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
                <div className="w-full max-w-2xl h-96 relative cursor-pointer" onClick={() => setFlipped(!flipped)}>
                    <div className="w-full h-full relative shadow-2xl rounded-2xl" style={{ transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="absolute w-full h-full bg-white rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 border" style={{ backfaceVisibility: 'hidden' }}>
                            <span className={`absolute top-6 right-6 px-3 py-1 rounded-full text-xs font-bold border ${status.color}`}>{status.label}</span>
                            <div className="text-2xl font-medium text-center"><FormattedText text={currentCard.q}/></div>
                            <div className="absolute bottom-6 text-slate-400 text-sm animate-pulse">Click to Flip</div>
                        </div>
                        <div className="absolute w-full h-full bg-indigo-600 rounded-2xl backface-hidden flex flex-col items-center justify-center p-8 text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <div className="text-xl font-medium text-center overflow-y-auto max-h-full custom-scroll"><FormattedText text={currentCard.a}/></div>
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

// --- SIDEBAR COMPONENT ---
const Sidebar = ({ user, folders, decks, activeId, viewMode, onSelectDeck, onSelectFolder, onAddFolder, onDeleteFolder, onRenameFolder, onAddDeck, onDeleteDeck, onSettings }) => {
    const [expandedFolders, setExpandedFolders] = useState({});
    const toggleFolder = (folderId) => setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
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
                <h1 className="font-bold text-lg flex items-center gap-2 truncate"><GraduationCap className="text-indigo-400 flex-shrink-0" /> <span className="truncate">{user?.email || 'Guest'}</span></h1>
                <button onClick={onSettings} className="hover:text-indigo-400 transition"><Settings size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
                {folders.map(folder => (
                    <div key={folder.id}>
                        <div className="flex items-center justify-between group mb-2 select-none">
                            <div className="flex items-center gap-2 cursor-pointer hover:text-indigo-300 transition-colors flex-1 overflow-hidden" onClick={() => toggleFolder(folder.id)}>
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
                                <div onClick={() => onSelectFolder(folder.id)} className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all mb-1 ${viewMode === 'folder' && activeId === folder.id ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                    <PieChart size={14} />
                                    <div className="truncate text-xs font-medium">Course Overview</div>
                                </div>
                                {decks.filter(d => d.folderId === folder.id).map(deck => (
                                    <div key={deck.id} onClick={() => onSelectDeck(deck.id)} className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all ${viewMode === 'deck' && activeId === deck.id ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
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

const ModuleDashboard = ({ deck, onUpdateDeck, userProfile, onUpdateProfile }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [genType, setGenType] = useState("flashcards");
    const [count, setCount] = useState(10);
    const [activeTab, setActiveTab] = useState('notes');
    const fileInputRef = useRef(null);
    const [attachment, setAttachment] = useState(null);
    const [manageMode, setManageMode] = useState(null); 
    const [showExamSetup, setShowExamSetup] = useState(false); 
    const [activeExamData, setActiveExamData] = useState(null);
    const [examTimeLimit, setExamTimeLimit] = useState(0);

    const [inputs, setInputs] = useState({ notes: "", transcript: "", slides: "" });

    const estimateCost = useCallback(() => {
        const textLength = (inputs.notes?.length || 0) + (inputs.transcript?.length || 0) + (inputs.slides?.length || 0);
        const baseCost = Math.ceil(textLength / 1000); // 1 credit per 1000 chars
        const multiplier = genType === 'flashcards' ? 1 : 1.5; // MCQs/SAQs are more complex
        const finalCost = Math.ceil(baseCost + (count * multiplier));
        return finalCost;
    }, [inputs, count, genType]);

    useEffect(() => {
        setInputs({ notes: deck.notes || deck.content || "", transcript: deck.transcript || "", slides: deck.slides || "" });
        setAttachment(null); 
    }, [deck.id]);

    const handleInputChange = (field, value) => {
        const newInputs = { ...inputs, [field]: value };
        setInputs(newInputs);
        onUpdateDeck({ ...deck, ...newInputs });
    };

    const handleDeleteItem = (index) => {
        const key = manageMode === 'flashcards' ? 'cards' : (manageMode === 'quiz' ? 'quiz' : (manageMode === 'saq' ? 'saqs' : 'exams'));
        const newItems = [...(deck[key] || [])];
        newItems.splice(index, 1);
        onUpdateDeck({ ...deck, [key]: newItems });
    };

    const handleDeleteAll = () => {
        const key = manageMode === 'flashcards' ? 'cards' : (manageMode === 'quiz' ? 'quiz' : (manageMode === 'saq' ? 'saqs' : 'exams'));
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

    const toggleStudyMode = (mode) => { onUpdateDeck({ ...deck, studyMode: mode }); };

    const handleGenerate = async (type) => {
        const hasText = inputs.notes.trim() || inputs.transcript.trim() || inputs.slides.trim();
        const hasAttachment = !!attachment;
        if (!hasText && !hasAttachment) return alert("Please add text or a file.");

        const cost = estimateCost();
        if (userProfile.subscription.credits < cost) {
            return alert(`Not enough credits. This action costs ${cost} credits, but you only have ${userProfile.subscription.credits}. Please upgrade or wait for your credits to refresh.`);
        }
        if (!confirm(`This will use an estimated ${cost} credits. Proceed?`)) return;

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
            const targetKey = type === 'flashcards' ? 'cards' : (type === 'exam' ? 'exams' : (type === 'saq' ? 'saqs' : 'quiz'));
            for (let i = 0; i < totalBatches; i++) {
                setStatusMessage(`Generating batch ${i + 1} of ${totalBatches}...`);
                if (i > 0) await sleep(1000);
                const itemsRemaining = count - accumulatedResults.length;
                const currentBatchCount = Math.min(BATCH_SIZE, itemsRemaining);
                let prompt = "";
                if (type === "flashcards") { prompt = `Generate ${currentBatchCount} flashcards (JSON: [{"q":..., "a":...}]).`; } 
                else if (type === "saq") { prompt = `Generate ${currentBatchCount} Short Answer Questions (SAQ) testing deep understanding. Assign a mark value (2-7). JSON: [{"q": "...", "model": "...", "marks": 5}].`; } 
                else { prompt = `Generate ${currentBatchCount} multiple choice questions (JSON: [{"q":..., "options":..., "a":..., "exp":...}]).`; }
                try {
                    const batchResult = await generateContent(prompt, combinedContext, systemInstruction, attachmentPayload, currentBatchCount);
                    const validatedResult = validateAndFixData(Array.isArray(batchResult) ? batchResult : [batchResult], type === 'exam' ? 'mcq' : type);
                    accumulatedResults = [...accumulatedResults, ...validatedResult];
                } catch (batchError) { console.error(batchError); break; }
            }
            // Step 2: After the loop finishes without error:
            setStatusMessage("Saving...");
            const updatedDeck = { ...deck, ...currentInputs }; 
            updatedDeck[targetKey] = [...(deck[targetKey] || []), ...accumulatedResults];
            onUpdateDeck(updatedDeck);
            
            // DEDUCT CREDITS HERE ONLY IF SUCCESSFUL
            const newCredits = userProfile.subscription.credits - cost;
            onUpdateProfile({ ...userProfile, subscription: { ...userProfile.subscription, credits: newCredits } });

        } catch (error) { 
            alert(error.message); 
        } finally { 
            setIsGenerating(false); setStatusMessage(""); }
    };

    // Live Exam Generation for Module
    const handleStartLiveExam = async ({ moduleIds, numMCQs, numSAQs, timeLimit }) => {
        setIsGenerating(true);
        setStatusMessage("Generating Exam Paper...");
        try {
             const currentInputs = { ...inputs };
             const combinedContext = `MODULE: ${deck.title}\nNOTES: ${currentInputs.notes}\nTRANSCRIPT: ${currentInputs.transcript}\nSLIDES TEXT: ${currentInputs.slides}`;
             let mcqs = [];
             if(numMCQs > 0) {
                 const promptMCQ = `Generate ${numMCQs} HARD, scenario-based multiple choice questions for a FINAL EXAM. JSON: [{"q":..., "options":..., "a":..., "exp":...}]`;
                 const rawMCQ = await generateContent(promptMCQ, combinedContext, "", null, numMCQs);
                 mcqs = validateAndFixData(Array.isArray(rawMCQ) ? rawMCQ : [rawMCQ], 'mcq');
            }
             let saqs = [];
             if(numSAQs > 0) {
                 const promptSAQ = `Generate ${numSAQs} Short Answer Questions (SAQ). Assign marks (2-7). JSON: [{"q":..., "model":..., "marks":5}]`;
                 const rawSAQ = await generateContent(promptSAQ, combinedContext, "", null, numSAQs);
                 saqs = validateAndFixData(Array.isArray(rawSAQ) ? rawSAQ : [rawSAQ], 'saq');
             }
             const finalExam = [...mcqs, ...saqs];
             setExamTimeLimit(timeLimit);
             setActiveExamData(finalExam);
             setShowExamSetup(false);
        } catch(e) { alert(e.message); } finally { setIsGenerating(false); setStatusMessage(""); }
    };
    
    if (activeExamData) { return <ExamRunner questions={activeExamData} timeLimit={examTimeLimit} onBack={() => setActiveExamData(null)} />; }
    if (isGenerating && statusMessage.includes("Exam")) { return (<div className="h-full flex flex-col items-center justify-center"><RotateCw className="animate-spin text-indigo-600 mb-4" size={48} /><h3 className="text-xl font-bold text-slate-800">Generating Exam Paper...</h3><p className="text-slate-500">Creating custom questions for {deck.title}</p></div>) }

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="mb-6"><input value={deck.title} onChange={(e) => onUpdateDeck({...deck, title: e.target.value})} className="text-3xl font-bold bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none w-full pb-2 text-slate-800" placeholder="Module Title"/></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-slate-200 h-[650px] flex flex-col overflow-hidden">
                    <div className="flex border-b border-slate-200 bg-slate-50/50">
                        {['notes', 'transcript', 'slides'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${activeTab === tab ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                                {tab === 'notes' && <FileText size={16}/>} {tab === 'transcript' && <Mic size={16}/>} {tab === 'slides' && <Presentation size={16}/>} {tab}
                                {inputs[tab].length > 0 && <span className={`ml-1 w-2 h-2 rounded-full ${activeTab === tab ? 'bg-indigo-400' : 'bg-slate-300'}`} />}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 relative">
                        <textarea className="w-full h-full p-6 resize-none focus:outline-none focus:bg-slate-50/30 text-sm leading-relaxed font-mono text-slate-700" placeholder={`Paste your ${activeTab} content here...`} value={inputs[activeTab]} onChange={(e) => handleInputChange(activeTab, e.target.value)}></textarea>
                        {attachment && (<div className="absolute bottom-4 right-4 w-32 h-32 bg-white p-2 shadow-lg rounded-lg border border-slate-200 group flex flex-col items-center justify-center text-center">{attachment.type === 'image' ? <img src={attachment.data} alt="Preview" className="w-full h-20 object-cover rounded mb-1"/> : <div className="w-full h-20 flex flex-col items-center justify-center bg-red-50 rounded mb-1 border border-red-100"><FileType size={32} className="text-red-500 mb-1"/><span className="text-[10px] font-bold text-red-700 uppercase">PDF</span></div>}<span className="text-[10px] text-slate-500 truncate w-full px-1">{attachment.type === 'pdf' ? attachment.name : 'Image'}</span><button onClick={() => { setAttachment(null); fileInputRef.current.value = ""; }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition"><X size={12}/></button></div>)}
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div className="flex gap-4 text-sm text-slate-600 items-center">
                            <div className="relative"><input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" className="hidden" /><button onClick={() => fileInputRef.current?.click()} className={`p-2 rounded-lg border transition flex items-center gap-2 ${attachment ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`} title="Upload Slide Image or PDF">{attachment ? (attachment.type === 'pdf' ? <FileType size={18}/> : <ImageIcon size={18}/>) : <Plus size={18}/>} {attachment ? (attachment.type === 'pdf' ? "PDF" : "Image") : "File"}</button></div>
                            <div className="h-6 w-px bg-slate-300 mx-2 hidden sm:block"></div>
                            <div className="flex items-center gap-2"><span className="font-medium text-slate-500">Count:</span><div className="relative flex items-center"><Hash size={14} className="absolute left-2.5 text-slate-400 pointer-events-none"/><input type="number" min="1" max="50" value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20 pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700 font-medium"/></div></div>                            
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button onMouseEnter={() => setGenType('flashcards')} onClick={() => handleGenerate('flashcards')} disabled={isGenerating} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm">{isGenerating && genType==='flashcards' ? <RotateCw className="animate-spin" size={16}/> : <Sparkles size={16}/>} {isGenerating && genType==='flashcards' ? statusMessage : `Cards (~${estimateCost()} Cr)`}</button>
                            <button onMouseEnter={() => setGenType('mcq')} onClick={() => handleGenerate('mcq')} disabled={isGenerating} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm">{isGenerating && genType==='mcq' ? <RotateCw className="animate-spin" size={16}/> : <Brain size={16}/>} {isGenerating && genType==='mcq' ? statusMessage : `Quiz (~${estimateCost()} Cr)`}</button>
                            <button onMouseEnter={() => setGenType('saq')} onClick={() => handleGenerate('saq')} disabled={isGenerating} className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm">{isGenerating && genType==='saq' ? <RotateCw className="animate-spin" size={16}/> : <PenTool size={16}/>} {isGenerating && genType==='saq' ? statusMessage : `SAQ (~${estimateCost()} Cr)`}</button>
                        </div>
                    </div>
                </div>
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
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 flex flex-col items-center justify-center text-center relative group col-span-2">
                                <button onClick={() => setManageMode('saq')} className="absolute top-2 right-2 text-purple-300 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition p-1" title="Manage SAQs"><Edit3 size={14}/></button>
                                <div className="text-3xl font-bold text-purple-600 mb-1">{deck.saqs?.length || 0}</div>
                                <div className="text-xs text-purple-400 font-bold uppercase">SAQs</div>
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
                            <button onClick={() => onUpdateDeck({...deck, mode: 'quiz', quizMode: 'practice'})} disabled={!deck.quiz?.length} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"><Brain size={18}/> Practice Quiz</button>
                            <button onClick={() => onUpdateDeck({...deck, mode: 'saq'})} disabled={!deck.saqs?.length} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"><PenTool size={18}/> Practice SAQs</button>
                        </div>
                    </div>
                </div>
            </div>
            {manageMode && <ManageModal type={manageMode} items={manageMode === 'flashcards' ? (deck.cards || []) : (manageMode === 'quiz' ? (deck.quiz || []) : (manageMode === 'saq' ? (deck.saqs || []) : (deck.exams || [])))} onClose={() => setManageMode(null)} onDeleteItem={handleDeleteItem} onDeleteAll={handleDeleteAll} />}
        </div>
    );
};

// --- FOLDER DASHBOARD (Defined BEFORE ModuleDashboard) ---
const FolderDashboard = ({ folder, decks, onUpdateFolder, onUpdateDeck, userProfile }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [syllabusText, setSyllabusText] = useState(folder.syllabus || "");
    const [isGlobalStudy, setIsGlobalStudy] = useState(false);
    const [globalStudyMode, setGlobalStudyMode] = useState('srs');
    const [globalShuffle, setGlobalShuffle] = useState(true);
    const [showExamSetup, setShowExamSetup] = useState(false);
    const [activeExamData, setActiveExamData] = useState(null); 
    const [examTimeLimit, setExamTimeLimit] = useState(0); 
    const [isExamGenerating, setIsExamGenerating] = useState(false);

    useEffect(() => { setSyllabusText(folder.syllabus || ""); }, [folder.id]);
    const handleSaveSyllabus = () => onUpdateFolder({ ...folder, syllabus: syllabusText }); 

    const handleAnalyze = async () => {
        if (userProfile.subscription?.tier !== 'pro') {
            alert("Syllabus Coverage Analysis is a Pro feature. Please upgrade to use it.");
            return;
        }
        if (!syllabusText.trim()) return alert("Please paste the Course Outline first.");
        setIsAnalyzing(true);
        try {
            const allContent = decks.map(d => `MODULE: ${d.title}\nNOTES: ${d.notes || ''}\nSLIDES: ${d.slides || ''}\nTRANSCRIPT: ${d.transcript || ''}`).join("\n\n----------------\n\n");
            if (!allContent.trim()) return alert("No content found in modules!");
            const prompt = `Analyze 'STUDENT MATERIALS' against 'OFFICIAL SYLLABUS'. Return JSON: {"score": 0-100, "analysis": "summary", "missing": "missing topics"}`;
            const context = `OFFICIAL SYLLABUS:\n${syllabusText}\n\nSTUDENT MATERIALS:\n${allContent}`;
            const result = await generateContent(prompt, context, "", null, 1);
            onUpdateFolder({ ...folder, syllabus: syllabusText, coverage: result });
        } catch (error) { 
            alert(error.message); 
        } finally { setIsAnalyzing(false); }
    };

    const globalCards = decks.flatMap(d => (d.cards || []).map(c => ({...c, _deckId: d.id})));

    const handleGlobalUpdate = (updatedGlobalDeck) => {
        const cardsByDeck = {};
        updatedGlobalDeck.cards.forEach(c => {
            if (c._deckId) { if (!cardsByDeck[c._deckId]) cardsByDeck[c._deckId] = []; cardsByDeck[c._deckId].push(c); }
        });
        Object.keys(cardsByDeck).forEach(deckId => {
            const originalDeck = decks.find(d => d.id === parseInt(deckId) || d.id === deckId);
            if (originalDeck) { onUpdateDeck({ ...originalDeck, cards: cardsByDeck[deckId] }); }
        });
    };

    const handleStartLiveExam = async ({ moduleIds, numMCQs, numSAQs, timeLimit }) => {
        setIsExamGenerating(true);
        try {
            const selectedDecks = decks.filter(d => moduleIds.includes(d.id));
            const combinedContext = selectedDecks.map(d => `MODULE: ${d.title}\n${d.notes}\n${d.transcript}\n${d.slides}`).join("\n\n---\n\n");
            
            let mcqs = [];
            if(numMCQs > 0) {
                 const promptMCQ = `Generate ${numMCQs} HARD, scenario-based multiple choice questions for a FINAL EXAM. JSON: [{"q":..., "options":..., "a":..., "exp":...}]`;
                 const rawMCQ = await generateContent(promptMCQ, combinedContext, "", null, numMCQs);
                 mcqs = validateAndFixData(Array.isArray(rawMCQ) ? rawMCQ : [rawMCQ], 'mcq');
            }

            let saqs = [];
            if(numSAQs > 0) {
                 const promptSAQ = `Generate ${numSAQs} Short Answer Questions (SAQ). Assign marks (2-7). JSON: [{"q":..., "model":..., "marks":5}]`;
                 const rawSAQ = await generateContent(promptSAQ, combinedContext, "", null, numSAQs);
                 saqs = validateAndFixData(Array.isArray(rawSAQ) ? rawSAQ : [rawSAQ], 'saq');
            }
            
            const finalExam = [...mcqs, ...saqs];
            if (finalExam.length === 0) throw new Error("Failed to generate exam questions.");

            setExamTimeLimit(timeLimit);
            setActiveExamData(finalExam);
            setShowExamSetup(false);
        } catch (e) {
            alert(e.message);
        } finally {
            setIsExamGenerating(false);
        }
    };

    if (isGlobalStudy) {
        let finalCards = globalCards;
        if (globalShuffle) {
            finalCards = [...globalCards].sort(() => Math.random() - 0.5);
        }
        const virtualDeck = { id: 'global', title: `${folder.name} (Global)`, studyMode: globalStudyMode, cards: finalCards };
        return <FlashcardStudy cards={finalCards} deck={virtualDeck} onUpdateDeck={handleGlobalUpdate} onBack={() => setIsGlobalStudy(false)} />;
    }

    if (activeExamData) {
         return <ExamRunner questions={activeExamData} timeLimit={examTimeLimit} onBack={() => setActiveExamData(null)} />;
    }
    
    if (isExamGenerating) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <RotateCw className="animate-spin text-indigo-600 mb-4" size={48} />
                <h3 className="text-xl font-bold text-slate-800">Generating Live Exam...</h3>
                <p className="text-slate-500"> analyzing {decks.length} modules to build your paper.</p>
            </div>
        )
    }

    const totalCards = decks.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
    const totalQuestions = decks.reduce((sum, d) => sum + (d.quiz?.length || 0), 0);
    const totalSaqs = decks.reduce((sum, d) => sum + (d.saqs?.length || 0), 0); 
    const totalExams = decks.reduce((sum, d) => sum + (d.exams?.length || 0), 0);

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
                        <textarea className="flex-1 w-full p-4 bg-slate-50 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-mono leading-relaxed" placeholder="Paste course outline here..." value={syllabusText} onChange={(e) => setSyllabusText(e.target.value)} onBlur={handleSaveSyllabus}></textarea>                        <div className="mt-4"><button onClick={handleAnalyze} disabled={isAnalyzing || userProfile.subscription?.tier !== 'pro'} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">{isAnalyzing ? <RotateCw className="animate-spin"/> : (userProfile.subscription?.tier !== 'pro' ? <Lock/> : <PieChart/>)} {isAnalyzing ? "Auditing..." : (userProfile.subscription?.tier !== 'pro' ? "Analyze Coverage (Pro)" : "Analyze Coverage")}</button></div>
                    </div>
                </div>
                <div className="lg:col-span-4 space-y-6 overflow-y-auto">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><CheckCircle size={18} className="text-indigo-500"/> Content Audit</h3>
                        {folder.coverage ? (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-end gap-2"><span className={`text-4xl font-bold ${folder.coverage.score >= 80 ? 'text-emerald-600' : folder.coverage.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{folder.coverage.score}%</span><span className="text-sm text-slate-500 mb-1">Coverage Score</span></div>
                                <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${folder.coverage.score}%` }}></div></div>
                                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-100"><FormattedText text={folder.coverage.analysis}/></div>
                                {folder.coverage.missing && <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700 border border-red-100"><div className="font-bold flex items-center gap-2 mb-1"><AlertCircle size={14}/> Missing:</div><FormattedText text={folder.coverage.missing}/></div>}
                            </div>
                        ) : <div className="text-center text-slate-400 py-8 text-sm">Run analysis to check coverage.</div>}
                    </div>
                    <div className="space-y-3">
                         <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 rounded-xl shadow-md text-white">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Layers/> Global Flashcards</h3>
                            <div className="flex items-center gap-3 mb-4 bg-white/10 p-1 rounded-lg">
                                <button onClick={() => setGlobalStudyMode('standard')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-bold transition ${globalStudyMode === 'standard' ? 'bg-white text-indigo-600 shadow' : 'text-indigo-100 hover:bg-white/10'}`}>Standard</button>
                                <button onClick={() => setGlobalStudyMode('srs')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-bold transition ${globalStudyMode === 'srs' ? 'bg-white text-indigo-600 shadow' : 'text-indigo-100 hover:bg-white/10'}`}>Smart (SRS)</button>
                            </div>
                            <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => setGlobalShuffle(!globalShuffle)}>
                                <div className={`w-5 h-5 rounded flex items-center justify-center border transition ${globalShuffle ? 'bg-white border-white text-indigo-600' : 'border-indigo-200 text-transparent'}`}><Check size={14} strokeWidth={4} /></div>
                                <span className="text-sm font-medium text-indigo-50">Shuffle Cards</span>
                            </div>
                            <button onClick={() => setIsGlobalStudy(true)} disabled={totalCards === 0} className="w-full bg-white text-indigo-600 font-bold py-3 rounded-lg hover:bg-indigo-50 transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"><Zap size={18}/> Start Studying</button>
                        </div>
                        <div className="bg-gradient-to-br from-red-500 to-rose-600 p-6 rounded-xl shadow-md text-white">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><FileQuestion/> Mock Exam</h3>
                            <p className="text-red-100 text-sm mb-4">Generate a fresh exam paper from your modules.</p>
                            <button onClick={() => setShowExamSetup(true)} disabled={decks.length === 0} className="w-full bg-white text-red-600 font-bold py-3 rounded-lg hover:bg-red-50 transition disabled:opacity-70 flex items-center justify-center gap-2"><Timer size={18}/> Build Exam</button>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4">Course Totals</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-slate-800">{decks.length}</div><div className="text-xs text-slate-500 uppercase">Modules</div></div>
                            <div className="bg-indigo-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-indigo-600">{totalCards}</div><div className="text-xs text-indigo-400 uppercase">Cards</div></div>
                            <div className="bg-emerald-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-emerald-600">{totalQuestions}</div><div className="text-xs text-emerald-400 uppercase">Practice</div></div>
                            <div className="bg-purple-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-purple-600">{totalSaqs}</div><div className="text-xs text-purple-400 uppercase">SAQs</div></div>
                        </div>
                    </div>
                </div>
            </div>
            {showExamSetup && <ExamSetupModal modules={decks} onClose={() => setShowExamSetup(false)} onStartExam={handleStartLiveExam} />}
        </div>
    );
};

// --- APP MAIN ---
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [folders, setFolders] = useState([]);
    const [decks, setDecks] = useState([]); // This holds all module data
    const [userProfile, setUserProfile] = useState({ age: '', degree: '' });
    const [viewMode, setViewMode] = useState('deck'); 
    const [activeId, setActiveId] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [nameModal, setNameModal] = useState({ isOpen: false, type: '', folder: null, value: '' });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) {
            setFolders([]);
            setDecks([]);
            setUserProfile({ age: '', degree: '' });
            setActiveId(null);
            return;
        }

        const userDocRef = doc(db, "users", user.uid);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const fetchedFolders = data.folders || [];
                const fetchedDecks = data.decks || [];
                setFolders(fetchedFolders);
                setDecks(fetchedDecks);
                setUserProfile({
                    age: data.profile?.age || '',
                    degree: data.profile?.degree || '',
                    subscription: data.subscription || { tier: 'free', credits: 180 }
                });
                
                if (!activeId && fetchedDecks.length > 0) {
                    setActiveId(fetchedDecks[0].id);
                    setViewMode('deck');
                } else if (!activeId && fetchedFolders.length > 0) { setActiveId(fetchedFolders[0].id); setViewMode('folder'); }
            } else {
                // This case is handled on signup, but as a fallback:
                console.log("No user document found, creating one.");
                setDoc(userDocRef, { folders: [], decks: [], profile: { age: '', degree: '' } });
            }
        });

        return () => unsubscribe();
    }, [user, activeId]);

    const updateFirestore = async (newData) => {
        if (!user) return;
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, newData);
    };

    const activeDeck = viewMode === 'deck' ? decks.find(d => d.id === activeId) : null;
    const activeFolder = viewMode === 'folder' ? folders.find(f => f.id === activeId) : null;

    const updateDeck = (d) => updateFirestore({ decks: decks.map(x => x.id === d.id ? d : x) });
    const updateFolder = (f) => updateFirestore({ folders: folders.map(x => x.id === f.id ? f : x) });
    const updateProfile = (p) => { setUserProfile(p); updateFirestore({ profile: { age: p.age, degree: p.degree }, subscription: p.subscription }); };
    const deleteFolder = (id) => { if(confirm("Delete folder?")) { const newDecks = decks.filter(d => d.folderId !== id); const newFolders = folders.filter(f => f.id !== id); updateFirestore({ decks: newDecks, folders: newFolders }); setActiveId(null); }};
    const addDeck = (fid) => { const nid = Date.now(); updateFirestore({ decks: [...decks, { id: nid, folderId: fid, title: 'New Module', mode: 'dashboard' }] }); setViewMode('deck'); setActiveId(nid); };
    const deleteDeck = (id) => { if(confirm("Delete module?")) { const rem = decks.filter(d => d.id !== id); updateFirestore({ decks: rem }); if(activeId === id) setActiveId(rem[0]?.id || null); }};
    
    const openRenameFolder = (folder) => setNameModal({ isOpen: true, type: 'rename', folder: folder, value: folder.name });
    const handleSaveName = (name) => {
        if (nameModal.type === 'create') updateFirestore({ folders: [...folders, { id: Date.now(), name }] });
        else updateFirestore({ folders: folders.map(f => f.id === nameModal.folder.id ? { ...f, name } : f) });
        setNameModal({ isOpen: false, type: '', folder: null, value: '' });
    };
    
    const openAddFolder = () => setNameModal({ isOpen: true, type: 'create', folder: null, value: '' });

    const handleLogout = async () => {
        await signOut(auth);
        setShowSettings(false);
    };

    if (loading) {
        return <div className="w-full h-screen flex items-center justify-center"><RotateCw className="animate-spin text-indigo-600" size={48} /></div>;
    }

    if (!user) {
        return <AuthPage onAuthSuccess={(authedUser) => setUser(authedUser)} />;
    }

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
            <Sidebar 
                user={user} folders={folders} decks={decks} activeId={activeId} viewMode={viewMode}
                onSelectDeck={(id) => { setViewMode('deck'); setActiveId(id); if(decks.find(d=>d.id===id)) updateDeck({...decks.find(d=>d.id===id), mode: 'dashboard'}); }}
                onSelectFolder={(id) => { setViewMode('folder'); setActiveId(id); }}
                onAddFolder={openAddFolder} onDeleteFolder={deleteFolder} onRenameFolder={openRenameFolder} 
                onAddDeck={addDeck} onDeleteDeck={deleteDeck}
                onSettings={() => setShowSettings(true)}
            />
            <main className="flex-1 overflow-y-auto custom-scroll relative bg-[#f8fafc]">
                {viewMode === 'folder' && activeFolder && <FolderDashboard folder={activeFolder} decks={decks.filter(d => d.folderId === activeFolder.id)} onUpdateFolder={updateFolder} onUpdateDeck={updateDeck} userProfile={userProfile} />}
                {viewMode === 'deck' && activeDeck && (
                    <>
                        {activeDeck.mode === 'dashboard' && <ModuleDashboard deck={activeDeck} onUpdateDeck={updateDeck} userProfile={userProfile} onUpdateProfile={updateProfile} />}
                        {activeDeck.mode === 'flashcards' && <FlashcardStudy cards={activeDeck.cards || []} deck={activeDeck} onUpdateDeck={updateDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} />}
                        {/* Using 'quiz' mode for practice, 'exam' mode passes special prop */}
                        {activeDeck.mode === 'quiz' && <ExamRunner questions={activeDeck.quiz || []} deck={activeDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} userProfile={userProfile} />}
                        {activeDeck.mode === 'exam' && <ExamRunner questions={activeDeck.exams || []} deck={activeDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} userProfile={userProfile} />}
                        {activeDeck.mode === 'saq' && <SAQMode questions={activeDeck.saqs || []} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} userProfile={userProfile} />}
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
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">Settings</h3><button onClick={() => setShowSettings(false)}><X /></button></div>
                        <div className="space-y-4 p-6">
                            <div>
                                <h4 className="font-bold mb-2 text-slate-700">Subscription</h4>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <span className="text-sm font-bold text-indigo-600 capitalize">{userProfile.subscription?.tier || 'free'} Plan</span>
                                            <p className="text-xs text-slate-500">{userProfile.subscription?.tier === 'pro' ? 'Full access to all features.' : 'Hobbyist plan for 1 subject.'}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-slate-800">{userProfile.subscription?.credits}</div>
                                            <div className="text-xs text-slate-500">Credits</div>
                                        </div>
                                    </div>
                                    {userProfile.subscription?.tier !== 'pro' && (
                                        <button className="mt-4 w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-2 rounded-lg text-sm">Upgrade to Pro ($33.99/mo)</button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold mb-2 text-slate-700">Profile Settings</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <input placeholder="Age" type="number" value={userProfile.age} onChange={e => setUserProfile({ ...userProfile, age: e.target.value })} className="p-2 border rounded-lg" />                                    <input placeholder="Degree" value={userProfile.degree} onChange={e => setUserProfile({ ...userProfile, degree: e.target.value })} className="p-2 border rounded-lg" />
                                </div>
                                <p className="text-xs text-slate-500 mt-2">These details help the AI generate relevant content.</p>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t rounded-b-xl">
                            <div className="flex flex-col gap-2">
                                <button onClick={() => { 
                                    updateProfile(userProfile); 
                                    setShowSettings(false); 
                                }} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg">Save Settings</button>
                                <button onClick={handleLogout} className="w-full bg-red-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2">
                                    <LogOut size={16} /> Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}