// js/chatShare.js

export function sanitizeFileName(value) {
  return String(value || "PassSabi-Chat")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function getExportBaseName(session) {
  const title = sanitizeFileName(session?.title || "PassSabi-Chat");
  const date = new Date().toISOString().slice(0, 10);
  return `PassSabi-${title}-${date}`;
}

export function buildPlainTextExport(session) {
  const lines = [];
  const createdAt = session?.createdAt ? new Date(session.createdAt) : new Date();

  lines.push("PassSabi AI Chat");
  lines.push(`Title: ${session?.title || "New Chat"}`);
  lines.push(`Created: ${createdAt.toLocaleString()}`);
  lines.push(`Pinned: ${session?.pinned ? "Yes" : "No"}`);
  lines.push("");
  lines.push("Conversation");
  lines.push("------------");
  lines.push("");

  (session?.messages || []).forEach(function (msg) {
    const speaker = msg.role === "assistant" ? "PassSabi AI" : "You";
    lines.push(`${speaker}:`);
    lines.push(String(msg.text || "").trim());
    lines.push("");
  });

  return lines.join("\n").trim();
}

export function buildMarkdownExport(session) {
  const lines = [];
  const createdAt = session?.createdAt ? new Date(session.createdAt) : new Date();

  lines.push(`# PassSabi AI Chat`);
  lines.push("");
  lines.push(`**Title:** ${session?.title || "New Chat"}`);
  lines.push(`**Created:** ${createdAt.toLocaleString()}`);
  lines.push(`**Pinned:** ${session?.pinned ? "Yes" : "No"}`);
  lines.push("");
  lines.push(`## Conversation`);
  lines.push("");

  (session?.messages || []).forEach(function (msg) {
    const speaker = msg.role === "assistant" ? "PassSabi AI" : "You";
    lines.push(`### ${speaker}`);
    lines.push("");
    lines.push(String(msg.text || "").trim());
    lines.push("");
  });

  return lines.join("\n").trim();
}

export async function copyTextToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) return false;

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const temp = document.createElement("textarea");
  temp.value = value;
  temp.setAttribute("readonly", "");
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  }

  document.body.removeChild(temp);
  return success;
}

export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], {
    type: mimeType || "text/plain;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function createChatShareController({
  getCurrentSession,
  toggleCurrentChatPin,
}) {
  async function handleShareAction(action) {
    const session = typeof getCurrentSession === "function" ? getCurrentSession() : null;
    if (!session) return;

    const baseName = getExportBaseName(session);
    const plainText = buildPlainTextExport(session);
    const markdown = buildMarkdownExport(session);

    if (action === "pin") {
      if (typeof toggleCurrentChatPin === "function") {
        toggleCurrentChatPin();
      }
      return;
    }

    if (action === "native-share") {
      const shareData = {
        title: session.title || "PassSabi AI Chat",
        text: plainText,
        url: window.location.href,
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await copyTextToClipboard(plainText);
        }
      } catch (error) {
        console.warn("Native share failed:", error);
      }

      return;
    }

    if (action === "txt") {
      downloadTextFile(`${baseName}.txt`, plainText, "text/plain;charset=utf-8");
      return;
    }

    if (action === "md") {
      downloadTextFile(`${baseName}.md`, markdown, "text/markdown;charset=utf-8");
    }
  }

  return {
    handleShareAction,
  };
}
