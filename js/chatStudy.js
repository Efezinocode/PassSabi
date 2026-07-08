// js/chatStudy.js

export function buildStudyModePrompt(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (
    lower.includes("do an exam") ||
    lower.includes("practice exam") ||
    lower.includes("mock exam") ||
    lower.includes("exam me") ||
    lower.includes("test me") ||
    lower.includes("set an exam")
  ) {
    return {
      visibleText: text,
      promptText:
        "Create a full practice exam for a student on this topic. Give exactly 30 objective questions, numbered from 1 to 30, each with 4 options (A, B, C, D) and the correct answer after each question. After the objectives, add a theory section with 5 theory questions. Keep the numbering sequential and never restart at 1.\n\nTopic:\n" +
        text,
    };
  }

  if (
    lower.includes("quiz me") ||
    lower.includes("quiz") ||
    lower.includes("give me a quiz")
  ) {
    return {
      visibleText: text,
      promptText:
        "Create a short quiz on this topic with only 3 to 5 questions. Number the questions properly from 1 onward and do not restart at 1. Keep it simple and student-friendly.\n\nTopic:\n" +
        text,
    };
  }

  return null;
}

export function buildLessonPrompt(action, answerText, session) {
  const lastUser = session
    ? [...session.messages].reverse().find(function (msg) {
        return msg.role === "user";
      })
    : null;

  const topic = String(
    lastUser?.text || answerText || session?.title || "this topic"
  ).trim();

  if (action === "explain") {
    return {
      visibleText: "Explain again",
      promptText:
        "Explain this topic in simpler words for a student. Use short sentences, step by step, and make it easy to understand. If you number items, number them properly as 1., 2., 3. and do not repeat 1.\n\nTopic:\n" +
        topic,
    };
  }

  if (action === "example") {
    return {
      visibleText: "Give example",
      promptText:
        "Give one or two simple real-life examples for this topic and explain them clearly. If you number items, number them properly as 1., 2., 3. and do not repeat 1.\n\nTopic:\n" +
        topic,
    };
  }

  if (action === "quiz") {
    return {
      visibleText: "Quiz me",
      promptText:
        "Create a short quiz on this topic with only 3 to 5 questions. Number the questions properly from 1 onward and do not restart at 1. Keep it simple for a student.\n\nTopic:\n" +
        topic,
    };
  }

  return null;
}
