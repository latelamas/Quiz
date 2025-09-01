let newTab = null;
let isDownloading = false;

async function fetchResources() {
  const runBtn = document.getElementById('runBtn');
  runBtn.textContent = 'Loading Your Files...';
  runBtn.disabled = true;

  try {
    const [cssResponse, jsResponse] = await Promise.all([
      fetch('styles.css'),
      fetch('script.js')
    ]);

    if (!cssResponse.ok) throw new Error(`CSS fetch failed: ${cssResponse.statusText}`);
    if (!jsResponse.ok) throw new Error(`JS fetch failed: ${jsResponse.statusText}`);

    const cssContent = await cssResponse.text();
    const jsContent = await jsResponse.text();

    document.getElementById('cssCode').value = cssContent;
    document.getElementById('jsCode').value = jsContent;

    runBtn.textContent = 'Generate Quiz';
    runBtn.disabled = false;
  } catch (e) {
    console.error('Failed to load resources:', e);
    alert('Failed to load required files (styles.css, script.js). Make sure they are in the same directory and you are running this from a web server.');
    runBtn.textContent = 'Error - Files Not Found';
    runBtn.disabled = false;
  }
}

fetchResources();

document.addEventListener('DOMContentLoaded', () => {
    const runButton = document.getElementById('runBtn');
    const downloadButton = document.getElementById('downloadBtn');
    if (runButton) {
        runButton.addEventListener('click', runCode);
    }
    if (downloadButton) {
        downloadButton.addEventListener('click', downloadCode);
    }
});

function parseQuizdown(text) {
  text = text.replace(/\r\n/g, '\n');
  let quizTitle = "Generated Quiz";
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
        }
      });
    }
  }

  function applyFormatting(str) {
    if (!str) return '';
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
    str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    str = str.replace(/__([\s\S]+?)__/g, '<i>$1</i>');
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
          const header = rows[0];
          const body = rows.slice(2);
          const tableHtml = `<table class="data-table"><thead><tr>${header.map(h => `<th>${applyFormatting(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(d => `<td>${applyFormatting(d)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
          materialsHtml += `<div class="material-box">${tableHtml}</div>`;
        } else if (type === 'plot') {
          const plotId = `plot-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          const expressions = content.split('\n')
            .map(f => f.trim())
            .filter(f => f)
            .map((f, i) => {
              let expr = f;
              if (expr.startsWith('$') && expr.endsWith('$')) {
                  expr = expr.substring(1, expr.length - 1).trim();
              }
              return { id: `graph${i}`, latex: expr };
            });

          if (expressions.length === 0) {
            expressions.push({ id: 'graph0', latex: 'y=x' });
          }

          const calculatorOptions = {
            keypad: false,
            settingsMenu: false,
            lockViewport: false,
            zoomButtons: true,
            expressionsCollapsed: false,
            pointsOfInterest: false,
            trace: false
          };

          const plotData = {
              targetId: plotId,
              expressions: expressions,
              options: calculatorOptions
          };

          materialsHtml += `<div class="material-box"><div id="${plotId}" class="desmos-container" style="width: 100%; height: 500px;"></div><script>(function(){try{
            const plotInfo = ${JSON.stringify(plotData)};
            const elt = document.getElementById(plotInfo.targetId);
            if (!elt) return;

            const calculator = Desmos.GraphingCalculator(elt, plotInfo.options || {});

            (plotInfo.expressions || []).forEach(expr => {
              calculator.setExpression(Object.assign({}, expr, { readonly: true }));
            });

            const allowed = new Set(calculator.getExpressions().map(e => e.id));

            calculator.observeEvent('change', (eventName, event) => {
              if (!event.isUserInitiated) return;
              try {
                const current = calculator.getExpressions();
                current.forEach(e => {
                  if (!allowed.has(e.id)) {
                    calculator.removeExpression({ id: e.id });
                    console.warn('Removed user-added expression', e.id);
                  }
                });
              } catch (err) {
                console.error('Error enforcing read-only expressions:', err);
              }
            });

            const keyHandler = (ev) => {
              if (!elt.contains(document.activeElement)) return;
              if ((ev.ctrlKey || ev.metaKey) && ev.altKey && (ev.code === 'KeyX' || ev.key === 'x')) {
                ev.preventDefault();
                ev.stopPropagation();
              }
            };
            window.addEventListener('keydown', keyHandler, true);

          }catch(e){
            console.error('Desmos error:',e);
            document.getElementById('${plotId}').innerHTML='<p class="error">Invalid plot configuration.</p>';
          }})();<\/script></div>`;
        }
        return '';
      });

      const lines = block.trim().split('\n');
      const questionLines = [], options = [], answerLines = [];
      let currentSection = 'none'; // Start with 'none' to wait for #Q

      for (const line of lines) {
        if (line.startsWith('#Q')) {
          currentSection = 'question';
          // Don't add the #Q line itself, just start collecting question lines
        } else if (line.startsWith('- [')) {
          currentSection = 'options';
          options.push({ correct: line.startsWith('- [x]'), text: applyFormatting(line.substring(5).trim()) });
        } else if (line.startsWith('#A')) {
          currentSection = 'answer';
          // Don't add the #A line itself, just start collecting answer lines
        } else if (currentSection === 'question') {
          questionLines.push(line);
        } else if (currentSection === 'answer') {
          answerLines.push(line);
        }
      }

      const questionTitle = applyFormatting(questionLines.join('\n').trim());
      const answer = applyFormatting(answerLines.join('\n').trim()).replace(/\n/g, '<br>');
      if (options.length > 0) shuffleArray(options);
      if (!questionTitle) return '';

      const isMcq = options.length > 0;
      const qId = `q${qNum}`;
      let html = `<section class="question-block" id="${qId}" ${isMcq ? `data-correct-answer="${String.fromCharCode(97 + options.findIndex(opt => opt.correct))}"` : ''} aria-labelledby="${qId}-title">`;
      html += `<p class="question-number" id="${qId}-number">${qNum}.</p><p class="question-title" id="${qId}-title">${questionTitle}</p>${materialsHtml}`;

      if (isMcq) {
        html += '<fieldset><div class="options" role="radiogroup">';
        options.forEach((opt, i) => {
          const val = String.fromCharCode(97 + i);
          html += `<label><input type="radio" name="${qId}" value="${val}"> ${opt.text}</label>`;
        });
        html += `</div></fieldset><button class="check-button" aria-controls="${qId}-feedback ${qId}-explanation">Check</button><div class="feedback" id="${qId}-feedback" role="alert" aria-live="polite"></div><div class="explanation" id="${qId}-explanation" aria-live="polite">${answer}</div>`;
      } else if (answer) {
        html += `<details><summary>Show/Hide</summary><div class="answer-box">${answer}</div></details>`;
      }
      html += '</section>';
      return html;
    } catch (e) {
      console.error(`Error parsing question block #${index + 1}:`, e);
      return `<section class="question-block error"><p class="question-title"><strong>${index + 1}.</strong> Error parsing this question.</p></section>`;
    }
  }).join('');

  return { title: quizTitle, body: `<h1>${quizTitle}</h1><div class="quiz-section">${questionsHtml}</div>` };
}

function createFullHtml(quizTitle, quizBody, cssContent, jsContent) {
  const hasPlots = quizBody.includes('class="desmos-container"');
  const plotScripts = hasPlots
    ? `<script src="https://www.desmos.com/api/v1.8/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"><\/script>`
    : '';
  
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${quizTitle}</title><script>MathJax={tex:{inlineMath:[['$','$']],displayMath:[['$$','$$']]}}<\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"><\/script>${plotScripts}<style>${cssContent}</style></head><body>${quizBody}<script>${jsContent}<\/script></body></html>`;
}

function generateQuizHtml() {
  const quizdownContent = document.getElementById("quizdownCode").value;
  const cssContent = document.getElementById("cssCode").value;
  const jsContent = document.getElementById("jsCode").value;
  if (!quizdownContent.trim() || !jsContent.trim() || !cssContent.trim()) {
    alert("Please wait for resources to load or paste quiz content.");
    return null;
  }
  const quizOutput = parseQuizdown(quizdownContent);
  return createFullHtml(quizOutput.title, quizOutput.body, cssContent, jsContent);
}

function runCode() {
  const fullHtml = generateQuizHtml();
  if (!fullHtml) return;
  if (!newTab || newTab.closed) newTab = window.open("", "_blank");
  if (!newTab) {
    alert("Popup blocked! Please allow popups for this site.");
    return;
  }
  newTab.document.open();
  newTab.document.write(fullHtml);
  newTab.document.close();
  newTab.focus();
}

function downloadCode() {
  // Prevent multiple downloads
  if (isDownloading) return;
  isDownloading = true;
  
  const fullHtml = generateQuizHtml();
  if (!fullHtml) {
    isDownloading = false;
    return;
  }
  
  const blob = new Blob([fullHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "quiz.html";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  
  // Reset flag after short delay
  setTimeout(() => {
    isDownloading = false;
  }, 1000);
}
