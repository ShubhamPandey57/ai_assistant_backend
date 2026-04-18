const Groq = require('groq-sdk');

const getGroq = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error('GROQ_API_KEY is not configured. Please add it to your .env file.');
  }
  return new Groq({ apiKey });
};

// Truncate text to stay within token limits (~12k tokens ≈ 48k chars)
const truncateText = (text, maxChars = 40000) => {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n\n[Document truncated for processing...]';
};

const askQuestion = async (documentText, question, history = []) => {
  const groq = getGroq();

  const truncated = truncateText(documentText);

  const systemPrompt = `You are an AI study assistant. Your role is to help students understand their study materials.
You have been given the following document content to answer questions about:

--- DOCUMENT CONTENT ---
${truncated}
--- END OF DOCUMENT ---

Answer questions based on the document content above. If the answer isn't in the document, say so clearly.
Be concise, accurate, and student-friendly.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
      content: String(msg.content || msg.parts?.[0]?.text || ''),
    })),
    { role: 'user', content: question },
  ];

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
  });

  return result.choices[0].message.content;
};

const summarize = async (documentText, format = 'bullets') => {
  const groq = getGroq();
  const truncated = truncateText(documentText);

  const formatInstructions = {
    bullets: 'Generate a bullet-point summary with the key concepts and main points. Use clear, concise bullet points (• symbol). Aim for 8-15 bullets.',
    paragraph: 'Generate a short paragraph summary (3-5 sentences) that captures the most important aspects of the document.',
    detailed: 'Generate a detailed explanation that thoroughly covers all major topics, concepts, and important details. Use headers and structured formatting for clarity.',
  };

  const prompt = `You are an AI study assistant. Summarize the following study material.

${formatInstructions[format] || formatInstructions.bullets}

--- DOCUMENT CONTENT ---
${truncated}
--- END OF DOCUMENT ---

Summary:`;

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
  });

  return result.choices[0].message.content;
};

const generateFlashcards = async (documentText) => {
  const groq = getGroq();
  const truncated = truncateText(documentText);

  const prompt = `You are an AI study assistant. Generate study flashcards from the following document.

Create 8-12 flashcard Q&A pairs that cover the most important concepts, definitions, and facts.
Return ONLY a valid JSON array with no extra text or markdown codeblocks formatting, in this exact format:
[
  {"question": "Question here?", "answer": "Answer here."}
]

--- DOCUMENT CONTENT ---
${truncated}
--- END OF DOCUMENT ---

JSON flashcards:`;

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = result.choices[0].message.content.trim();

  // Extract JSON from the response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI did not return valid flashcard JSON');

  const flashcards = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(flashcards)) throw new Error('Flashcard response is not an array');

  return flashcards.slice(0, 15); // Cap at 15
};

module.exports = { askQuestion, summarize, generateFlashcards };
