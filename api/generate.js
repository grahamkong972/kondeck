// import { GoogleGenerativeAI } from "@google/generative-ai";
// import { initializeApp, cert, getApps } from "firebase-admin/app";
// import { getFirestore } from "firebase-admin/firestore";

// const GEN_API_KEY = process.env.GEMINI_API_KEY;
// const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// if (!getApps().length) {
//   initializeApp({ credential: cert(FIREBASE_SERVICE_ACCOUNT) });
// }

// const db = getFirestore();
// const genAI = new GoogleGenerativeAI(GEN_API_KEY);

// const FREE_DAILY_LIMIT = 50; // The magic number

// export default async function handler(req, res) {
//   if (req.method !== 'POST') return res.status(405).end();

//   const { prompt, context, systemInstruction, userId, isPro, quantity } = req.body;

//   try {
//     // --- 1. THE GATEKEEPER ---
//     if (!isPro) {
//       const today = new Date().toISOString().split('T')[0]; // "2023-10-27"
//       const usageRef = db.collection('users').doc(userId).collection('usage').doc(today);
      
//       const doc = await usageRef.get();
//       const currentUsage = doc.exists ? doc.data().count : 0;

//       // Check if this specific batch would push them over the limit
//       if (currentUsage + quantity > FREE_DAILY_LIMIT) {
//         return res.status(402).json({ 
//           error: "DAILY_LIMIT_REACHED",
//           currentUsage,
//           limit: FREE_DAILY_LIMIT
//         });
//       }

//       // Increment Counter by the exact number of items requested
//       await usageRef.set({ count: currentUsage + quantity }, { merge: true });
//     }

//     // --- 2. GENERATE CONTENT ---
//     const model = genAI.getGenerativeModel({ 
//         model: "gemini-1.5-flash",
//         systemInstruction: systemInstruction 
//     });

//     const result = await model.generateContent([`CONTEXT:\n${context}\n\nTASK:\n${prompt}`]);
//     const response = await result.response;
//     const text = response.text();

//     res.status(200).json({ text });

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// }