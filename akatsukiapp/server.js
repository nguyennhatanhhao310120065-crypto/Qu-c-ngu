import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
console.log(`[env] GEMINI_API_KEY: ${GEMINI_KEY ? GEMINI_KEY.slice(0, 10) + '...' : '(NOT SET)'}`);

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + suffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ---- Prompt Builder: generates prompt for a SINGLE question type ----
function buildSingleTypePrompt(transcript, examType, questionType, count) {
  const typeInstructions = {
    mcq: `### MULTIPLE CHOICE (type: "mcq")
- Write a clear question stem ending with "?"
- Provide EXACTLY 4 options: ["A. ...", "B. ...", "C. ...", "D. ..."]
- Only ONE option is the correct answer
- Set the "answer" field to JUST the letter, e.g. "B"
- Distractors must be plausible but clearly wrong based on the transcript
- Never use "All of the above" or "None of the above"
- Test comprehension of main ideas, specific details, or speaker intent
- Example:
  text: "What does the speaker recommend for improving vocabulary?"
  options: ["A. Reading newspapers daily", "B. Using flashcard apps", "C. Watching English movies", "D. Joining a study group"]
  answer: "A"`,

    true_false: `### TRUE / FALSE (type: "true_false")
- Write a clear declarative statement about the transcript content
- Set options to: ["True", "False"]
- Set "answer" to exactly "True" or "False"
- "True" = the statement accurately reflects what was said in the transcript
- "False" = the statement contradicts what was said in the transcript
- Statements must test comprehension, not trivial word-matching
- Example:
  text: "The workshop will be held on Saturday morning."
  options: ["True", "False"]
  answer: "False"`,

    true_false_ng: `### TRUE / FALSE / NOT GIVEN (type: "true_false_ng")
- Write a clear declarative statement
- Set options to: ["True", "False", "Not Given"]
- "True" = the transcript directly supports this statement
- "False" = the transcript directly contradicts this statement
- "Not Given" = the transcript does not provide enough information
- Aim for a balanced distribution of True, False, and Not Given answers
- Example:
  text: "The company relocated its headquarters in 2019."
  options: ["True", "False", "Not Given"]
  answer: "Not Given"`,

    fill_blank: `### FILL IN THE BLANK (type: "fill_blank")
- Write a statement with ONE gap marked as "_____"
- The answer is 1-3 words taken DIRECTLY from the transcript (exact wording)
- The surrounding context must clearly indicate what information fills the gap
- Focus on key facts: names, numbers, dates, places, specific details
- Set options to an empty array: []
- Example:
  text: "Participants must register before _____ to receive the early bird discount."
  answer: "March 15th"`,

    sentence_completion: `### SENTENCE COMPLETION (type: "sentence_completion")
- Write the beginning of a sentence that the student must complete
- The answer is 1-4 words that complete the sentence, based on transcript content
- Set options to an empty array: []
- Example:
  text: "The main reason for the delay was..."
  answer: "a supply chain issue"`,

    short_answer: `### SHORT ANSWER (type: "short_answer")
- Ask a direct WH-question (What / Where / When / Who / How many / How much)
- The answer should be 1-5 words
- Set options to an empty array: []
- Target specific factual information from the transcript
- Example:
  text: "How many participants attended the conference?"
  answer: "approximately 200"`,

    matching: `### MATCHING (type: "matching")
- Create a MATCHING exercise with a SHARED set of options for ALL questions
- Choose a theme from the transcript (e.g., speakers→roles, events→dates, places→descriptions)
- Create a SHARED options list with MORE options than questions (e.g., 5 questions → 7 options A-G as distractors)
- EVERY question MUST use the EXACT SAME options array
- Each question text describes ONE item to match (e.g., "Match: Speaker 1's main topic")
- "answer" is the correct letter for that item
- Not every option is used — extras are distractors
- Example (3 questions sharing 4 options):
  ALL questions share options: ["A. Marketing department", "B. Finance department", "C. Human Resources", "D. IT Support"]
  Q1: text: "Match: John's department" / options: [same 4] / answer: "B"
  Q2: text: "Match: Sarah's department" / options: [same 4] / answer: "A"
  Q3: text: "Match: David's department" / options: [same 4] / answer: "C"
  (Option D is the distractor — not matched to anyone)`,

    table_completion: `### TABLE / FORM COMPLETION (type: "table_completion")
- Create questions that simulate filling in cells of a table, form, or booking sheet
- Each question represents ONE blank cell in the table
- Format the "text" as: "[Form/Table context] — [Row or field label]: _____"
- Answer is 1-3 words taken DIRECTLY from the transcript
- Questions should logically relate as parts of the same form
- Set options to an empty array: []
- Examples:
  text: "Booking Form — Guest name: _____" / answer: "Dr. Sarah Chen"
  text: "Course Registration — Course code: _____" / answer: "BUS204"`,

    note_completion: `### NOTE / OUTLINE COMPLETION (type: "note_completion")
- Create questions that simulate completing organized lecture notes or an outline
- Each question represents ONE blank in structured notes
- Format: "[Notes topic] — [bullet/heading]: _____"
- Answer is 1-3 words from the transcript
- Questions follow the logical structure of notes (headings then sub-points)
- Set options to an empty array: []
- Examples:
  text: "Lecture: Marine Biology — Main food source for whales: _____" / answer: "krill and plankton"
  text: "Meeting Notes — Next deadline: _____" / answer: "end of November"`
  };

  const examContexts = {
    IELTS: `You are a certified IELTS examiner creating an official IELTS Listening practice test.
IELTS LISTENING STANDARDS:
- Questions MUST progress chronologically following the transcript
- Language register: formal, precise, matching real IELTS papers
- Fill-in-blank answers: NO MORE THAN THREE WORDS AND/OR A NUMBER
- Multiple choice: exactly 4 options (A-D)
- Difficulty progression: questions become harder toward the end
- Distribution: 30% easy, 50% medium, 20% challenging
- Distractors in MCQ should be mentioned in audio but not the correct answer to the specific question`,

    TOEIC: `You are a TOEIC exam specialist creating a Listening comprehension practice test.
TOEIC LISTENING STANDARDS:
- Focus on business, workplace, and daily life scenarios
- Test practical English comprehension for professional contexts
- Options should reflect realistic workplace and everyday situations
- Difficulty level: intermediate to upper-intermediate
- Questions should feel natural and contextualized, matching official TOEIC style
- Pay attention to paraphrasing — correct answers often rephrase transcript content`,

    VSTEP: `You are a VSTEP exam specialist creating a Listening test following Vietnam's national English proficiency framework.
VSTEP LISTENING STANDARDS:
- Target levels B1 to C1 comprehension skills
- Focus on academic and semi-formal contexts
- Questions must match Vietnamese university English exam standards
- Ensure clear, well-structured questions with unambiguous answers
- Include both detail-oriented and inference-based questions`,

    GENERAL: `You are a university English professor designing a listening comprehension exam for undergraduate students.
UNIVERSITY EXAM STANDARDS:
- Cover multiple cognitive skills: factual recall, inference, and critical analysis
- Questions must be professional, clear, and academically rigorous
- Mix difficulty levels for a well-balanced assessment
- Follow standard university exam formatting conventions
- Include questions that test both explicit and implicit information`
  };

  const typeRule = typeInstructions[questionType] || '';

  return `${examContexts[examType] || examContexts.GENERAL}

YOUR TASK: Generate EXACTLY ${count} "${questionType}" questions based on the audio transcript below.

ALL ${count} questions MUST be of type "${questionType}".

FORMAT RULES:

${typeRule}

CRITICAL RULES:
1. Every answer MUST be directly verifiable from the transcript.
2. Questions follow the chronological order of the transcript.
3. Each question object MUST have: number (1-${count}), text (string), type ("${questionType}"), options (string[]), answer (string), explanation (string), transcript_quote (string).
4. For mcq/matching: "options" = labeled choices ["A. ...", "B. ...", ...].
5. For fill_blank/sentence_completion/short_answer/table_completion/note_completion: "options" = [].
6. For true_false: "options" MUST be exactly ["True", "False"]. For true_false_ng: "options" MUST be exactly ["True", "False", "Not Given"]. The "answer" MUST be one of these exact strings.
7. "explanation" = a clear explanation of WHY the answer is correct (2-3 sentences).
8. "transcript_quote" = the EXACT sentence or phrase from the transcript that contains/supports the correct answer. Copy verbatim from the transcript (5-40 words). This is used to highlight the relevant part of the transcript for the student.
9. Do NOT repeat information across questions. Vary the content covered.
10. Questions must feel like a real ${examType} exam.
11. Generate DIVERSE questions covering DIFFERENT parts of the transcript.

TRANSCRIPT:
"""
${transcript}
"""

Return JSON: { "questions": [ ...${count} question objects... ] }`;
}

async function generateQuestionsForType(transcript, examType, questionType, count) {
  const prompt = buildSingleTypePrompt(transcript, examType, questionType, count);
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                type: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                transcript_quote: { type: Type.STRING }
              },
              required: ['number', 'text', 'answer', 'type', 'explanation', 'transcript_quote']
            }
          }
        },
        required: ['questions']
      }
    }
  });
  const parsed = JSON.parse(response.text || '{}');
  return (parsed.questions || []).map(q => ({ ...q, type: questionType }));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
  app.use('/uploads', express.static(uploadsDir));

  app.use(express.static(path.join(__dirname, 'public')));

  const db = new Database(path.join(__dirname, 'akatsuki.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      role INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name TEXT,
      created_by INTEGER,
      is_public BOOLEAN DEFAULT 0,
      exam_type TEXT,
      audio_url TEXT,
      transcript TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER,
      section_number INTEGER,
      instruction TEXT,
      FOREIGN KEY(bank_id) REFERENCES question_banks(id)
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER,
      question_number INTEGER,
      question_text TEXT,
      correct_answer TEXT,
      explanation TEXT,
      question_type TEXT,
      options TEXT,
      FOREIGN KEY(section_id) REFERENCES sections(id)
    );
    CREATE TABLE IF NOT EXISTS student_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      bank_id INTEGER,
      score REAL,
      total_questions INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(bank_id) REFERENCES question_banks(id)
    );
    CREATE TABLE IF NOT EXISTS saved_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      question_id INTEGER,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(question_id) REFERENCES questions(id),
      UNIQUE(user_id, question_id)
    );
  `);
  try { db.exec('ALTER TABLE questions ADD COLUMN transcript_quote TEXT DEFAULT ""'); } catch {}

  // ---- Auth ----
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.password_hash !== password) return res.status(401).json({ success: false, message: 'Incorrect password' });
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post('/api/auth/register', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    try {
      const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, password, role ?? 2);
      res.json({ success: true, userId: info.lastInsertRowid });
    } catch {
      res.status(400).json({ success: false, message: 'Username already exists' });
    }
  });

  // ---- File upload ----
  app.post('/api/upload', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    console.log(`[upload] Saved: ${req.file.filename} (${(req.file.size / 1024).toFixed(0)} KB)`);
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
  });

  // ---- Question banks ----
  app.get('/api/banks', (req, res) => {
    const banks = db.prepare(`
      SELECT qb.*, u.username as creator_name,
        (SELECT COUNT(*) FROM questions q JOIN sections s ON q.section_id = s.id WHERE s.bank_id = qb.id) as question_count
      FROM question_banks qb
      JOIN users u ON qb.created_by = u.id
      WHERE qb.is_public = 1 OR qb.created_by = ?
    `).all(req.query.userId || 0);
    res.json(banks);
  });

  app.get('/api/banks/:id', (req, res) => {
    const bank = db.prepare('SELECT * FROM question_banks WHERE id = ?').get(req.params.id);
    if (!bank) return res.status(404).json({ error: 'Bank not found' });
    const sections = db.prepare('SELECT * FROM sections WHERE bank_id = ?').all(req.params.id);
    const fullSections = sections.map(s => {
      const questions = db.prepare('SELECT * FROM questions WHERE section_id = ?').all(s.id);
      return { ...s, questions: questions.map(q => ({ ...q, options: JSON.parse(q.options || '[]') })) };
    });
    res.json({ ...bank, sections: fullSections });
  });

  app.delete('/api/banks/:id', (req, res) => {
    const { userId } = req.query;
    const bank = db.prepare('SELECT created_by FROM question_banks WHERE id = ?').get(req.params.id);
    if (!bank || bank.created_by !== Number(userId)) return res.status(403).json({ error: 'Unauthorized' });
    db.transaction(() => {
      const sections = db.prepare('SELECT id FROM sections WHERE bank_id = ?').all(req.params.id);
      for (const s of sections) {
        db.prepare('DELETE FROM saved_questions WHERE question_id IN (SELECT id FROM questions WHERE section_id = ?)').run(s.id);
        db.prepare('DELETE FROM questions WHERE section_id = ?').run(s.id);
      }
      db.prepare('DELETE FROM sections WHERE bank_id = ?').run(req.params.id);
      db.prepare('DELETE FROM student_results WHERE bank_id = ?').run(req.params.id);
      db.prepare('DELETE FROM question_banks WHERE id = ?').run(req.params.id);
    })();
    res.json({ success: true });
  });

  app.patch('/api/banks/:id/visibility', (req, res) => {
    const { userId, isPublic } = req.body;
    const bank = db.prepare('SELECT created_by FROM question_banks WHERE id = ?').get(req.params.id);
    if (!bank || bank.created_by !== Number(userId)) return res.status(403).json({ error: 'Unauthorized' });
    db.prepare('UPDATE question_banks SET is_public = ? WHERE id = ?').run(isPublic ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.post('/api/banks', (req, res) => {
    const { bank_name, created_by, exam_type, audio_url, transcript, sections, start_time, end_time } = req.body;
    try {
      const transaction = db.transaction(() => {
        const bankInfo = db.prepare(`
          INSERT INTO question_banks (bank_name, created_by, exam_type, audio_url, transcript, start_time, end_time)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(bank_name, created_by, exam_type, audio_url, transcript, start_time || 0, end_time || 0);
        const bankId = bankInfo.lastInsertRowid;
        for (const section of sections) {
          const sectionInfo = db.prepare('INSERT INTO sections (bank_id, section_number, instruction) VALUES (?, ?, ?)')
            .run(bankId, section.section_number, section.instruction);
          const sectionId = sectionInfo.lastInsertRowid;
          for (const q of section.questions) {
            db.prepare(`INSERT INTO questions (section_id, question_number, question_text, correct_answer, explanation, question_type, options, transcript_quote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(sectionId, q.number, q.text, q.answer, q.explanation || '', q.type || 'mcq', JSON.stringify(q.options || []), q.transcript_quote || '');
          }
        }
        return bankId;
      });
      const bankId = transaction();
      res.json({ success: true, bankId });
    } catch (e) {
      console.error('[save-bank]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---- Results ----
  app.post('/api/results', (req, res) => {
    const { user_id, bank_id, score, total_questions, correct_count } = req.body;
    db.prepare('INSERT INTO student_results (user_id, bank_id, score, total_questions, correct_count) VALUES (?, ?, ?, ?, ?)')
      .run(user_id, bank_id, score, total_questions || 0, correct_count || 0);
    res.json({ success: true });
  });

  app.get('/api/results/:userId', (req, res) => {
    const results = db.prepare(`
      SELECT sr.*, COALESCE(qb.bank_name, 'Practice Session') as bank_name, COALESCE(qb.exam_type, 'Practice') as exam_type
      FROM student_results sr
      LEFT JOIN question_banks qb ON sr.bank_id = qb.id
      WHERE sr.user_id = ? ORDER BY sr.completed_at DESC
    `).all(req.params.userId);
    res.json(results);
  });

  // ---- Saved questions ----
  app.post('/api/saved-questions', (req, res) => {
    const { user_id, question_id } = req.body;
    try {
      db.prepare('INSERT INTO saved_questions (user_id, question_id) VALUES (?, ?)').run(user_id, question_id);
      res.json({ success: true });
    } catch { res.status(400).json({ success: false, message: 'Already saved' }); }
  });

  app.delete('/api/saved-questions', (req, res) => {
    const { user_id, question_id } = req.body;
    db.prepare('DELETE FROM saved_questions WHERE user_id = ? AND question_id = ?').run(user_id, question_id);
    res.json({ success: true });
  });

  app.get('/api/saved-questions/:userId', (req, res) => {
    const questions = db.prepare(`
      SELECT q.*, qb.bank_name, qb.exam_type, qb.audio_url FROM questions q
      JOIN saved_questions sq ON q.id = sq.question_id
      JOIN sections s ON q.section_id = s.id
      JOIN question_banks qb ON s.bank_id = qb.id
      WHERE sq.user_id = ? ORDER BY sq.saved_at DESC
    `).all(req.params.userId);
    res.json(questions.map(q => ({ ...q, options: JSON.parse(q.options || '[]') })));
  });

  // ---- Gemini: Transcribe audio ----
  app.post('/api/transcribe', async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'No filename provided' });
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio file not found on server' });

    console.log(`[transcribe] Reading file: ${filename}`);
    try {
      const audioBuffer = fs.readFileSync(filePath);
      const audioBase64 = audioBuffer.toString('base64');
      const ext = path.extname(filename).toLowerCase();
      const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.webm': 'audio/webm' };
      const mimeType = mimeMap[ext] || 'audio/mpeg';

      console.log(`[transcribe] Sending to Gemini (${(audioBuffer.length / 1024).toFixed(0)} KB, ${mimeType})`);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: audioBase64, mimeType } },
            { text: 'Transcribe this English audio accurately and completely. Output ONLY the transcript text with proper punctuation and paragraph breaks. Do not add commentary, timestamps, or speaker labels unless clearly distinct speakers are present.' }
          ]
        }]
      });
      const text = response.text || '';
      console.log(`[transcribe] Success: ${text.slice(0, 100)}...`);
      res.json({ text });
    } catch (e) {
      console.error('[transcribe] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Gemini: Generate questions (parallel per-type) ----
  app.post('/api/generate-questions', async (req, res) => {
    const { transcript, examType, questionTypes, questionsPerType } = req.body;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
    if (!transcript) return res.status(400).json({ error: 'No transcript provided' });

    const types = Array.isArray(questionTypes) && questionTypes.length > 0 ? questionTypes : ['mcq'];
    const perType = Math.min(Math.max(Number(questionsPerType) || 10, 1), 50);
    const total = types.length * perType;

    console.log(`[generate] ${examType} | ${types.length} types × ${perType}/type = ${total} total | transcript: ${transcript.length} chars`);

    try {
      const results = await Promise.allSettled(
        types.map(type => {
          console.log(`[generate] Starting ${type} (${perType} questions)...`);
          return generateQuestionsForType(transcript, examType, type, perType);
        })
      );

      const allQuestions = [];
      let num = 1;
      const errors = [];
      for (let i = 0; i < types.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled' && r.value?.length) {
          console.log(`[generate] ✓ ${types[i]}: ${r.value.length} questions`);
          for (const q of r.value) { q.number = num++; allQuestions.push(q); }
        } else {
          const msg = r.status === 'rejected' ? r.reason?.message : 'No questions returned';
          console.error(`[generate] ✗ ${types[i]}: ${msg}`);
          errors.push(`${types[i]}: ${msg}`);
        }
      }

      if (!allQuestions.length) throw new Error('All generation failed: ' + errors.join('; '));

      console.log(`[generate] Done: ${allQuestions.length}/${total} questions generated`);
      res.json({
        section_number: 1,
        instruction: `${examType} Listening Comprehension — ${allQuestions.length} Questions`,
        questions: allQuestions
      });
    } catch (e) {
      console.error('[generate] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Gemini: Regenerate single type ----
  app.post('/api/regenerate-type', async (req, res) => {
    const { transcript, examType, questionType, count } = req.body;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
    if (!transcript) return res.status(400).json({ error: 'No transcript provided' });
    const perType = Math.min(Math.max(Number(count) || 10, 1), 50);
    console.log(`[regenerate-type] ${questionType} × ${perType}`);
    try {
      const questions = await generateQuestionsForType(transcript, examType, questionType, perType);
      console.log(`[regenerate-type] ✓ ${questionType}: ${questions.length} questions`);
      res.json({ questions });
    } catch (e) {
      console.error('[regenerate-type] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Fallback SPA
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
