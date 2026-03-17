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
function buildSingleTypePrompt(transcript, examType, questionType, count, partLabel, customInstruction) {
  const typeInstructions = {
    mcq: `### MULTIPLE CHOICE (type: "mcq")

QUESTION DESIGN PROCESS — follow these steps for EACH question:
1. Identify a specific comprehension point in the transcript (a fact, opinion, cause, result, comparison, or sequence of events).
2. Write a clear question stem that tests understanding of that point.
3. Write the CORRECT answer — it may PARAPHRASE the transcript (do NOT just copy word-for-word).
4. Write 3 DISTRACTORS following the rules below.

DISTRACTOR RULES (THIS IS THE MOST IMPORTANT PART):
- At least 3 of the 4 options MUST use information that IS mentioned in the transcript.
- WRONG options take REAL details from the transcript but apply them to the WRONG context.
  Example transcript: "John went to Paris on Monday. He visited Berlin on Friday."
  Question: "When did John go to Paris?"
  Options: A. Monday ✓ | B. Friday ✗ (real detail, wrong context) | C. Wednesday ✗ | D. Tuesday ✗
  → "Friday" is an excellent distractor because it IS in the transcript but answers a DIFFERENT question.
- Use IELTS-style distractor traps: self-corrections ("I mean..."), negations ("not the first but the second"), similar-sounding details, changed quantities, and paraphrased alternatives.
- NEVER use obviously absurd, unrelated, or generic options (like random names, spelling questions, or trivial details).
- NEVER use "All of the above" or "None of the above".
- The correct answer should test COMPREHENSION, not just word-matching.

FORMAT:
- options: ["A. ...", "B. ...", "C. ...", "D. ..."]
- answer: JUST the letter, e.g. "B"`,

    true_false: `### TRUE / FALSE (type: "true_false")

STATEMENT DESIGN PROCESS — follow these steps:
1. Identify specific claims, facts, numbers, or descriptions in the transcript.
2. For each question, write ONE clear declarative statement.

STATEMENT RULES:
- TRUE statements: PARAPHRASE something directly stated in the transcript. Do NOT copy verbatim — rephrase using synonyms or different sentence structures while keeping the same meaning.
- FALSE statements: Take a REAL detail from the transcript and CHANGE one key element to make it incorrect.
  Techniques for creating FALSE statements:
  • Change a number/quantity: "15%" → "25%"
  • Change a time/date: "Monday" → "Tuesday"
  • Change a name/place: "Building A" → "Building B"
  • Reverse a relationship: "increased" → "decreased"
  • Swap two details: attribute X's quality to Y
  Example transcript: "The meeting starts at 3 PM in Room 204."
  FALSE statement: "The meeting starts at 2 PM." (changed time — detail IS from transcript context)
- NEVER write vague or ambiguous statements.
- Each statement must be clearly verifiable from the transcript.
- Target distribution: approximately 50% True, 50% False.

FORMAT:
- options: ["True", "False"] (ALWAYS exactly these two strings)
- answer: "True" or "False" (MUST be one of these exact strings)`,

    true_false_ng: `### TRUE / FALSE / NOT GIVEN (type: "true_false_ng")

STATEMENT DESIGN PROCESS:
1. Carefully analyze the transcript for: (a) what IS explicitly stated, (b) what is CONTRADICTED, (c) what is NOT addressed.
2. Design statements for each category.

CATEGORY DEFINITIONS (CRITICAL — understand the distinction):
- TRUE: The transcript directly SUPPORTS this statement. The information is stated or can be clearly inferred. May be paraphrased.
- FALSE: The transcript directly CONTRADICTS this statement. There MUST be a specific detail in the transcript that PROVES the statement wrong.
  Example transcript: "The library opens at 9 AM."
  FALSE: "The library opens at 8 AM." → Contradicted by "9 AM".
- NOT GIVEN: The TOPIC may be mentioned, but the SPECIFIC claim is neither confirmed nor denied anywhere in the transcript.
  Example transcript: "The library opens at 9 AM." (never mentions closing time)
  NOT GIVEN: "The library closes at 6 PM." → Opening hours discussed, but closing time never mentioned.

COMMON MISTAKE TO AVOID:
- FALSE ≠ NOT GIVEN. "FALSE" requires the transcript to say the OPPOSITE. "NOT GIVEN" means the transcript simply does not address the specific claim.

- Target distribution: roughly ⅓ True, ⅓ False, ⅓ Not Given.

FORMAT:
- options: ["True", "False", "Not Given"] (ALWAYS exactly these three strings)
- answer: "True", "False", or "Not Given" (MUST be one of these exact strings)`,

    fill_blank: `### FILL IN THE BLANK (type: "fill_blank")

QUESTION DESIGN PROCESS:
1. Identify sentences containing key factual details (names, numbers, dates, places, technical terms, specific descriptions).
2. Write a sentence that PARAPHRASES the original context, replacing ONE key detail with "_____".

DESIGN RULES:
- The answer MUST be 1–3 words taken DIRECTLY from the transcript (exact wording as spoken).
- The blank must replace MEANINGFUL information — never function words like "the", "is", "and".
- The surrounding sentence must provide enough context to indicate what type of information is missing.
- Good targets: proper nouns, numbers, dates, time expressions, specific terms, measurements, place names.
- The paraphrased sentence should use different wording from the transcript so students must LISTEN, not just pattern-match.

FORMAT:
- options: [] (empty array)
- answer: Exact 1-3 words from the transcript
- Example: text: "Participants need to complete registration by _____." / answer: "March 15th"`,

    sentence_completion: `### SENTENCE COMPLETION (type: "sentence_completion")

QUESTION DESIGN PROCESS:
1. Identify key ideas, conclusions, causes, results, or opinions in the transcript.
2. Write the beginning of a sentence that points toward a specific piece of information.

DESIGN RULES:
- The sentence beginning must clearly direct the student toward ONE specific answer.
- The answer is 1–4 words that naturally and grammatically complete the sentence.
- Focus on: causes/reasons ("The delay was caused by..."), results ("As a result, the team decided to..."), purposes ("The main goal of the project is..."), opinions ("The speaker believes that the most important factor is...").
- The answer must be verifiable from the transcript content.

FORMAT:
- options: [] (empty array)
- answer: 1-4 words that complete the sentence
- Example: text: "The speaker suggests that the most effective study method is..." / answer: "regular spaced repetition"`,

    short_answer: `### SHORT ANSWER (type: "short_answer")

QUESTION DESIGN PROCESS:
1. Identify specific factual details in the transcript.
2. Write direct WH-questions targeting those details.

DESIGN RULES:
- Use WH-questions: What / Where / When / Who / How many / How much / Why / How.
- Each question must have ONE clear, unambiguous correct answer.
- The answer should be 1–5 words — a concise factual response.
- Target SPECIFIC, concrete information: quantities, names, locations, dates, durations, prices.
- Avoid questions that could have multiple valid answers.

FORMAT:
- options: [] (empty array)
- answer: 1-5 word factual answer
- Example: text: "How long does the orientation program last?" / answer: "three days"`,

    matching: `### MATCHING (type: "matching")

QUESTION DESIGN PROCESS:
1. Identify a clear CATEGORY of matchable items in the transcript (speakers→topics, people→roles, places→features, events→dates, items→descriptions).
2. Build a SHARED list of options with MORE options than questions (for distractors).
3. Create questions that ask students to match each item to its correct option.

MATCHING DESIGN RULES (CRITICAL):
- ALL items and ALL options (including distractors) MUST come from the transcript.
  Example: If matching speakers to their professions, and the transcript mentions doctor, teacher, engineer, lawyer, and architect — use ALL of them as options, even if only 4 questions are needed. The extra profession is a distractor.
- EVERY question MUST use the EXACT SAME options array (shared options list).
- Include at least 2 MORE options than questions (e.g., 5 questions → 7 options, 4 questions → 6 options).
- Each question's "text" should clearly identify WHAT needs to be matched (e.g., "Speaker A's main area of expertise").
- Not every option needs to be used — unused options are distractors.
- Distractors must be PLAUSIBLE — they are real items from the transcript, just not the correct match for that specific question.

FORMAT:
- All questions share identical options: ["A. ...", "B. ...", "C. ...", "D. ...", "E. ...", ...]
- answer: The correct letter, e.g. "C"`,

    table_completion: `### TABLE / FORM COMPLETION (type: "table_completion")

QUESTION DESIGN PROCESS:
1. Identify structured/organized information in the transcript: schedules, booking details, registration info, comparison data, surveys, price lists.
2. Design a realistic table or form and create questions for each blank cell.

DESIGN RULES:
- Each question = ONE blank cell in a table, form, or structured document.
- Format the text as: "[Table/Form Title] — [Row/Column label]: _____"
- The answer MUST be 1-3 words taken DIRECTLY from the transcript.
- ALL questions should relate to each other as parts of the SAME table/form — they tell a cohesive story.
- The table structure must feel realistic (like an actual booking form, registration sheet, schedule, or comparison chart).
- Good targets: names, dates, times, reference numbers, prices, locations, phone numbers, email addresses, course codes.

FORMAT:
- options: [] (empty array)
- answer: Exact 1-3 words from the transcript
- Example: text: "Course Registration Form — Student ID: _____" / answer: "STU-4827"`,

    note_completion: `### NOTE / OUTLINE COMPLETION (type: "note_completion")

QUESTION DESIGN PROCESS:
1. Identify the logical structure of the transcript (main topics → sub-topics → key details).
2. Create a set of structured notes/outline with blanks for key information.

DESIGN RULES:
- Each question = ONE blank in organized notes or a summary outline.
- Format: "[Topic/Section heading] — [bullet or sub-heading]: _____"
- The answer MUST be 1-3 words from the transcript.
- Questions should follow the LOGICAL FLOW of the transcript (introduction → main points → details → conclusion).
- Notes should feel like what a student would actually write during a lecture.
- Good targets: key terms, definitions, statistics, examples, names of theories/concepts, conclusions.

FORMAT:
- options: [] (empty array)
- answer: Exact 1-3 words from the transcript
- Example: text: "Environmental Impact — Primary cause of coral bleaching: _____" / answer: "rising sea temperatures"`
  };

  const examContexts = {
    IELTS: `You are a senior IELTS examiner with 15+ years of experience at the British Council, creating an official IELTS Listening practice test.

IELTS LISTENING STANDARDS (strictly follow real IELTS exam conventions):
- Questions MUST progress chronologically following the transcript
- Language register: formal, precise, matching actual Cambridge IELTS papers
- Fill-in-blank / note / table answers: NO MORE THAN THREE WORDS AND/OR A NUMBER
- Multiple choice: exactly 4 options (A-D), with at least 3 distractors from the audio
- Difficulty progression within the section: first questions are easier, last questions are harder
- IELTS distractor techniques you MUST use:
  • Speaker self-corrections: "Actually, I meant..." — the initial wrong answer is a trap
  • Negations: "It's not X, it's Y" — X is the trap
  • Conditional statements: "If we had done X... but instead we chose Y"
  • Similar-sounding information: details that sound alike but differ in meaning
  • Paraphrasing: the correct answer rephrases the transcript, not a word-for-word copy
  • Time/sequence traps: past vs. present vs. future plans`,

    TOEIC: `You are an ETS-certified TOEIC test developer creating an official TOEIC Listening comprehension practice test.

TOEIC LISTENING STANDARDS (following ETS Evidence-Centered Design methodology):
- Focus on business, workplace, and everyday life communication scenarios
- Test practical English comprehension for professional and social contexts
- Correct answers often PARAPHRASE the audio using different vocabulary or sentence structures
- TOEIC distractor techniques:
  • Use words/phrases that SOUND similar to key words in the audio
  • Include information mentioned in the audio but for a DIFFERENT context
  • Offer plausible business-context answers that weren't actually stated
- Difficulty: intermediate to upper-intermediate (450-800 TOEIC score range)
- Questions should reflect real workplace situations: meetings, phone calls, announcements, presentations`,

    VSTEP: `You are a VSTEP exam specialist certified by Vietnam's Ministry of Education, creating a VSTEP Listening test.

VSTEP LISTENING STANDARDS (following the Vietnamese Standardized Test of English Proficiency framework):
- 3-part structure: Part 1 (short dialogues), Part 2 (extended dialogues), Part 3 (lectures/talks)
- Target proficiency levels B1 to C1
- Difficulty distribution: ~40% B1 level, ~34% B2 level, ~26% C1 level
- Focus on: listening for details, listening for gist/main ideas, and listening for attitudes/inferring meaning
- Topics: daily life, academic subjects, semi-formal and formal contexts
- All questions are multiple-choice with 4 options (A-D)
- Questions must be clear, well-structured, and have unambiguous correct answers`,

    GENERAL: `You are a university English professor with expertise in language assessment, designing a listening comprehension exam.

UNIVERSITY EXAM STANDARDS:
- Cover multiple cognitive skills: factual recall, inference, analysis, and evaluation
- Questions must be professional, clear, and academically rigorous
- Balanced difficulty: 30% straightforward, 50% moderate, 20% challenging
- Follow standard language assessment formatting conventions
- Test both explicit information (directly stated) and implicit information (inferred/implied)
- All options and distractors must be well-crafted and plausible`
  };

  const typeRule = typeInstructions[questionType] || '';

  const partNote = partLabel
    ? `\nCRITICAL PART CONSTRAINT: This transcript is from **${partLabel}** of the listening test. You MUST generate ALL questions based ONLY on this part's content. Do NOT reference or use information from other parts.\n`
    : '';

  const customNote = customInstruction
    ? `\nUSER'S CUSTOM INSTRUCTIONS (follow these carefully alongside the rules above):\n"""\n${customInstruction}\n"""\n`
    : '';

  return `${examContexts[examType] || examContexts.GENERAL}
${partNote}
YOUR TASK: Generate EXACTLY ${count} "${questionType}" questions based on the audio transcript below.

ALL ${count} questions MUST be of type "${questionType}".
${customNote}
QUESTION TYPE RULES:

${typeRule}

CRITICAL OUTPUT RULES:
1. Every answer MUST be directly verifiable from the transcript — no assumptions, no outside knowledge.
2. Questions MUST follow the chronological order of the transcript.
3. Each question object MUST contain ALL these fields: number (1-${count}), text (string), type ("${questionType}"), options (string[]), answer (string), explanation (string), transcript_quote (string).
4. For mcq/matching: "options" = labeled choices ["A. ...", "B. ...", ...].
5. For fill_blank/sentence_completion/short_answer/table_completion/note_completion: "options" = [].
6. For true_false: "options" MUST be exactly ["True", "False"]. For true_false_ng: "options" MUST be exactly ["True", "False", "Not Given"]. The "answer" MUST be one of these exact strings.
7. "explanation" MUST follow this format:
   FIRST: Quote the relevant passage from the transcript (in quotation marks).
   THEN: Explain why the answer is correct.
   THEN (for MCQ/matching/T-F): Explain why each wrong option is incorrect, referencing the transcript.
   Example: "The speaker says: 'We moved the deadline to Friday.' This confirms the answer is Friday. Option A (Monday) is mentioned earlier as the original deadline, and Option C (Wednesday) refers to the team meeting day — both are from the audio but answer different questions."
8. "transcript_quote" = the EXACT sentence(s) from the transcript that contain or support the correct answer. Copy VERBATIM (5-50 words). This will be highlighted for the student.
9. Do NOT repeat information across questions. Cover DIFFERENT parts of the transcript content.
10. Questions must be INDISTINGUISHABLE from a real ${examType} exam paper.
11. NEVER create trivial questions (e.g., "How do you spell this name?" or questions about pronunciation).

TRANSCRIPT:
"""
${transcript}
"""

Return JSON: { "questions": [ ...${count} question objects... ] }`;
}

async function generateQuestionsForType(transcript, examType, questionType, count, partLabel, customInstruction) {
  const prompt = buildSingleTypePrompt(transcript, examType, questionType, count, partLabel, customInstruction);
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

function splitTranscriptByParts(transcript) {
  if (!transcript) return [];

  const patterns = [
    /(?:^|\n)\s*={2,}\s*(?:PART|Part)\s*(\d+)\s*={2,}\s*/g,
    /(?:^|\n)\s*(?:PART|Part|SECTION|Section)\s+(\d+)\s*(?:[:\-—.])?\s*/g,
    /(?:^|\n)\s*(?:Part|PART|Section|SECTION)\s+(\d+)\s*$/gm,
  ];

  let matches = [];
  for (const pattern of patterns) {
    matches = [...transcript.matchAll(pattern)];
    if (matches.length >= 2) break;
  }

  if (matches.length < 2) {
    console.log(`[split] No multi-part structure detected`);
    return [{ label: 'Full Transcript', text: transcript.trim() }];
  }

  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : transcript.length;
    const text = transcript.slice(start, end).trim();
    if (text) parts.push({ label: `Part ${matches[i][1]}`, text });
  }
  console.log(`[split] Detected ${parts.length} parts: ${parts.map(p => p.label).join(', ')}`);
  return parts.length > 0 ? parts : [{ label: 'Full Transcript', text: transcript.trim() }];
}

function distributeTypesToParts(parts, types, perType) {
  const assignments = [];
  if (!parts.length || !types.length) return assignments;

  if (types.length <= parts.length) {
    const ppt = Math.floor(parts.length / types.length);
    const rem = parts.length % types.length;
    let pi = 0;
    for (let i = 0; i < types.length; i++) {
      const n = ppt + (i < rem ? 1 : 0);
      const merged = parts.slice(pi, pi + n).map(p => p.text).join('\n\n');
      const labels = parts.slice(pi, pi + n).map(p => p.label).join(' + ');
      assignments.push({ questionType: types[i], transcript: merged, partLabel: labels, count: perType });
      pi += n;
    }
  } else {
    const tpp = Math.floor(types.length / parts.length);
    const rem = types.length % parts.length;
    let ti = 0;
    for (let i = 0; i < parts.length; i++) {
      const n = tpp + (i < rem ? 1 : 0);
      for (let j = 0; j < n; j++) {
        assignments.push({ questionType: types[ti], transcript: parts[i].text, partLabel: parts[i].label, count: perType });
        ti++;
      }
    }
  }
  return assignments;
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
  try { db.exec('ALTER TABLE questions ADD COLUMN transcript_quote TEXT DEFAULT ""'); } catch { }

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

  // ---- Gemini: Transcribe audio (File API for large files) ----
  app.post('/api/transcribe', async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'No filename provided' });
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio file not found on server' });

    const ext = path.extname(filename).toLowerCase();
    const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.webm': 'audio/webm' };
    const mimeType = mimeMap[ext] || 'audio/mpeg';
    const fileSizeKB = fs.statSync(filePath).size / 1024;

    console.log(`[transcribe] File: ${filename} (${fileSizeKB.toFixed(0)} KB, ${mimeType})`);

    const transcribePrompt = `Transcribe this English audio accurately and completely.

CRITICAL FORMATTING RULES:
1. If the audio contains distinct sections or parts (like IELTS Listening Part 1, Part 2, Part 3, Part 4), you MUST label each section clearly with "=== PART X ===" on its own line BEFORE the content of that section.
2. Use proper punctuation and paragraph breaks within each part.
3. If there are clearly distinct speakers, label them (e.g., "Speaker 1:", "Speaker 2:").
4. Output ONLY the transcript text. Do not add commentary or timestamps.
5. Make sure every word is captured — do NOT skip or summarize any section.

Example format for multi-part audio:
=== PART 1 ===
Speaker 1: Hello, welcome to...
Speaker 2: Thank you...

=== PART 2 ===
Speaker 1: Now let's discuss...`;

    try {
      console.log(`[transcribe] Uploading to Gemini File API...`);
      const uploadResult = await ai.files.upload({
        file: filePath,
        config: { mimeType, displayName: filename }
      });
      console.log(`[transcribe] Upload done: ${uploadResult.name}, waiting for processing...`);

      let file = uploadResult;
      let waited = 0;
      while (file.state === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 3000));
        waited += 3;
        file = await ai.files.get({ name: file.name });
        console.log(`[transcribe] Processing... (${waited}s)`);
      }
      if (file.state === 'FAILED') throw new Error('Gemini failed to process the audio file');

      console.log(`[transcribe] File ready (state: ${file.state}), generating transcript...`);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
            { text: transcribePrompt }
          ]
        }]
      });

      ai.files.delete({ name: file.name }).catch(() => {});

      const text = response.text || '';
      console.log(`[transcribe] Success (${text.length} chars): ${text.slice(0, 120)}...`);
      res.json({ text });
    } catch (e) {
      console.error('[transcribe] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Gemini: Generate questions (part-aware parallel) ----
  app.post('/api/generate-questions', async (req, res) => {
    const { transcript, examType, questionTypes, questionsPerType, customInstructions } = req.body;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
    if (!transcript) return res.status(400).json({ error: 'No transcript provided' });

    const types = Array.isArray(questionTypes) && questionTypes.length > 0 ? questionTypes : ['mcq'];
    const perType = Math.min(Math.max(Number(questionsPerType) || 10, 1), 50);
    const ciMap = customInstructions || {};

    const parts = splitTranscriptByParts(transcript);
    const hasParts = parts.length > 1;

    let assignments;
    if (hasParts) {
      assignments = distributeTypesToParts(parts, types, perType);
      assignments.forEach(a => { a.customInstruction = ciMap[a.questionType] || ciMap._global || null; });
      console.log(`[generate] Part-aware mode: ${parts.length} parts detected, ${assignments.length} assignments`);
      assignments.forEach(a => console.log(`  → ${a.partLabel} ↔ ${a.questionType} (${a.count} Qs)${a.customInstruction ? ' [+custom]' : ''}`));
    } else {
      assignments = types.map(t => ({ questionType: t, transcript: transcript, partLabel: null, count: perType, customInstruction: ciMap[t] || ciMap._global || null }));
      console.log(`[generate] Single transcript mode: ${types.length} types × ${perType}/type`);
    }

    const total = assignments.reduce((s, a) => s + a.count, 0);
    console.log(`[generate] ${examType} | ${total} total questions | transcript: ${transcript.length} chars`);

    try {
      const results = await Promise.allSettled(
        assignments.map(a => {
          console.log(`[generate] Starting ${a.questionType}${a.partLabel ? ` (${a.partLabel})` : ''} (${a.count} questions)${a.customInstruction ? ' [+custom]' : ''}...`);
          return generateQuestionsForType(a.transcript, examType, a.questionType, a.count, a.partLabel, a.customInstruction);
        })
      );

      const allQuestions = [];
      let num = 1;
      const errors = [];
      for (let i = 0; i < assignments.length; i++) {
        const r = results[i];
        const a = assignments[i];
        if (r.status === 'fulfilled' && r.value?.length) {
          console.log(`[generate] ✓ ${a.questionType}${a.partLabel ? ` (${a.partLabel})` : ''}: ${r.value.length} questions`);
          for (const q of r.value) {
            q.number = num++;
            if (a.partLabel) q.part_label = a.partLabel;
            allQuestions.push(q);
          }
        } else {
          const msg = r.status === 'rejected' ? r.reason?.message : 'No questions returned';
          console.error(`[generate] ✗ ${a.questionType}: ${msg}`);
          errors.push(`${a.questionType}: ${msg}`);
        }
      }

      if (!allQuestions.length) throw new Error('All generation failed: ' + errors.join('; '));

      const partInfo = hasParts ? ` (${parts.length} Parts)` : '';
      console.log(`[generate] Done: ${allQuestions.length}/${total} questions generated`);
      res.json({
        section_number: 1,
        instruction: `${examType} Listening Comprehension${partInfo} — ${allQuestions.length} Questions`,
        questions: allQuestions
      });
    } catch (e) {
      console.error('[generate] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Gemini: Regenerate single type ----
  app.post('/api/regenerate-type', async (req, res) => {
    const { transcript, examType, questionType, count, customInstruction } = req.body;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
    if (!transcript) return res.status(400).json({ error: 'No transcript provided' });
    const perType = Math.min(Math.max(Number(count) || 10, 1), 50);
    console.log(`[regenerate-type] ${questionType} × ${perType}${customInstruction ? ' [+custom]' : ''}`);
    try {
      const questions = await generateQuestionsForType(transcript, examType, questionType, perType, null, customInstruction || null);
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
