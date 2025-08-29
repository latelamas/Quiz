let newTab = null;

async function fetchResources() {
  const runBtn = document.getElementById('runBtn');
  runBtn.textContent = 'Loading Your Files...';
  runBtn.disabled = true;

  try {
    const [cssResponse, jsResponse] = await Promise.all([
      fetch('styles.css'),
      fetch('script.js')
    ]);

    if (!cssResponse.ok) throw new Error(`CSS fetch failed: ${cssResponse.status}`);
    if (!jsResponse.ok) throw new Error(`JS fetch failed: ${jsResponse.status}`);

    const cssContent = await cssResponse.text();
    const jsContent = await jsResponse.text();

    document.getElementById('cssCode').value = cssContent;
    document.getElementById('jsCode').value = jsContent;

    runBtn.textContent = 'Generate Quiz';
    runBtn.disabled = false;
  } catch (e) {
    console.error('Failed to load resources:', e);
    alert('Failed to load required resources. Please check console for details.');
  }
}

fetchResources();

// --- THE NEW MULTI-LINE AWARE PARSER ---
function parseQuizdown(text) {
  text = text.replace(/\r\n/g, '\n');

  let quizTitle = "Generated Quiz";
  let shuffleOptions = true; // Always true now
  let questionText = text;

  if (text.startsWith('---\n')) {
    const endOfHeaderIndex = text.indexOf('\n---\n');
    if (endOfHeaderIndex > 0) {
      const headerText = text.substring(4, endOfHeaderIndex);
      questionText = text.substring(endOfHeaderIndex + 5);

      headerText.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          if (key === 'title') {
            quizTitle = value;
          }
          // Removed shuffle option parsing - always true
        }
      });
    }
  }
  
  function applyFormatting(str) {
    if (!str) return '';
    
    // Step 1: Protect all math (inline $…$ and block $$…$$)
    const mathBlocks = [];
    str = str.replace(/\$\$([\s\S]*?)\$\$/g, (match, p1) => {
      const token = `@@MATH${mathBlocks.length}@@`;
      mathBlocks.push({ token, content: `<div class="math-scroll">$$${p1}$$</div>` });
      return token;
    });
    str = str.replace(/\$([^\$\n]+?)\$/g, (match, p1) => {
      const token = `@@MATH${mathBlocks.length}@@`;
      mathBlocks.push({ token, content: `$${p1}$` });
      return token;
    });
  
    // Step 2: Apply formatting
    // Bold: **text**
    str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic: _text_ (single underscore)
    str = str.replace(/_([\s\S]+?)_/g, '<i>$1</i>');
    // Step 3: Restore math blocks
    mathBlocks.forEach(m => {
      str = str.replace(m.token, m.content);
    });
    
    return str;
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  const questionBlocks = questionText.split(/\n---\n/).filter(block => block.trim() !== '');

  const questionsHtml = questionBlocks.map((block, index) => {
    try {
      block = block.split('\n').filter(line => !line.trim().startsWith('//')).join('\n').trim();

      const qNum = index + 1;
      let materialsHtml = '';

      block = block.replace(/\[(code|quote|table|material|plot)\]\n?([\s\S]*?)\n?\[\/(?:code|quote|table|material|plot)\]/gs, (match, type, content) => {
        content = content.trim();
        if (type === 'code') {
          materialsHtml += `<div class="material-box"><pre><code>${content.replace(/</g, "<").replace(/>/g, ">")}</code></pre></div>`;
        } else if (type === 'quote') {
          const parts = content.split('\n—');
          materialsHtml += `<div class="material-box"><figure><blockquote><p>${applyFormatting(parts[0].trim())}</p></blockquote>${parts[1] ? `<figcaption>— ${applyFormatting(parts[1].trim())}</figcaption>` : ''}</figure></div>`;
        } else if (type === 'material') {
          materialsHtml += `<div class="material-box"><p class="content-text">${applyFormatting(content).replace(/\n\n/g, '</p><p class="content-text">')}</p></div>`;
        } else if (type === 'table') {
          const rows = content.split('\n').map(r => r.trim().slice(1, -1).split('|').map(c => c.trim()));
          const header = rows[0]; const body = rows.slice(2);
          const tableHtml = `<table class="data-table"><thead><tr>${header.map(h => `<th>${applyFormatting(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(d => `<td>${applyFormatting(d)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
          materialsHtml += `<div class="material-box">${tableHtml}</div>`;
        } else if (type === 'plot') {
          const plotId = `plot-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const plotConfig = content.trim();

          materialsHtml += `
            <div class="material-box">
              <div id="${plotId}" class="function-plot-container"></div>
              <script>
                (function(){
                  try {
                    const config = ${JSON.stringify(JSON.parse(plotConfig))};
                    config.target = '#${plotId}';
                    functionPlot(config);
                  } catch (e) {
                    console.error("Plot config error:", e);
                    document.getElementById('${plotId}').innerHTML = '<p class="error">Invalid plot configuration.</p>';
                  }
                })();
              <\/script>
            </div>`;
        }
        return '';
      });

      // --- Section-based parsing ---
      const lines = block.trim().split('\n');
      const questionLines = [];
      const options = [];
      const answerLines = [];
      let currentSection = 'question';

      for (const line of lines) {
        if (line.startsWith('- [')) {
          currentSection = 'options';
          options.push({ correct: line.startsWith('- [x]'), text: applyFormatting(line.substring(5).trim()) });
          continue;
        }
        if (line.startsWith('A:')) {
          currentSection = 'answer';
          answerLines.push(line.substring(2).trim());
          continue;
        }

        if (currentSection === 'question') questionLines.push(line);
        else if (currentSection === 'answer') answerLines.push(line);
      }

      // Handle Q: alone line
      if (questionLines.length > 0 && questionLines[0].trim().startsWith('Q:')) {
        const firstLineContent = questionLines[0].trim().substring(2).trim();
        if (firstLineContent) questionLines[0] = firstLineContent;
        else questionLines.shift();
      }

      const questionTitle = applyFormatting(questionLines.join('\n').trim());
      const answer = applyFormatting(answerLines.join('\n').trim()).replace(/\n/g, '<br>');

      if (options.length > 0) { // Always shuffle now
        shuffleArray(options);
      }

      if (!questionTitle) return '';

      const isMcq = options.length > 0;
      const qId = `q${qNum}`;
      let html = `<section class="question-block" id="${qId}" ${isMcq ? `data-correct-answer="${String.fromCharCode(97 + options.findIndex(opt => opt.correct))}"` : ''} aria-labelledby="${qId}-title">`;

      // --- Fixed structure: question number and title as separate elements ---
      html += `<p class="question-number" id="${qId}-number">${qNum}.</p>
               <p class="question-title" id="${qId}-title">${questionTitle}</p>`;

      html += materialsHtml;

      if (isMcq) {
        html += '<fieldset><div class="options" role="radiogroup">';
        options.forEach((opt, i) => {
          const val = String.fromCharCode(97 + i);
          html += `<label><input type="radio" name="${qId}" value="${val}"> ${opt.text}</label>`;
        });
        html += `</div></fieldset><button class="check-button" aria-controls="${qId}-feedback ${qId}-explanation">Check</button><div class="feedback" id="${qId}-feedback" role="alert" aria-live="polite"></div><div class="explanation" id="${qId}-explanation" aria-live="polite">${answer}</div>`;
      } else {
        if (answer) {
          html += `<details><summary>Show/Hide</summary><div class="answer-box">${answer}</div></details>`;
        }
      }
      html += '</section>';
      return html;
    } catch (e) {
      console.error(`Error parsing question block #${index + 1}:`, e);
      return `<section class="question-block error"><p class="question-title"><strong>${index + 1}.</strong> Error parsing this question.</p></section>`;
    }
  }).join('');

  return {
    title: quizTitle,
    body: `<h1>${quizTitle}</h1><div class="quiz-section">${questionsHtml}</div>`
  };
}

function createFullHtml(quizTitle, quizBody, cssContent, jsContent) {
  const hasPlots = quizBody.includes('class="function-plot-container"');
  const functionPlotScript = hasPlots
    ? `<script src="https://cdn.jsdelivr.net/npm/function-plot/dist/function-plot.min.js"><\/script>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${quizTitle}</title><script>MathJax = { tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] } };<\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"><\/script>${functionPlotScript}<style>${cssContent}</style></head><body>${quizBody}<script>${jsContent}<\/script></body></html>`;
}

function runCode() {
  const quizdownContent = document.getElementById("quizdownCode").value;
  const cssContent = document.getElementById("cssCode").value;
  const jsContent = document.getElementById("jsCode").value;
  if (!quizdownContent.trim() || !jsContent.trim() || !cssContent.trim()) {
    alert("Please wait for resources to load or paste quiz content.");
    return;
  }

  const quizOutput = parseQuizdown(quizdownContent);
  const fullHtml = createFullHtml(quizOutput.title, quizOutput.body, cssContent, jsContent);

  if (!newTab || newTab.closed) newTab = window.open("", "_blank");
  if (!newTab) {
    alert("Popup blocked!");
    return;
  }
  newTab.document.open();
  newTab.document.write(fullHtml);
  newTab.document.close();
  newTab.focus();
}

function downloadCode() {
  const quizdownContent = document.getElementById("quizdownCode").value;
  const cssContent = document.getElementById("cssCode").value;
  const jsContent = document.getElementById("jsCode").value;
  if (!quizdownContent.trim() || !jsContent.trim() || !cssContent.trim()) {
    alert("Please wait for resources to load or paste content before downloading.");
    return;
  }

  const quizOutput = parseQuizdown(quizdownContent);
  const fullHtml = createFullHtml(quizOutput.title, quizOutput.body, cssContent, jsContent);

  const blob = new Blob([fullHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "quiz.html";
  link.click();
  URL.revokeObjectURL(link.href);
}
