/**
 * BMAD Studio - Markdown Renderer
 * Zero dependencies, secure vanilla markdown parser with GFM features,
 * safe syntax highlighting, and file link detection.
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Light syntax highlighting for code blocks
  function highlightCode(escapedCode, lang) {
    if (!escapedCode) return '';
    const l = (lang || '').toLowerCase().trim();

    // Protect strings first
    const strings = [];
    let s = escapedCode.replace(/(&quot;[\s\S]*?&quot;|&#039;[\s\S]*?&#039;|`[\s\S]*?`)/g, function (m) {
      strings.push(m);
      return '___STR_' + (strings.length - 1) + '___';
    });

    // Protect comments
    const comments = [];
    if (['js', 'ts', 'jsx', 'tsx', 'javascript', 'typescript', 'java', 'cs', 'csharp', 'go', 'c', 'cpp', 'json'].indexOf(l) !== -1) {
      s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, function (m) {
        comments.push(m);
        return '___COMM_' + (comments.length - 1) + '___';
      });
    } else if (['py', 'python', 'sh', 'bash', 'zsh', 'yaml', 'yml'].indexOf(l) !== -1) {
      s = s.replace(/(#[^\n]*)/g, function (m) {
        comments.push(m);
        return '___COMM_' + (comments.length - 1) + '___';
      });
    }

    // Highlight keywords
    const kwRegex = /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|extends|new|this|typeof|instanceof|async|await|try|catch|finally|throw|switch|case|break|continue|default|def|self|yield|elif|is|not|in|package|public|private|protected|static|void|interface|implements|struct|type|func|select|where|insert|update|delete|true|false|null|undefined|None|True|False)\b/g;
    s = s.replace(kwRegex, '<span class="tok-kw">$1</span>');

    // Highlight numbers
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');

    // Restore comments
    s = s.replace(/___COMM_(\d+)___/g, function (_, idx) {
      return '<span class="tok-comm">' + comments[Number(idx)] + '</span>';
    });

    // Restore strings
    s = s.replace(/___STR_(\d+)___/g, function (_, idx) {
      return '<span class="tok-str">' + strings[Number(idx)] + '</span>';
    });

    return s;
  }

  // Extensions considered project file paths
  const FILE_EXTS = 'js|mjs|cjs|ts|mts|cts|jsx|tsx|json|md|py|html|css|scss|less|go|rs|java|c|cpp|h|hpp|cs|sh|bash|zsh|yml|yaml|sql|env|txt|toml|vue|svelte|rb|php|swift|kt|dart';
  const FILE_PATH_REGEX = new RegExp('\\b((?:[a-zA-Z0-9_\\-\\.]+\\/)+[a-zA-Z0-9_\\-\\.]+\\.(?:' + FILE_EXTS + ')|[a-zA-Z0-9_\\-\\.]+\\.(?:' + FILE_EXTS + '))(?::(\\d+))?\\b', 'g');

  function isLikelyFilePath(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    return new RegExp('^((?:[a-zA-Z0-9_\\-\\.]+\\/)+[a-zA-Z0-9_\\-\\.]+\\.(?:' + FILE_EXTS + ')|[a-zA-Z0-9_\\-\\.]+\\.(?:' + FILE_EXTS + '))(?::(\\d+))?$').test(trimmed);
  }

  function formatFileLinks(htmlText, protect) {
    return htmlText.replace(FILE_PATH_REGEX, function (match, path, line) {
      const lineAttr = line ? ' data-line="' + line + '"' : '';
      const html = '<a class="file-link" data-path="' + path + '"' + lineAttr + ' href="#" title="Abrir ' + match + '">' + match + '</a>';
      return protect ? protect(html) : html;
    });
  }

  // Marcadores em área de uso privado Unicode: não colidem com texto, _ ou * do markdown
  const PH_OPEN = '';
  const PH_CLOSE = '';

  function inlineFormat(text) {
    if (!text) return '';

    const inlineCodes = [];
    const protect = function (html) {
      inlineCodes.push(html);
      return PH_OPEN + (inlineCodes.length - 1) + PH_CLOSE;
    };

    // 1. Protect inline code `...`
    let s = text.replace(/`([^`\n]+)`/g, function (_, codeText) {
      const trimmed = codeText.trim();
      let rendered;
      if (isLikelyFilePath(trimmed)) {
        const parts = trimmed.split(':');
        const path = parts[0];
        const line = parts[1] || '';
        const lineAttr = line ? ' data-line="' + line + '"' : '';
        rendered = '<a class="file-link" data-path="' + path + '"' + lineAttr + ' href="#" title="Abrir ' + trimmed + '"><code>' + codeText + '</code></a>';
      } else {
        rendered = '<code>' + codeText + '</code>';
      }
      return protect(rendered);
    });

    // 2. Links: [text](http(s)://...) or mailto: — protegidos para a URL não virar file-link/itálico
    s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s\)]+)\)/g, function (_, title, url) {
      return protect('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + title + '</a>');
    });
    // URLs soltas
    s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, function (url) {
      return protect('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>');
    });

    // 3. File path detection in normal text
    s = formatFileLinks(s, protect);

    // 4. Bold and Italic and Strikethrough (_ só conta nas bordas de palavra: snake_case fica intacto)
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w])__([^_\n]+)__(?!\w)/g, '$1<strong>$2</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    // 5. Restore protected segments
    s = s.replace(new RegExp(PH_OPEN + '(\\d+)' + PH_CLOSE, 'g'), function (_, idx) {
      return inlineCodes[Number(idx)];
    });

    return s;
  }

  function parseTable(lines, startIdx) {
    const headerLine = lines[startIdx];
    const sepLine = lines[startIdx + 1];

    if (!sepLine || !/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(sepLine.trim())) {
      return null;
    }

    function splitRow(line) {
      const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
      return trimmed.split('|').map(function (c) { return c.trim(); });
    }

    const headers = splitRow(headerLine);
    const alignments = splitRow(sepLine).map(function (col) {
      const left = col.startsWith(':');
      const right = col.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });

    let html = '<div class="table-container"><table><thead><tr>';
    for (let i = 0; i < headers.length; i++) {
      const align = alignments[i] ? ' style="text-align:' + alignments[i] + ';"' : '';
      html += '<th' + align + '>' + inlineFormat(headers[i]) + '</th>';
    }
    html += '</tr></thead><tbody>';

    let cur = startIdx + 2;
    while (cur < lines.length && lines[cur].trim().indexOf('|') !== -1) {
      const row = splitRow(lines[cur]);
      html += '<tr>';
      for (let j = 0; j < headers.length; j++) {
        const cell = row[j] !== undefined ? row[j] : '';
        const align = alignments[j] ? ' style="text-align:' + alignments[j] + ';"' : '';
        html += '<td' + align + '>' + inlineFormat(cell) + '</td>';
      }
      html += '</tr>';
      cur++;
    }
    html += '</tbody></table></div>';

    return {
      html: html,
      endIdx: cur - 1
    };
  }

  function renderMarkdown(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';

    // First: Escape all HTML for safety
    const escaped = escapeHtml(rawText);

    // Second: Extract code blocks before block/line parsing
    const codeBlocks = [];
    const withCodePlaceholders = escaped.replace(/```([a-zA-Z0-9_\-]+)?\r?\n([\s\S]*?)(?:```|$)/g, function (match, lang, code) {
      const language = (lang || '').toLowerCase().trim();
      const rawCode = code.replace(/\r?\n$/, ''); // trim trailing newline
      const highlighted = highlightCode(rawCode, language);
      const displayLang = language ? language.toUpperCase() : 'CODE';

      const blockHtml = [
        '<div class="code-block" data-lang="' + language + '">',
        '  <div class="code-header">',
        '    <span class="code-lang">' + displayLang + '</span>',
        '    <div class="code-actions">',
        '      <button type="button" class="code-btn btn-code-copy" title="Copiar código" aria-label="Copiar código">Copiar</button>',
        '      <button type="button" class="code-btn btn-code-insert" title="Inserir no cursor" aria-label="Inserir no cursor">Inserir no cursor</button>',
        '      <button type="button" class="code-btn btn-code-diff" title="Diff no VS Code" aria-label="Diff no VS Code">Diff</button>',
        '      <button type="button" class="code-btn btn-code-save" title="Salvar em arquivo" aria-label="Salvar">Salvar</button>',
        '    </div>',
        '  </div>',
        '  <pre><code class="language-' + language + '">' + highlighted + '</code></pre>',
        '</div>'
      ].join('\n');

      codeBlocks.push(blockHtml);
      return '\n___CODE_BLOCK_' + (codeBlocks.length - 1) + '___\n';
    });

    const lines = withCodePlaceholders.split(/\r?\n/);
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line
      if (!trimmed) {
        i++;
        continue;
      }

      // Code block token
      const codeMatch = trimmed.match(/^___CODE_BLOCK_(\d+)___$/);
      if (codeMatch) {
        result.push(codeBlocks[Number(codeMatch[1])]);
        i++;
        continue;
      }

      // Horizontal Rule: ---, ***, ___
      if (/^(?:---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
        result.push('<hr>');
        i++;
        continue;
      }

      // Headings: # to ######
      const headMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headMatch) {
        const level = headMatch[1].length;
        result.push('<h' + level + '>' + inlineFormat(headMatch[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      // GFM Tables: Check if line starts with table syntax
      if (trimmed.indexOf('|') !== -1 && i + 1 < lines.length) {
        const table = parseTable(lines, i);
        if (table) {
          result.push(table.html);
          i = table.endIdx + 1;
          continue;
        }
      }

      // Blockquotes: lines starting with >
      if (/^>\s?/.test(trimmed)) {
        const bqLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          bqLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        result.push('<blockquote><p>' + bqLines.map(inlineFormat).join('<br>') + '</p></blockquote>');
        continue;
      }

      // Lists: Unordered, Ordered, and Checklists
      const isUl = /^(\s*)[*+-]\s+(.*)$/.test(line);
      const isOl = /^(\s*)\d+\.\s+(.*)$/.test(line);

      if (isUl || isOl) {
        const isOrdered = isOl;
        const tag = isOrdered ? 'ol' : 'ul';
        const listItems = [];

        while (i < lines.length) {
          const curLine = lines[i];
          const ulMatch = curLine.match(/^(\s*)[*+-]\s+(.*)$/);
          const olMatch = curLine.match(/^(\s*)\d+\.\s+(.*)$/);

          if (!ulMatch && !olMatch) {
            // Check if indented continuation of previous item
            if (/^\s{2,}\S/.test(curLine) && listItems.length > 0) {
              listItems[listItems.length - 1].text += '<br>' + inlineFormat(curLine.trim());
              i++;
              continue;
            }
            break;
          }

          const match = isOrdered ? olMatch : ulMatch;
          const indent = match ? match[1].length : 0;
          let content = (match ? match[2] : (ulMatch || olMatch)[2]) || '';

          // Check for checklist: [ ] or [x]
          let isChecklist = false;
          let isChecked = false;
          const checkMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
          if (checkMatch) {
            isChecklist = true;
            isChecked = checkMatch[1].toLowerCase() === 'x';
            content = checkMatch[2];
          }

          listItems.push({
            indent: indent,
            text: inlineFormat(content),
            isChecklist: isChecklist,
            isChecked: isChecked
          });
          i++;
        }

        let listHtml = '<' + tag + (listItems.some(function (it) { return it.isChecklist; }) ? ' class="checklist"' : '') + '>';
        for (let j = 0; j < listItems.length; j++) {
          const item = listItems[j];
          if (item.isChecklist) {
            listHtml += '<li class="checklist-item"><input type="checkbox" disabled ' + (item.isChecked ? 'checked' : '') + '> ' + item.text + '</li>';
          } else {
            listHtml += '<li>' + item.text + '</li>';
          }
        }
        listHtml += '</' + tag + '>';
        result.push(listHtml);
        continue;
      }

      // Paragraph / Multi-line regular text block
      const paraLines = [];
      while (i < lines.length) {
        const curLine = lines[i];
        const curTrim = curLine.trim();
        if (!curTrim) break;
        if (/^___CODE_BLOCK_\d+___$/.test(curTrim)) break;
        if (/^(?:---+|\*\*\*+|___+)\s*$/.test(curTrim)) break;
        if (/^#{1,6}\s+/.test(curTrim)) break;
        if (/^>\s?/.test(curTrim)) break;
        if (/^(\s*)[*+-]\s+/.test(curLine)) break;
        if (/^(\s*)\d+\.\s+/.test(curLine)) break;
        if (curTrim.indexOf('|') !== -1 && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim())) {
          break;
        }

        paraLines.push(curTrim);
        i++;
      }

      if (paraLines.length > 0) {
        result.push('<p>' + paraLines.map(inlineFormat).join('<br>') + '</p>');
      }
    }

    return result.join('\n');
  }

  // Expose to window
  global.renderMarkdown = renderMarkdown;

})(typeof window !== 'undefined' ? window : this);
