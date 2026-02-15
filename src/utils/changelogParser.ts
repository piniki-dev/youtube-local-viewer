/**
 * Parse the `notes` field from latest.json (Tauri updater body).
 *
 * The notes field contains a JSON string like:
 *   {"ja": "### 修正\n- ...", "en": "### Fixed\n- ..."}
 *
 * Returns the changelog text for the given language,
 * falling back to 'en' then raw body.
 */
export function extractLocalizedNotes(
  body: string | undefined,
  language: string,
): string {
  if (!body) return '';

  try {
    const parsed = JSON.parse(body) as Record<string, string>;
    // Try exact match first (e.g. "ja"), then base language (e.g. "ja" from "ja-JP")
    const lang = language.split('-')[0];
    return parsed[language] || parsed[lang] || parsed['en'] || body;
  } catch {
    // Not JSON — return raw body as-is (backward compatibility)
    return body;
  }
}

/**
 * Convert simplified changelog markdown to HTML.
 * Handles ### headers, #### sub-headers, - list items, **bold**, and `code`.
 */
export function changelogMarkdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }

    // ### Category header
    if (trimmed.startsWith('### ')) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<h4>${escapeHtml(trimmed.slice(4))}</h4>`;
      continue;
    }

    // #### Sub-category header
    if (trimmed.startsWith('#### ')) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<h5>${escapeHtml(trimmed.slice(5))}</h5>`;
      continue;
    }

    // - List item
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${formatInline(trimmed.slice(2))}</li>`;
      continue;
    }

    // Plain text paragraph
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    html += `<p>${formatInline(trimmed)}</p>`;
  }

  if (inList) {
    html += '</ul>';
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(text: string): string {
  let escaped = escapeHtml(text);
  // **bold** → <strong>bold</strong>
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // `code` → <code>code</code>
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  return escaped;
}
