let newTab = null;
let isDownloading = false;
let isSaving = false; // Flag to prevent multiple saves
let isCopying = false; // Flag to prevent multiple copies

// Function to convert brackets and absolute values to \left\right format
function convertToDesmosLatex(latex) {
  if (!latex) return latex;
  
  // Convert absolute value bars |x| to \left|x\right|
  // This regex looks for | that are not already preceded by \left or followed by \right
  latex = latex.replace(/(?<!\\left)\|([^|]+?)(?<!\\right)\|/g, '\\left|$1\\right|');
  
  // Convert regular parentheses (x) to \left(x\right) 
  // But avoid converting ones that are already \left( or \right)
  latex = latex.replace(/(?<!\\left)\(([^()]+?)(?<!\\right)\)/g, '\\left($1\\right)');
  
  return latex;
}

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
    runBtn.textContent = 'Error - Files Not Found';
    runBtn.disabled = false;
  }
}

fetchResources();

document.addEventListener('DOMContentLoaded', () => {
    const runButton = document.getElementById('runBtn');
    const downloadButton = document.getElementById('downloadBtn');
    const copyButton = document.getElementById('copyBtn');
    const saveButton = document.getElementById('saveBtn');
    
    if (runButton) {
        runButton.addEventListener('click', runCode);
    }
    if (downloadButton) {
        downloadButton.addEventListener('click', downloadCode);
    }
    if (copyButton) {
        copyButton.addEventListener('click', copyCode);
    }
    if (saveButton) {
        saveButton.addEventListener('click', saveQuiz);
    }
    
    // Add dynamic search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            searchQuizzes();
        });
    }
    
    // Load saved quizzes on page load
    loadSavedQuizzes();
});

// Function to extract quiz title from quizdown content
function extractQuizTitle(quizdownContent) {
  let quizTitle = "Generated Quiz";
  
  if (quizdownContent.startsWith('---\n')) {
    const endOfHeaderIndex = quizdownContent.indexOf('\n---\n');
    if (endOfHeaderIndex > 0) {
      const headerText = quizdownContent.substring(4, endOfHeaderIndex);
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
  
  return quizTitle;
}

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
    str = str.replace(/\*([^\*]+?)\*/g, '<i>$1</i>');
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
              // Apply Desmos LaTeX conversion here
              expr = convertToDesmosLatex(expr);
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
      if (options.length > 2) shuffleArray(options);
      if (!questionTitle) return '';

      const isMcq = options.length > 0;
      const qId = `q${qNum}`;
      let html = `<section class="question-block" id="${qId}" ${isMcq ? `data-correct-answer="${String.fromCharCode(97 + options.findIndex(opt => opt.correct))}"` : ''} aria-labelledby="${qId}-title">`;
      html += `<p class="question-number" id="${qId}-number">${qNum}.</p><div class="question-title" id="${qId}-title">${questionTitle}</div>${materialsHtml}`;

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
  
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${quizTitle}</title><script>MathJax={tex:{inlineMath:[['$','$']],displayMath:[['$$','$$']]}}<\/script><script src="        https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js        "><\/script>${plotScripts}<style>${cssContent}</style></head><body>${quizBody}<script>${jsContent}<\/script></body></html>`;
}

function generateQuizHtml() {
  const quizdownContent = document.getElementById("quizdownCode").value;
  const cssContent = document.getElementById("cssCode").value;
  const jsContent = document.getElementById("jsCode").value;
  if (!quizdownContent.trim() || !jsContent.trim() || !cssContent.trim()) {
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
    // Update button text to indicate popup was blocked
    document.getElementById('runBtn').textContent = 'Popup Blocked!';
    setTimeout(() => {
      document.getElementById('runBtn').textContent = 'Generate Quiz';
    }, 2000);
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
  
  // Extract title from quiz content
  const quizdownContent = document.getElementById("quizdownCode").value;
  let quizTitle = "Generated Quiz";
  
  if (quizdownContent.startsWith('---\n')) {
    const endOfHeaderIndex = quizdownContent.indexOf('\n---\n');
    if (endOfHeaderIndex > 0) {
      const headerText = quizdownContent.substring(4, endOfHeaderIndex);
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
  
  // Sanitize title for filename
  const sanitizedTitle = quizTitle
    .replace(/[^a-zA-Z0-9\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')             // Replace spaces with hyphens
    .replace(/-+/g, '-')              // Replace multiple hyphens with single
    .trim('-');                       // Remove leading/trailing hyphens
  
  const filename = sanitizedTitle ? `${sanitizedTitle}.html` : "quiz.html";
  
  const blob = new Blob([fullHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  
  // Reset flag after short delay
  setTimeout(() => {
    isDownloading = false;
  }, 1000);
}

function copyCode() {
  // Prevent multiple copies
  if (isCopying) return;
  isCopying = true;
  
  const fullHtml = generateQuizHtml();
  if (!fullHtml) {
    isCopying = false;
    return;
  }
  
  // Create a temporary textarea to copy the content
  const textarea = document.createElement("textarea");
  textarea.value = fullHtml;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  
  // Show feedback to user (same as save button)
  const originalText = document.getElementById('copyBtn').textContent;
  document.getElementById('copyBtn').textContent = 'Copied!';
  setTimeout(() => {
    document.getElementById('copyBtn').textContent = originalText;
    // Reset the copying flag after the UI update
    isCopying = false;
  }, 1000);
}

// Function to generate unique title if duplicate exists
function generateUniqueTitle(baseTitle, savedQuizzes) {
  let uniqueTitle = baseTitle;
  let counter = 1;
  
  // Check if title already exists
  while (savedQuizzes.some(quiz => quiz.title === uniqueTitle)) {
    uniqueTitle = `${baseTitle}${counter}`;
    counter++;
  }
  
  return uniqueTitle;
}

// Save quiz to local storage
function saveQuiz() {
  // Prevent multiple saves
  if (isSaving) return;
  isSaving = true;
  
  const quizdownContent = document.getElementById("quizdownCode").value;
  const cssContent = document.getElementById("cssCode").value;
  const jsContent = document.getElementById("jsCode").value;
  
  if (!quizdownContent.trim() || !jsContent.trim() || !cssContent.trim()) {
    isSaving = false;
    return; // Don't save if content is missing
  }
  
  let quizTitle = extractQuizTitle(quizdownContent);
  const timestamp = new Date().toISOString();
  
  // Get existing saved quizzes
  const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
  
  // Generate unique title if duplicate exists
  quizTitle = generateUniqueTitle(quizTitle, savedQuizzes);
  
  // Add new quiz
  savedQuizzes.push({
    title: quizTitle,
    quizdown: quizdownContent,
    css: cssContent,
    js: jsContent,
    timestamp: timestamp
  });
  
  // Save to local storage
  localStorage.setItem('savedQuizzes', JSON.stringify(savedQuizzes));
  
  // Update UI feedback
  const originalText = document.getElementById('saveBtn').textContent;
  document.getElementById('saveBtn').textContent = 'Saved!';
  setTimeout(() => {
    document.getElementById('saveBtn').textContent = originalText;
    // Reset the saving flag after the UI update
    isSaving = false;
  }, 1000);
  
  // Reload saved quizzes display
  loadSavedQuizzes();
}

// Load and display saved quizzes
function loadSavedQuizzes() {
  const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
  const savedQuizzesContainer = document.getElementById('savedQuizzesList');
  
  if (!savedQuizzesContainer) return;
  
  // Clear container
  savedQuizzesContainer.innerHTML = '';
  
  if (savedQuizzes.length === 0) {
    savedQuizzesContainer.innerHTML = '<p>No saved quizzes yet.</p>';
    return;
  }
  
  // Sort quizzes by timestamp (newest first)
  savedQuizzes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Create list of saved quizzes
  savedQuizzes.forEach((quiz, index) => {
    const quizItem = document.createElement('div');
    quizItem.className = 'saved-quiz-item';
    
    const date = new Date(quiz.timestamp).toLocaleString();
    
    quizItem.innerHTML = `
      <div class="quiz-info">
        <h3>${quiz.title}</h3>
        <p class="quiz-date">${date}</p>
      </div>
      <div class="quiz-actions">
        <button onclick="loadSavedQuiz(${index})">Load</button>
        <button class="delete-btn" data-index="${index}" onclick="confirmDelete(${index})">Delete</button>
      </div>
    `;
    
    savedQuizzesContainer.appendChild(quizItem);
  });
}

// Load a specific saved quiz
function loadSavedQuiz(index) {
  const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
  const quiz = savedQuizzes[index];
  
  if (quiz) {
    document.getElementById('quizdownCode').value = quiz.quizdown;
    document.getElementById('cssCode').value = quiz.css;
    document.getElementById('jsCode').value = quiz.js;
  }
}

// Confirm deletion with double-click
function confirmDelete(index) {
  const deleteBtn = document.querySelector(`.delete-btn[data-index="${index}"]`);
  const savedQuizzesContainer = document.getElementById('savedQuizzesList');
  
  // If button doesn't have the 'sure' class yet, add it
  const deleteButtons = savedQuizzesContainer.querySelectorAll('.delete-btn');
  let currentButton = null;
  
  deleteButtons.forEach((btn, i) => {
    if (parseInt(btn.getAttribute('data-index')) === index) {
      currentButton = btn;
    } else {
      // Reset other buttons
      btn.textContent = 'Delete';
      btn.classList.remove('sure');
    }
  });
  
  if (currentButton) {
    if (currentButton.classList.contains('sure')) {
      // Second click - actually delete
      deleteSavedQuiz(index);
      currentButton.textContent = 'Delete';
      currentButton.classList.remove('sure');
    } else {
      // First click - show "Sure?"
      currentButton.textContent = 'Sure?';
      currentButton.classList.add('sure');
      
      // Reset after 2 seconds if not clicked again
      setTimeout(() => {
        if (currentButton && currentButton.classList.contains('sure')) {
          currentButton.textContent = 'Delete';
          currentButton.classList.remove('sure');
        }
      }, 2000);
    }
  }
}

// Delete a saved quiz
function deleteSavedQuiz(index) {
  const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
  
  if (index >= 0 && index < savedQuizzes.length) {
    savedQuizzes.splice(index, 1);
    localStorage.setItem('savedQuizzes', JSON.stringify(savedQuizzes));
    loadSavedQuizzes();
  }
}

// Search through saved quizzes dynamically
function searchQuizzes() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const savedQuizzes = JSON.parse(localStorage.getItem('savedQuizzes') || '[]');
  const savedQuizzesContainer = document.getElementById('savedQuizzesList');
  
  if (!savedQuizzesContainer) return;
  
  // Clear container
  savedQuizzesContainer.innerHTML = '';
  
  // If search term is empty, show all quizzes
  if (!searchTerm) {
    loadSavedQuizzes();
    return;
  }
  
  // Filter quizzes based on search term
  const filteredQuizzes = savedQuizzes.filter(quiz => 
    quiz.title.toLowerCase().includes(searchTerm) || 
    quiz.quizdown.toLowerCase().includes(searchTerm)
  );
  
  if (filteredQuizzes.length === 0) {
    savedQuizzesContainer.innerHTML = '<p>No matching quizzes found.</p>';
    return;
  }
  
  // Sort quizzes by timestamp (newest first)
  filteredQuizzes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Create list of filtered quizzes
  filteredQuizzes.forEach((quiz, index) => {
    const quizItem = document.createElement('div');
    quizItem.className = 'saved-quiz-item';
    
    const date = new Date(quiz.timestamp).toLocaleString();
    
    quizItem.innerHTML = `
      <div class="quiz-info">
        <h3>${quiz.title}</h3>
        <p class="quiz-date">${date}</p>
      </div>
      <div class="quiz-actions">
        <button onclick="loadSavedQuiz(${savedQuizzes.indexOf(quiz)})">Load</button>
        <button class="delete-btn" data-index="${savedQuizzes.indexOf(quiz)}" onclick="confirmDelete(${savedQuizzes.indexOf(quiz)})">Delete</button>
      </div>
    `;
    
    savedQuizzesContainer.appendChild(quizItem);
  });
}
