import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import cors from 'cors';
import 'dotenv/config';
import { extractPdfText, extractPdfMetadata } from './pdf-utils.mjs';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const port = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    return allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type. Only TXT, PDF, DOCX, and DOC are allowed.'));
  }
});

const extractDocxText = async (filePath) => {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error("Error extracting DOCX text:", error);
    throw new Error("Failed to extract text from DOCX");
  }
};

const extractTxtText = (filePath) => fs.readFileSync(filePath, 'utf-8');
const truncateContent = (content, maxLength = 100000) => content.length <= maxLength ? content : content.substring(0, maxLength);

app.post('/generate-questions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { numQuestions = 5, difficulty = 'medium' } = req.body;
    const filePath = req.file.path;
    const fileType = req.file.mimetype;

    let fileContent = '';
    let metadata = null;

    if (fileType === 'application/pdf') {
      fileContent = await extractPdfText(filePath);
      metadata = await extractPdfMetadata(filePath);
    } else if (fileType.includes('wordprocessingml.document') || fileType.includes('msword')) {
      fileContent = await extractDocxText(filePath);
    } else if (fileType === 'text/plain') {
      fileContent = extractTxtText(filePath);
    }

    if (!fileContent.trim()) return res.status(400).json({ error: "Failed to extract content or file is empty" });

    fileContent = truncateContent(fileContent);

    const prompt = `
      Generate ${numQuestions} multiple-choice questions (MCQs) based on the following document content. 
      The questions should be of ${difficulty} difficulty level.
      
      Format:
      [
        { "question": "Question text?", "options": ["A", "B", "C", "D"], "correctAnswer": "Correct option", "explanation": "Why it's correct" }
      ]
      
      Here is the document content:
      ${fileContent}
    `;

    console.log("Sending request to Gemini API...");
    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) throw new Error("Could not parse response format from API");

    const questions = JSON.parse(jsonMatch[0]);
    fs.unlink(filePath, (err) => { if (err) console.error("Error deleting file:", err); });

    res.json({ 
      questions,
      metadata: { fileType, fileSize: req.file.size, fileName: req.file.originalname, pdfInfo: metadata }
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred" });
  }
});

// Endpoint to check if the user's answer is correct
app.post('/check-answer', (req, res) => {
  try {
    const { question, options, correctAnswer, userAnswer } = req.body;

    if (!question || !options || !correctAnswer || !userAnswer) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Trim and compare answers case-insensitively
    const isCorrect = userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    res.json({
      question,
      userAnswer,
      correctAnswer,
      isCorrect,
      message: isCorrect ? "Correct answer!" : "Incorrect answer."
    });

  } catch (error) {
    console.error("Error checking answer:", error);
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});


app.get('/', (req, res) => res.send('MCQ Generator API is running'));
app.listen(port, () => console.log(`Server running on port ${port}`));
