function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(text) {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

export function cleanReply(text) {
  return String(text || "").trim();
}

function renderInlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = linkify(out);
  return out;
}

function normalizeNumberedLines(text) {
  let current = 1;
  let insideNumberedList = false;

  return String(text || "")
    .split(/\r?\n/)
    .map(function (line) {
      const trimmed = line.trim();

      if (!trimmed) {
        insideNumberedList = false;
        current = 1;
        return line;
      }

      const match = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (!match) {
        insideNumberedList = false;
        return line;
      }

      if (!insideNumberedList) {
        current = 1;
        insideNumberedList = true;
      }

      return `${match[1]}${current++}. ${match[2]}`;
    })
    .join("\n");
}

function stowToken(stash, html) {
  const token = `__TOKEN_${stash.length}__`;
  stash.push({ token, html });
  return token;
}

function restoreTokens(text, stash) {
  let out = text;
  stash.forEach(function (item) {
    out = out.split(item.token).join(item.html);
  });
  return out;
}

function highlightCode(code, lang) {
  const lower = String(lang || "").toLowerCase();
  let out = escapeHtml(code.trimEnd());
  const stash = [];

  function protect(regex, cls) {
    out = out.replace(regex, function (match) {
      return stowToken(stash, `<span class="${cls}">${match}</span>`);
    });
  }

  if (["js", "javascript", "ts", "typescript", "jsx", "tsx"].includes(lower)) {
    protect(/\/\*[\s\S]*?\*\//g, "token-comment");
    protect(/\/\/[^\n]*/g, "token-comment");
    protect(
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g,
      "token-string"
    );

    out = out.replace(
      /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|try|catch|finally|throw|async|await|import|from|export|default|true|false|null|undefined|this|super|of|in|typeof|instanceof|void)\b/g,
      function (match) {
        return stowToken(stash, `<span class="token-keyword">${match}</span>`);
      }
    );

    out = out.replace(/\b\d+(\.\d+)?\b/g, function (match) {
      return stowToken(stash, `<span class="token-number">${match}</span>`);
    });
  } else if (["py", "python"].includes(lower)) {
    protect(/#[^\n]*/g, "token-comment");
    protect(
      /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
      "token-string"
    );

    out = out.replace(
      /\b(?:def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|lambda|pass|True|False|None|and|or|not|in|is)\b/g,
      function (match) {
        return stowToken(stash, `<span class="token-keyword">${match}</span>`);
      }
    );

    out = out.replace(/\b\d+(\.\d+)?\b/g, function (match) {
      return stowToken(stash, `<span class="token-number">${match}</span>`);
    });
  } else if (["json"].includes(lower)) {
    out = out.replace(
      /"(?:\\.|[^"\\])*"(?=\s*:)/g,
      function (match) {
        return stowToken(stash, `<span class="token-attr">${match}</span>`);
      }
    );

    out = out.replace(
      /"(?:\\.|[^"\\])*"|true|false|null|\b\d+(\.\d+)?\b/g,
      function (match) {
        if (match === "true" || match === "false" || match === "null") {
          return stowToken(stash, `<span class="token-boolean">${match}</span>`);
        }
        if (/^\d/.test(match)) {
          return stowToken(stash, `<span class="token-number">${match}</span>`);
        }
        return stowToken(stash, `<span class="token-string">${match}</span>`);
      }
    );
  } else if (["bash", "sh", "shell", "zsh"].includes(lower)) {
    protect(/#[^\n]*/g, "token-comment");
    protect(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, "token-string");

    out = out.replace(
      /\b(?:cd|ls|pwd|mkdir|rm|cp|mv|touch|cat|echo|npm|node|git|curl|wget|chmod|sudo|apt|yum|pip|python|bash|sh|zsh|export|return|if|then|else|fi|for|in|do|done)\b/g,
      function (match) {
        return stowToken(stash, `<span class="token-keyword">${match}</span>`);
      }
    );
  } else if (["html", "xml"].includes(lower)) {
    out = out.replace(
      /(&lt;\/?)([a-zA-Z][\w:-]*)([\s\S]*?&gt;)/g,
      function (_, open, tag, rest) {
        const tagHtml = `${open}<span class="token-tag">${tag}</span>${rest}`;
        return stowToken(stash, tagHtml);
      }
    );
  } else if (["css"].includes(lower)) {
    protect(/\/\*[\s\S]*?\*\//g, "token-comment");
    protect(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, "token-string");

    out = out.replace(
      /\b[a-z-]+(?=\s*:)/g,
      function (match) {
        return stowToken(stash, `<span class="token-attr">${match}</span>`);
      }
    );
  } else {
    protect(/\/\*[\s\S]*?\*\//g, "token-comment");
    protect(/\/\/[^\n]*/g, "token-comment");
  }

  return restoreTokens(out, stash);
}

function renderCodeBlock(code, lang) {
  const language = String(lang || "").toLowerCase() || "text";
  const highlighted = highlightCode(code, language);
  return `<pre class="md-code"><code class="language-${language} code-${language}">${highlighted}</code></pre>`;
}

export function renderMarkdown(text) {
  const raw = normalizeNumberedLines(cleanReply(text));
  if (!raw) return "";

  const codeBlocks = [];
  let safe = raw.replace(/```([\w-]+)?\s*\n?([\s\S]*?)```/g, function (_, lang, code) {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({
      token,
      lang: String(lang || "").toLowerCase(),
      code,
    });
    return token;
  });

  const lines = safe.split(/\r?\n/);
  const html = [];
  let inUl = false;
  let inOl = false;
  let inPara = false;

  function closeLists() {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  }

  function closePara() {
    if (inPara) {
      html.push("</p>");
      inPara = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closePara();
      closeLists();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      closePara();
      closeLists();

      const level = Math.min(trimmed.match(/^#{1,6}/)[0].length, 6);
      const content = trimmed.replace(/^#{1,6}\s+/, "");
      html.push(
        `<h${level} class="md-h">${renderInlineMarkdown(content)}</h${level}>`
      );
      continue;
    }

    if (/^\-\s+/.test(trimmed)) {
      closePara();
      if (!inUl) {
        closeLists();
        html.push('<ul class="md-list">');
        inUl = true;
      }
      html.push(
        `<li>${renderInlineMarkdown(trimmed.replace(/^\-\s+/, ""))}</li>`
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      closePara();
      if (!inOl) {
        closeLists();
        html.push('<ol class="md-list">');
        inOl = true;
      }
      html.push(
        `<li>${renderInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ""))}</li>`
      );
      continue;
    }

    closeLists();
    if (!inPara) {
      html.push('<p class="md-p">');
      inPara = true;
    } else {
      html.push("<br>");
    }
    html.push(renderInlineMarkdown(trimmed));
  }

  closePara();
  closeLists();

  let out = html.join("");

  codeBlocks.forEach(function (block) {
    out = out.split(block.token).join(renderCodeBlock(block.code, block.lang));
  });

  return out;
            }
