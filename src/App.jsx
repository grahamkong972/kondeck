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
        if (type === 'flashcards') {
            return {
                q: String(item.q || "Error: Question missing"),
                a: String(item.a || "Error: Answer missing"),
                nextReview: item.nextReview || null 
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
        throw new Error(`Failed to parse AI response: ${e.message}. Raw text: ${clean.substring(0, 500)}`);
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

// --- GEMINI AI SERVICE (DIRECT CLIENT MODE) ---
const generateContent = async (apiKey, prompt, context, systemInstruction, attachmentData = null, quantity = 1) => {
    if (!apiKey) throw new Error("API Key is missing. Please add your own Google Gemini Key in Settings.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const fullSystemPrompt = `
        You are Kongruence, an advanced AI tutor.
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
                    <h1 className="text-2xl font-bold text-slate-900">Welcome to Graham Kong</h1>
                    <p className="text-slate-500 mt-2">Your AI-powered study companion.</p>
                </div>
                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="student@university.edu" required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="••••••••" required />
                        </div>
                    </div>
                    {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg flex items-center gap-2"><AlertCircle size={14}/> {error}</div>}
                    <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70">
                        {loading ? <RotateCw className="animate-spin" size={20}/> : (isLogin ? "Sign In" : "Create Account")}
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                        {isLogin ? "Need an account? Sign Up" : "Already have an account? Sign In"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- EXAM SETUP MODAL ---
const ExamSetupModal = ({ modules, onClose, onStartExam }) => {
    const [selectedModuleIds, setSelectedModuleIds] = useState(modules.map(m => m.id)); 
    const [totalMarks, setTotalMarks] = useState(100);
    const [mcqPercentage, setMcqPercentage] = useState(50);
    const [timeLimit, setTimeLimit] = useState(120);

    const saqPercentage = 100 - mcqPercentage;
    const mcqMarks = Math.round(totalMarks * (mcqPercentage / 100));
    const saqMarks = totalMarks - mcqMarks;
    const numMCQs = mcqPercentage === 0 ? 0 : Math.max(1, mcqMarks); // Ensure at least 1 MCQ if percentage > 0
    // FIX: Ensure 0 SAQs if percentage is 0
    const numSAQs = saqPercentage === 0 ? 0 : Math.max(1, Math.round(saqMarks / 5)); 

    const toggleModule = (id) => {
        setSelectedModuleIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };

    const handleStart = () => {
        if (selectedModuleIds.length === 0) return alert("Select at least one module.");
        onStartExam({
            moduleIds: selectedModuleIds,
            numMCQs: mcqPercentage === 0 ? 0 : Math.max(1, numMCQs), // Ensure 0 MCQs if percentage is 0
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

// --- EXAM RUNNER (Fixed: Removed infinite loop) ---
const ExamRunner = ({ questions, timeLimit, onBack, apiKey }) => {
    const [answers, setAnswers] = useState({});
    const [saqFeedback, setSaqFeedback] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(timeLimit ? timeLimit * 60 : 600); 
    const [gradingLoading, setGradingLoading] = useState({});
    const [incorrectQuestions, setIncorrectQuestions] = useState([]); // State to store incorrect questions

    useEffect(() => {
        if (!submitted && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(p => p - 1), 1000);
            return () => clearInterval(timer);
        } else if (timeLeft === 0 && !submitted) {
            handleSubmit();
        }
    }, [submitted, timeLeft]);

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    
    // Memoize the filtering so it doesn't re-run every render
    const mcqQuestions = useMemo(() => questions.filter(q => q.type !== 'saq'), [questions]);
    const mcqCount = mcqQuestions.length;
    
    // Derived state for stats - Calculated during render, but does NOT set state
    const currentStats = useMemo(() => {
        let score = 0;
        const incorrect = [];
        mcqQuestions.forEach((q) => {
            const idx = questions.indexOf(q);
            if (answers[idx] === q.a) score++;
            else incorrect.push({ ...q, userAnswer: answers[idx] });
        });
        return { score, incorrect };
    }, [answers, questions, mcqQuestions]);

    const handleSubmit = () => {
        setSubmitted(true);
        // Only set state on submit, preventing the render loop
        setIncorrectQuestions(currentStats.incorrect);
    };

    const gradeSAQ = async (index) => {
        if (!apiKey) return alert("API Key required for grading.");
        setGradingLoading(prev => ({ ...prev, [index]: true }));
        try {
            const q = questions[index];
            const userAns = answers[index] || "No answer provided.";
            const marks = q.marks || 5;
            const prompt = `Grade this SAQ out of ${marks}. Question: "${q.q}". Model: "${q.model}". Student: "${userAns}". Return JSON: { "score": number, "feedback": "string", "missing": "string" }`;
            const result = await generateContent(apiKey, prompt, "", "");
            setSaqFeedback(prev => ({ ...prev, [index]: result }));
        } catch (e) { alert(e.message); } 
        finally { setGradingLoading(prev => ({ ...prev, [index]: false })); }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
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
                        <h2 className="text-lg font-bold text-slate-800">Exam Results</h2>
                        <p className="text-slate-500">You scored {currentStats.score} / {mcqCount} on multiple choice.</p>
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
                                                <button onClick={() => gradeSAQ(idx)} disabled={gradingLoading[idx]} className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition flex items-center gap-2">
                                                    {gradingLoading[idx] ? <RotateCw className="animate-spin" size={14}/> : <Sparkles size={14}/>} Grade with AI
                                                </button>
                                            ) : (
                                                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-fade-in">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="font-bold text-purple-800">AI Feedback</span>
                                                        <span className="bg-white px-2 py-1 rounded text-xs font-bold text-purple-600 border border-purple-200">Score: {saqFeedback[idx].score}/{q.marks || 5}</span>
                                                    </div>
                                                    <p className="text-sm text-purple-900 mb-2">{saqFeedback[idx].feedback}</p>
                                                    {saqFeedback[idx].missing && <div className="text-xs text-red-600 mt-2 pt-2 border-t border-purple-100"><strong>Missing:</strong> {saqFeedback[idx].missing}</div>}
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
            {!submitted && <div className="sticky bottom-6 flex justify-center"><button onClick={handleSubmit} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full shadow-xl transition hover:-translate-y-1">Submit Exam</button></div>}
        </div>
    );
};

// --- SAQ MODE (Short Answer Practice) ---
const SAQMode = ({ questions, onBack, apiKey }) => {
    const [idx, setIdx] = useState(0);
    const [userAnswer, setUserAnswer] = useState("");
    const [grading, setGrading] = useState(false);
    const [feedback, setFeedback] = useState(null); 

    const question = questions[idx];

    const handleGrade = async () => {
        if (!userAnswer.trim()) return alert("Please type an answer first.");
        if (!apiKey) return alert("API Key missing.");

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
            const result = await generateContent(apiKey, prompt, "", "");
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
                            <button onClick={handleGrade} disabled={grading} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition flex items-center gap-2 disabled:opacity-70">
                                {grading ? <RotateCw className="animate-spin" size={18}/> : <CheckSquare size={18}/>} {grading ? "Grading..." : "Submit Answer"}
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
const FlashcardStudy = ({ deck, onUpdateDeck, onBack, apiKey }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [showSrsButtons, setShowSrsButtons] = useState(false);
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, learned: 0 });

    const cards = deck.cards || [];
    const isSRS = deck.studyMode === 'srs';
    
    // Sort cards for SRS: Due/New first, then future reviews
    const activeCards = useMemo(() => {
        if (!isSRS) return cards;
        const now = Date.now();
        return [...cards].sort((a, b) => {
            const aDue = a.nextReview || 0;
            const bDue = b.nextReview || 0;
            // Prioritize: Overdue/Now (<= now) -> New (0/null) -> Future (> now)
            const aIsDue = aDue <= now && aDue !== 0;
            const bIsDue = bDue <= now && bDue !== 0;
            if (aIsDue && !bIsDue) return -1;
            if (!aIsDue && bIsDue) return 1;
            if (!a.nextReview && b.nextReview) return -1; // New before future
            if (a.nextReview && !b.nextReview) return 1;
            return aDue - bDue;
        });
    }, [cards, isSRS]);

    const currentCard = activeCards[currentIndex];

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
        if (isSRS && !isFlipped) setShowSrsButtons(true);
    };

    const handleNext = () => {
        setIsFlipped(false);
        setShowSrsButtons(false);
        setCurrentIndex((prev) => (prev + 1) % activeCards.length);
    };

    const handleSRS = (quality) => {
        // Simple SRS Algorithm (Leitner-ish)
        // quality: 0 (Again), 1 (Hard), 2 (Good), 3 (Easy)
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        let interval = day;

        if (quality === 0) interval = 10 * 60 * 1000; // 10 mins
        else if (quality === 1) interval = day; // 1 day
        else if (quality === 2) interval = 3 * day; // 3 days
        else if (quality === 3) interval = 7 * day; // 7 days

        const updatedCard = { ...currentCard, nextReview: now + interval };
        const updatedCards = cards.map(c => c.id === currentCard.id || c.q === currentCard.q ? updatedCard : c);
        
        onUpdateDeck({ ...deck, cards: updatedCards });
        setSessionStats(prev => ({ ...prev, reviewed: prev.reviewed + 1 }));
        handleNext();
    };

    if (!currentCard) return <div className="p-10 text-center text-slate-500">No cards available. Generate some first!</div>;

    return (
        <div className="h-full flex flex-col max-w-4xl mx-auto p-6">
             <div className="flex justify-between items-center mb-6">
                <button onClick={onBack} className="flex gap-2 text-slate-500 hover:text-indigo-600 font-medium"><ChevronLeft/> Back to Dashboard</button>
                <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-slate-500">Session: {sessionStats.reviewed} reviewed</div>
                    <div className="text-sm font-bold text-slate-700">{currentIndex + 1} / {activeCards.length}</div>
                </div>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center perspective-1000">
                <div 
                    onClick={handleFlip}
                    className={`relative w-full max-w-2xl aspect-[3/2] bg-white rounded-2xl shadow-xl border border-slate-200 cursor-pointer transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-8 text-center">
                        <span className="absolute top-6 left-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Question</span>
                        <div className="prose prose-lg text-slate-800">
                            <FormattedText text={currentCard.q} />
                        </div>
                        <span className="absolute bottom-6 text-sm text-slate-400">Click to flip</span>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center p-8 text-center bg-indigo-50/30">
                         <span className="absolute top-6 left-6 text-xs font-bold text-indigo-400 uppercase tracking-wider">Answer</span>
                         <div className="prose prose-lg text-slate-800">
                            <FormattedText text={currentCard.a} />
                        </div>
                    </div>
                </div>

                <div className="mt-8 h-20 w-full max-w-2xl flex items-center justify-center">
                    {isSRS && showSrsButtons ? (
                         <div className="grid grid-cols-4 gap-3 w-full animate-fade-in-up">
                            <button onClick={(e) => { e.stopPropagation(); handleSRS(0); }} className="p-3 rounded-lg bg-red-100 text-red-700 font-bold hover:bg-red-200 transition">Again<div className="text-[10px] font-normal opacity-70">10m</div></button>
                            <button onClick={(e) => { e.stopPropagation(); handleSRS(1); }} className="p-3 rounded-lg bg-orange-100 text-orange-700 font-bold hover:bg-orange-200 transition">Hard<div className="text-[10px] font-normal opacity-70">1d</div></button>
                            <button onClick={(e) => { e.stopPropagation(); handleSRS(2); }} className="p-3 rounded-lg bg-blue-100 text-blue-700 font-bold hover:bg-blue-200 transition">Good<div className="text-[10px] font-normal opacity-70">3d</div></button>
                            <button onClick={(e) => { e.stopPropagation(); handleSRS(3); }} className="p-3 rounded-lg bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200 transition">Easy<div className="text-[10px] font-normal opacity-70">7d</div></button>
                         </div>
                    ) : (
                        <div className="flex gap-4">
                             <button onClick={handleFlip} className="px-6 py-2 rounded-full bg-white border border-slate-300 shadow-sm text-slate-600 font-medium hover:bg-slate-50 transition">
                                {isFlipped ? "Flip Back" : "Show Answer"}
                            </button>
                            {!isSRS && isFlipped && (
                                <button onClick={handleNext} className="px-6 py-2 rounded-full bg-indigo-600 text-white shadow-md font-bold hover:bg-indigo-700 transition flex items-center gap-2">
                                    Next Card <ChevronRight size={16}/>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ... Sidebar, ManageModal, NameModal ...

const Sidebar = ({ folders, decks, activeId, viewMode, onSelectDeck, onSelectFolder, onAddFolder, onDeleteFolder, onRenameFolder, onAddDeck, onDeleteDeck, onSettings }) => {
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
                <h1 className="font-bold text-xl flex items-center gap-2"><GraduationCap className="text-indigo-400" /> Kongruence</h1>
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
                <button onClick={() => signOut(auth)} className="w-full flex items-center justify-center gap-2 p-2.5 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded-lg text-sm transition"><LogOut size={16}/> Sign Out</button>
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
                            {items.map((item, i) => (
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
                            ))}
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
    const [activeExamData, setActiveExamData] = useState(null);
    const [examTimeLimit, setExamTimeLimit] = useState(0);

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
            const targetKey = type === 'flashcards' ? 'cards' : (type === 'exam' ? 'exams' : (type === 'saq' ? 'saqs' : 'quiz'));
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
                    prompt = `Generate ${currentBatchCount} HARD, scenario-based multiple choice questions for a FINAL EXAM. Focus on application of knowledge, critical thinking, and synthesis. Return JSON: [{"q":..., "options":..., "a":..., "exp":...}].${avoidInstruction}`;
                } else if (type === "saq") {
                    prompt = `Generate ${currentBatchCount} Short Answer Questions (SAQ) testing deep understanding. Assign a mark value (2-7) based on complexity. Provide a comprehensive model answer. Return JSON: [{"q": "Question text...", "model": "Ideal answer...", "marks": 5}].${avoidInstruction}`;
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
    
    if (activeExamData) {
         return <ExamRunner questions={activeExamData} timeLimit={examTimeLimit} onBack={() => setActiveExamData(null)} apiKey={apiKey} />;
    }

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
                            <button onClick={() => handleGenerate('saq')} disabled={isGenerating} className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm text-sm">
                                {isGenerating ? <RotateCw className="animate-spin" size={16}/> : <PenTool size={16}/>} {isGenerating ? statusMessage : "SAQ"}
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
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 flex flex-col items-center justify-center text-center relative group">
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
                            <button onClick={() => onUpdateDeck({...deck, mode: 'quiz', quizMode: 'practice'})} disabled={!deck.quiz?.length} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <Brain size={18}/> Practice Quiz
                            </button>
                            <button onClick={() => onUpdateDeck({...deck, mode: 'saq'})} disabled={!deck.saqs?.length} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <PenTool size={18}/> Practice SAQs
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Management Modal */}
            {manageMode && (
                <ManageModal 
                    type={manageMode}
                    items={manageMode === 'flashcards' ? (deck.cards || []) : (manageMode === 'quiz' ? (deck.quiz || []) : (manageMode === 'saq' ? (deck.saqs || []) : (deck.exams || [])))}
                    onClose={() => setManageMode(null)}
                    onDeleteItem={handleDeleteItem}
                    onDeleteAll={handleDeleteAll}
                />
            )}
        </div>
    );
};

// ... FlashcardStudy, FolderDashboard (Updated) ...
// (FolderDashboard is defined BEFORE ModuleDashboard in previous response, so here I will provide the updated FolderDashboard with LIVE GENERATION logic)

const FolderDashboard = ({ folder, decks, onUpdateFolder, onUpdateDeck, apiKey }) => {
    // ... [Same imports/state] ...
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [syllabusText, setSyllabusText] = useState(folder.syllabus || "");
    const [isGlobalStudy, setIsGlobalStudy] = useState(false);
    const [globalStudyMode, setGlobalStudyMode] = useState('srs');
    const [globalShuffle, setGlobalShuffle] = useState(true); // Default to shuffled
    
    // NEW: Live Exam States
    const [showExamSetup, setShowExamSetup] = useState(false);
    const [activeExamData, setActiveExamData] = useState(null); 
    const [examTimeLimit, setExamTimeLimit] = useState(0); 
    const [isExamGenerating, setIsExamGenerating] = useState(false); // Loading state
    const [generationProgress, setGenerationProgress] = useState(0); // NEW: Progress state

    useEffect(() => { setSyllabusText(folder.syllabus || ""); }, [folder.id]);
    const handleSaveSyllabus = () => onUpdateFolder({ ...folder, syllabus: syllabusText }); 
    const allModules = decks.filter(d => d.folderId === folder.id);

    const handleAnalyze = async () => {
        if (!syllabusText.trim()) return alert("Syllabus is empty.");
        setIsAnalyzing(true);
        try {
            const moduleTitles = allModules.map(d => d.title).join(', ');
            const prompt = `Analyze this syllabus against the existing modules: [${moduleTitles}]. Identify gaps or mismatches. Return JSON: { "analysis": "string", "suggestions": ["string", ...] }`;
            const result = await generateContent(apiKey, prompt, syllabusText, "");
            onUpdateFolder({ ...folder, analysis: result });
        } catch (e) {
            alert(e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGlobalUpdate = (updatedGlobalDeck) => {
        const { cards, incorrectQuestions } = updatedGlobalDeck;
        const updatedDecks = decks.map(deck => {
            const relevantCards = cards.filter(c => c.originalDeckId === deck.id);
            if (relevantCards.length > 0) {
                const newCards = deck.cards.map(dc => relevantCards.find(rc => rc.id === dc.id) || dc);
                return { ...deck, cards: newCards };
            }
            return deck;
        });
        setDecks(updatedDecks);
        onUpdateFolder({ ...folder, incorrectQuestions });
    };

    // --- LIVE EXAM GENERATOR (FOLDER LEVEL) ---
    const handleStartLiveExam = async ({ moduleIds, numMCQs, numSAQs, timeLimit }) => {
        setShowExamSetup(false);
        setIsExamGenerating(true);
        setGenerationProgress(0); // Reset progress

        try {
            // 1. Gather Context
            setGenerationProgress(10);
            const selectedDecks = allModules.filter(d => moduleIds.includes(d.id));
            const combinedContext = selectedDecks.map(d => `MODULE: ${d.title}\n${d.notes}\n${d.transcript}\n${d.slides}`).join("\n\n---\n\n");
            
            // 2. Generate MCQs
            setGenerationProgress(20);
            let mcqs = [];
            if(numMCQs > 0) {
                 const promptMCQ = `Generate ${numMCQs} HARD, scenario-based multiple choice questions for a FINAL EXAM covering these modules. Focus on synthesis and application. JSON: [{"q":..., "options":..., "a":..., "exp":...}]`;
                 setGenerationProgress(30); // Started generating MCQs
                 const rawMCQ = await generateContent(apiKey, promptMCQ, combinedContext, "", null, numMCQs);
                 mcqs = validateAndFixData(Array.isArray(rawMCQ) ? rawMCQ : [rawMCQ], 'mcq');
                 setGenerationProgress(60); // Finished generating MCQs
            } else {
                 setGenerationProgress(60); // Skip MCQ phase
            }

            // 3. Generate SAQs
            let saqs = [];
            if(numSAQs > 0) {
                 const promptSAQ = `Generate ${numSAQs} Short Answer Questions (SAQ) testing deep understanding of these modules. Assign marks (2-7). JSON: [{"q":..., "model":..., "marks":5}]`;
                 setGenerationProgress(70); // Started generating SAQs
                 const rawSAQ = await generateContent(apiKey, promptSAQ, combinedContext, "", null, numSAQs);
                 saqs = validateAndFixData(Array.isArray(rawSAQ) ? rawSAQ : [rawSAQ], 'saq');
                 setGenerationProgress(90); // Finished generating SAQs
            } else {
                 setGenerationProgress(90); // Skip SAQ phase
            }
            
            const finalExam = [...mcqs, ...saqs];
            if (finalExam.length === 0) throw new Error("Failed to generate exam questions.");

            setExamTimeLimit(timeLimit);
            setGenerationProgress(100);
            await sleep(500); // Small delay to see 100%
            setActiveExamData(finalExam);

        } catch (e) {
            alert(e.message);
        } finally {
            setIsExamGenerating(false);
            setGenerationProgress(0);
        }
    };

    if (isGlobalStudy) {
        const allCards = allModules.flatMap(d => (d.cards || []).map(c => ({ ...c, originalDeckId: d.id, id: c.id || Math.random() })));
        const globalDeck = {
            id: 'global',
            title: `Global Study: ${folder.name}`,
            cards: globalShuffle ? [...allCards].sort(() => Math.random() - 0.5) : allCards,
            incorrectQuestions: folder.incorrectQuestions || [],
            studyMode: globalStudyMode,
        };
        const virtualDeck = { id: 'global', title: `${folder.name} (Global)`, studyMode: globalStudyMode, cards: allCards }; // Fixed variable name issue
        return <FlashcardStudy deck={globalDeck} onUpdateDeck={handleGlobalUpdate} onBack={() => setIsGlobalStudy(false)} apiKey={apiKey} />;
    }

    if (activeExamData) {
         return <ExamRunner questions={activeExamData} timeLimit={examTimeLimit} onBack={() => setActiveExamData(null)} apiKey={apiKey} />;
    }
    
    if (isExamGenerating) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <div className="w-64 h-2 bg-slate-200 rounded-full mb-4 overflow-hidden relative">
                    <div 
                        className="h-full bg-indigo-600 transition-all duration-500 ease-out" 
                        style={{ width: `${generationProgress}%` }}
                    ></div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    {generationProgress < 100 ? <RotateCw className="animate-spin text-indigo-600" size={24} /> : <CheckCircle className="text-emerald-500" size={24}/>}
                    {generationProgress < 100 ? "Building Exam..." : "Ready!"}
                </h3>
                <p className="text-slate-500 text-sm mt-2">
                    {generationProgress < 20 && "Analyzing modules..."}
                    {generationProgress >= 20 && generationProgress < 60 && "Drafting multiple choice..."}
                    {generationProgress >= 60 && generationProgress < 90 && "Composing short answer questions..."}
                    {generationProgress >= 90 && "Finalizing paper..."}
                </p>
            </div>
        )
    }

    const totalCards = allModules.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
    const totalQuestions = allModules.reduce((sum, d) => sum + (d.quiz?.length || 0), 0);
    const totalSaqs = allModules.reduce((sum, d) => sum + (d.saqs?.length || 0), 0); 

    return (
        <div className="max-w-6xl mx-auto p-6 h-full flex flex-col">
            {/* ... Header and Analysis Panel (Same as before) ... */}
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                <div className="lg:col-span-8 flex flex-col gap-4 h-full">
                     {/* ... Syllabus Panel ... */}
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
                    {/* ... Audit & Totals ... */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-700 mb-4">Course Totals</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-slate-800">{allModules.length}</div><div className="text-xs text-slate-500 uppercase">Modules</div></div>
                            <div className="bg-indigo-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-indigo-600">{totalCards}</div><div className="text-xs text-indigo-400 uppercase">Cards</div></div>
                            <div className="bg-emerald-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-emerald-600">{totalQuestions}</div><div className="text-xs text-emerald-400 uppercase">Practice</div></div>
                            <div className="bg-purple-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-purple-600">{totalSaqs}</div><div className="text-xs text-purple-400 uppercase">SAQs</div></div>                            <div className="bg-red-50 p-4 rounded-lg text-center"><div className="text-2xl font-bold text-red-600">{folder.incorrectQuestions?.length || 0}</div><div className="text-xs text-red-400 uppercase">Incorrect</div></div>
                        </div>
                    </div>

                    <div className="space-y-3">
                         {/* Global Study Card (Same as before) */}
                         <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 rounded-xl shadow-md text-white">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Layers/> Global Flashcards</h3>
                            {/* ... (Standard/SRS buttons) ... */}
                            <div className="flex items-center gap-3 mb-4 bg-white/10 p-1 rounded-lg">
                                <button onClick={() => setGlobalStudyMode('standard')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-bold transition ${globalStudyMode === 'standard' ? 'bg-white text-indigo-600 shadow' : 'text-indigo-100 hover:bg-white/10'}`}>Standard</button>
                                <button onClick={() => setGlobalStudyMode('srs')} className={`flex-1 py-1.5 px-3 rounded-md text-sm font-bold transition ${globalStudyMode === 'srs' ? 'bg-white text-indigo-600 shadow' : 'text-indigo-100 hover:bg-white/10'}`}>Smart (SRS)</button>
                            </div>
                            {/* ... Shuffle toggle ... */}
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setGlobalShuffle(!globalShuffle)}>
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition ${globalShuffle ? 'bg-white border-white text-indigo-600' : 'border-indigo-200 text-transparent'}`}><Check size={14} strokeWidth={3} /></div>
                                    <span className="text-sm font-medium text-indigo-50">Shuffle Cards</span>
                                </div>
                                <button onClick={() => onUpdateFolder({ ...folder, incorrectQuestions: [] })} className="text-xs text-red-200 hover:text-red-50 font-medium hover:underline">Clear Incorrect</button>
                            </div>
                            <button onClick={() => setIsGlobalStudy(true)} disabled={totalCards === 0} className="w-full bg-white text-indigo-600 font-bold py-3 rounded-lg hover:bg-indigo-50 transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"><Zap size={18}/> Start Studying</button>
                        </div>

                        {/* MOCK EXAM CARD (Triggers Live Generation) */}
                        <div className="bg-gradient-to-br from-red-500 to-rose-600 p-6 rounded-xl shadow-md text-white">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><FileQuestion/> Mock Exam</h3>
                            <p className="text-red-100 text-sm mb-4">Generate a fresh exam paper from your {allModules.length} modules.</p>
                            <button onClick={() => setShowExamSetup(true)} disabled={decks.length === 0} className="w-full bg-white text-red-600 font-bold py-3 rounded-lg hover:bg-red-50 transition disabled:opacity-70 flex items-center justify-center gap-2"><Timer size={18}/> Build Exam</button>
                        </div>
                    </div>
                </div>
            </div>
            
            {showExamSetup && (
                <ExamSetupModal 
                    modules={allModules} 
                    onClose={() => setShowExamSetup(false)} 
                    onStartExam={handleStartLiveExam} 
                />
            )}
        </div>
    );
};

export default function App() {
    const [folders, setFolders] = useState(() => JSON.parse(localStorage.getItem('studyGenieFolders')) || [{ id: 1, name: 'General' }]);
    const [decks, setDecks] = useState(() => {
        const d = JSON.parse(localStorage.getItem('studyGenieData')) || [{ id: 101, folderId: 1, title: 'Example Module', incorrectQuestions: [] }];
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
                {viewMode === 'folder' && activeFolder && <FolderDashboard folder={activeFolder} decks={decks.filter(d => d.folderId === activeFolder.id)} onUpdateFolder={updateFolder} onUpdateDeck={updateDeck} apiKey={apiKey} />}
                {viewMode === 'deck' && activeDeck && (
                    <>
                        {activeDeck.mode === 'dashboard' && <ModuleDashboard deck={activeDeck} onUpdateDeck={updateDeck} apiKey={apiKey} userProfile={userProfile} />}
                        {activeDeck.mode === 'flashcards' && <FlashcardStudy cards={activeDeck.cards || []} deck={activeDeck} onUpdateDeck={updateDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} apiKey={apiKey} />}
                        {/* Using 'quiz' mode for practice, 'exam' mode passes special prop */}
                        {activeDeck.mode === 'quiz' && <ExamRunner questions={activeDeck.quiz || []} deck={activeDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} apiKey={apiKey} />}
                        {activeDeck.mode === 'exam' && <ExamRunner questions={activeDeck.exams || []} deck={activeDeck} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} apiKey={apiKey} />}
                        {activeDeck.mode === 'saq' && <SAQMode questions={activeDeck.saqs || []} onBack={() => updateDeck({...activeDeck, mode: 'dashboard'})} apiKey={apiKey} />}
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