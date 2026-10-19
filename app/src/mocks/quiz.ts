// Mock for POST /api/quiz/question: 15 questions across the four training topics, plus
// fill-the-gap questions generated from pasted notes so "My notes" works offline too.
import type { QuizQuestion, QuizRequest } from '../api/quiz';

type Topic = 'cv' | 'rag' | 'chatbots' | 'llms';
const BANK: (QuizQuestion & { topic: Topic })[] = [
  { topic: 'cv', id: 'cv-1', question: 'What slides across an image in a convolutional layer?', options: ['A filter (kernel)', 'A prompt', 'A query vector', 'A token'], answerIndex: 0, explanation: 'A small filter slides over the image and responds to patterns like edges.', source: { title: 'cv_intro.pdf', page: 12 } },
  { topic: 'cv', id: 'cv-2', question: 'How many landmarks does a MediaPipe hand model return per hand?', options: ['5', '12', '21', '68'], answerIndex: 2, explanation: 'The hand landmarker returns 21 points: the wrist plus 4 per finger.', source: { title: 'cv_week2_slides.pdf', page: 7 } },
  { topic: 'cv', id: 'cv-3', question: 'What does object detection add on top of image classification?', options: ['Colour correction', 'Where each object is, as a box', 'Higher resolution', 'Audio labels'], answerIndex: 1, explanation: 'Detection returns a class and a bounding box for each object.', source: { title: 'cv_intro.pdf', page: 21 } },
  { topic: 'cv', id: 'cv-4', question: 'Why flip the webcam image before showing it to a player?', options: ['It runs faster', 'So it acts like a mirror', 'It removes noise', 'The model needs it'], answerIndex: 1, explanation: 'A mirrored preview makes left feel like left, which players expect.', source: { title: 'notes_week1.pdf', page: 3 } },
  { topic: 'rag', id: 'rag-1', question: 'Which step turns text into vectors?', options: ['Tokenizer', 'Embedding model', 'Retriever', 'Reranker'], answerIndex: 1, explanation: 'An embedding model maps text to a vector so similar meanings land close together.', source: { title: 'notes_week3.pdf', page: 4 } },
  { topic: 'rag', id: 'rag-2', question: 'Why split documents into passages before embedding?', options: ['To save disk space', 'Short passages match a question more precisely', 'Embeddings need exactly 10 words', 'To hide the source'], answerIndex: 1, explanation: 'Smaller chunks keep one idea each, so retrieval finds the right part.', source: { title: 'notes_week3.pdf', page: 4 } },
  { topic: 'rag', id: 'rag-3', question: 'What does the retriever return for a question?', options: ['The final answer', 'The closest passages from the index', 'A new embedding model', 'A list of users'], answerIndex: 1, explanation: 'The retriever finds the passages whose vectors are nearest to the question.', source: { title: 'rag_slides.pptx', page: 11 } },
  { topic: 'rag', id: 'rag-4', question: 'Why show the source of a RAG answer?', options: ['It looks nicer', 'So people can check the answer', 'It makes the model faster', 'It is required by HTML'], answerIndex: 1, explanation: 'Citations let readers verify the answer against the original text.', source: { title: 'rag_slides.pptx', page: 15 } },
  { topic: 'chatbots', id: 'bot-1', question: 'How do you stop a chatbot making things up?', options: ['More emoji', 'Lower the volume', 'Ground it in retrieved text', 'Use a bigger font'], answerIndex: 2, explanation: 'Grounding answers in retrieved text, and saying "I don\'t know" otherwise, cuts made-up facts.', source: { title: 'chatbots.pdf', page: 7 } },
  { topic: 'chatbots', id: 'bot-2', question: 'What is the system prompt for?', options: ['Storing passwords', 'Setting the bot\'s role and rules', 'Counting tokens', 'Training the model'], answerIndex: 1, explanation: 'The system prompt tells the model who it is and what it may do.', source: { title: 'chatbots.pdf', page: 3 } },
  { topic: 'chatbots', id: 'bot-3', question: 'Why send recent chat history with each message?', options: ['So the bot remembers the conversation', 'To make requests smaller', 'To change the language', 'It is never needed'], answerIndex: 0, explanation: 'Models are stateless; history in the request is how they follow a conversation.', source: { title: 'chatbots.pdf', page: 9 } },
  { topic: 'chatbots', id: 'bot-4', question: 'What does streaming a reply improve?', options: ['Answer accuracy', 'How fast the first words appear', 'Model size', 'Security'], answerIndex: 1, explanation: 'Streaming shows tokens as they are made, so users see a reply sooner.', source: { title: 'notes_week4.pdf', page: 6 } },
  { topic: 'llms', id: 'llm-1', question: 'What is a token?', options: ['A login code', 'A chunk of text the model reads and writes', 'A GPU core', 'A type of embedding database'], answerIndex: 1, explanation: 'Models read and write text as tokens: words or pieces of words.', source: { title: 'llm_basics.pdf', page: 2 } },
  { topic: 'llms', id: 'llm-2', question: 'What does a higher temperature usually do?', options: ['More varied, less predictable output', 'Shorter answers only', 'Fewer tokens used', 'Stops the model'], answerIndex: 0, explanation: 'Temperature adds randomness to sampling: higher gives more variety.', source: { title: 'llm_basics.pdf', page: 9 } },
  { topic: 'llms', id: 'llm-3', question: 'What limits how much text a model can consider at once?', options: ['The font', 'The context window', 'The screen size', 'The temperature'], answerIndex: 1, explanation: 'The context window is the maximum number of tokens in one request and reply.', source: { title: 'llm_basics.pdf', page: 5 } },
];

const STOP = new Set('about above after again against because before being below between could does doing during every first further having however itself might other should their there these those through under until where which while would'.split(' '));

function notesQuestion(text: string, title: string, asked: Set<string>): QuizQuestion | null {
  // Split by the "[page N]" markers the PDF reader adds; plain text is page 1.
  const pages = text.split(/\[page (\d+)\]/);
  const sentences: { s: string; page: number }[] = [];
  if (pages.length === 1) pages.unshift('', '1');
  for (let i = 1; i < pages.length; i += 2) {
    const page = Number(pages[i]);
    for (const s of (pages[i + 1] ?? '').split(/(?<=[.!?])\s+/)) {
      const clean = s.replace(/\s+/g, ' ').trim();
      if (clean.split(' ').length >= 7 && clean.length < 260) sentences.push({ s: clean, page });
    }
  }
  const words = [...new Set((text.match(/[A-Za-z][A-Za-z-]{5,}/g) ?? []).map((w) => w.toLowerCase()))].filter((w) => !STOP.has(w));
  const order = sentences.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order) {
    const { s, page } = sentences[i];
    const candidates = (s.match(/[A-Za-z][A-Za-z-]{5,}/g) ?? []).filter((w) => !STOP.has(w.toLowerCase()));
    if (!candidates.length) continue;
    const answer = candidates.sort((a, b) => b.length - a.length)[0];
    const id = `notes-${page}-${answer.toLowerCase()}`;
    if (asked.has(id)) continue;
    const pool = words.filter((w) => w !== answer.toLowerCase());
    if (pool.length < 3) return null;
    const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [answer.toLowerCase(), ...wrong].sort(() => Math.random() - 0.5);
    return {
      id,
      question: `Fill the gap: "${s.replace(answer, '_____')}"`,
      options,
      answerIndex: options.indexOf(answer.toLowerCase()),
      explanation: `From your notes: "${s}"`,
      source: { title, page },
    };
  }
  return null;
}

export async function mockQuestion(req: QuizRequest): Promise<QuizQuestion> {
  await new Promise((r) => setTimeout(r, 350));
  const asked = new Set(req.askedIds);
  if (typeof req.deck !== 'string') {
    const q = notesQuestion(req.deck.text, req.deck.title ?? 'Your notes', asked);
    if (q) return q;
    throw new Error('Your notes are too short to write more questions. Paste a longer passage.');
  }
  // The chosen topic first, then the rest of the bank so a 10-question game never runs dry.
  const fresh = BANK.filter((q) => !asked.has(q.id));
  const pick = fresh.filter((q) => q.topic === req.deck);
  const from = pick.length ? pick : fresh.length ? fresh : BANK;
  const { topic: _topic, ...q } = from[Math.floor(Math.random() * from.length)];
  return q;
}
