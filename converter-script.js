let newTab = null;
let globalPlotData = [];

// The main function to fetch the necessary resources for the *generated* quiz.
async function fetchResources() {
  const runBtn = document.getElementById('runBtn');
  runBtn.textContent = 'Loading Your Files...';
  runBtn.disabled = true;

  const fetchFile = async (filePath, textareaId) => {
    try {
      const res = await fetch(filePath);
      if (!res.ok) throw new Error(`Fetch failed for ${filePath}: ${res.status}`);
      document.getElementById(textareaId).value = await res.text();
    } catch (e) {
      console.error(e);
      alert(`Failed to load a required file: ${filePath}. Please ensure script.js and styles.css are in the same folder.`);
    }
  };

  await Promise.all([
    fetchFile('./script.js', "jsCode"),
    fetchFile('./styles.css', "cssCode")
  ]);

  runBtn.textContent = 'Generate Quiz';
  runBtn.disabled = false;
}

fetchResources();

function parseQuizdown(text) {
  text = text.replace(/\r\n/g, '\n');
  globalPlotData = [];

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
          if (key === 'title') { quizTitle = value; }
        }
      });
    }
  }
  
  function applyFormatting(str) {
    if (!str) return '';
    const mathBlocks = [];
    str = str.replace(/\$\$([\s\S]*?)\$\$/g, (match, p1) => {
      const token = `@@MATH${mathBlocks.length}@@`;
      mathBlocks.push({ token, content: `<div class="math-scroll">$$${p1}$$</div>` }); return token;
    });
    str = str.replace(/\$([^\$\n]+?)\$/g, (match, p1) => {
      const token = `@@MATH${mathBlocks.length}@@`;
      mathBlocks.push({ token, content: `$${p1}$` }); return token;
    });
    str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    str = str.replace(/_([\s\S]+?)_/g, '<i>$1</i>');
    mathBlocks.forEach(m => { str = str.replace(m.token, m.content); });
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

      block = block.replace(/\[(code|quote|table|material|plot)(.*?)\]\n?([\s\S]*?)\n?\[\/(?:code|quote|table|material|plot)\]/g, (match, type, attrs, content) => {
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
            const plotId = `plot-${qNum}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const escapedLatex = content.replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
            materialsHtml += `<div class="material-box"><div id="${plotId}" class="plot-container"></div></div>`;
            globalPlotData.push({ id: plotId, latex: escapedLatex, question: qNum });
        }
        return '';
      });
      
      const lines = block.trim().split('\n');
      const questionLines = []; const options = []; const answerLines = [];
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
      if (questionLines.length > 0 && questionLines[0].trim().startsWith('Q:')) {
        const firstLineContent = questionLines[0].trim().substring(2).trim();
        if (firstLineContent) questionLines[0] = firstLineContent; else questionLines.shift();
      }
      const questionTitle = applyFormatting(questionLines.join('\n').trim());
      const answer = applyFormatting(answerLines.join('\n').trim()).replace(/\n/g, '<br>');
      
      if (options.length > 0) {
        shuffleArray(options);
      }

      if (!questionTitle) return '';
      const isMcq = options.length > 0;
      const qId = `q${qNum}`;
      let html = `<section class="question-block" id="${qId}" ${isMcq ? `data-correct-answer="${String.fromCharCode(97 + options.findIndex(opt => opt.correct))}"` : ''} aria-labelledby="${qId}-title">`;
      html += `<p class="question-number" id="${qId}-number">${qNum}.</p><p class="question-title" id="${qId}-title">${questionTitle}</p>`;
      html += materialsHtml;
      if (isMcq) {
        html += `<fieldset><div class="options" role="radiogroup">`;
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
    body: `<h1>${quizTitle}</h1><div class="quiz-section">${questionsHtml}</div>`,
  };
}

function createFullHtml(quizTitle, quizBody, cssContent, jsContent) {
    let additionalScript = '';
    if (globalPlotData && globalPlotData.length > 0) {
        const plotInitScript = `
// MathBox plotting system
window.plotData = ${JSON.stringify(globalPlotData)};
window.mathboxInstances = {};

window.initPlots = function() {
    if (typeof MathBox === 'undefined') {
        console.error('MathBox not loaded');
        return;
    }
    
    window.plotData.forEach(function(plot) {
        const container = document.getElementById(plot.id);
        if (container) {
            try {
                // Clear container
                container.innerHTML = '';
                container.style.width = '100%';
                container.style.height = '300px';
                container.style.position = 'relative';
                
                // Create MathBox instance
                const mathbox = MathBox.mathBox({
                    plugins: ['core', 'controls', 'cursor', 'mathbox'],
                    controls: {
                        klass: MathBox.Controls.Orbit,
                        speed: 2,
                        dampening: 0.95
                    },
                    camera: {
                        fov: 20,
                        position: [0, 0, 5]
                    },
                    container: container
                });
                
                window.mathboxInstances[plot.id] = mathbox;
                
                const three = mathbox.three;
                three.camera.up.set(0, 1, 0);
                three.renderer.setClearColor(new THREE.Color(0xffffff), 1.0);
                
                // Create the scene
                mathbox
                    .cartesian({
                        range: [[-10, 10], [-10, 10], [-10, 10]],
                        scale: [2, 2, 1]
                    })
                    .axis({
                        axis: 1,
                        color: 0x000000,
                        ticks: 10,
                        lineWidth: 2,
                        labels: true
                    })
                    .axis({
                        axis: 2,
                        color: 0x000000,
                        ticks: 10,
                        lineWidth: 2,
                        labels: true
                    })
                    .grid({
                        axes: [1, 2],
                        color: 0xcccccc,
                        lineWidth: 1
                    });
                
                // Parse and plot function
                const func = plot.latex;
                let expr = func;
                
                // Simple function conversion (basic cases)
                if (func.includes('sin')) {
                    expr = func.replace(/\\sin/g, 'sin');
                } else if (func.includes('cos')) {
                    expr = func.replace(/\\cos/g, 'cos');
                } else if (func.includes('tan')) {
                    expr = func.replace(/\\tan/g, 'tan');
                } else if (func.includes('^')) {
                    expr = func.replace(/\^/g, '**');
                }
                
                mathbox
                    .fn({
                        expr: function(emit, x) {
                            try {
                                // Simple function evaluation
                                let result;
                                if (expr.includes('x**2')) {
                                    result = x * x;
                                } else if (expr.includes('sin')) {
                                    result = Math.sin(x);
                                } else if (expr.includes('cos')) {
                                    result = Math.cos(x);
                                } else if (expr.includes('x**3')) {
                                    result = x * x * x;
                                } else {
                                    // Default linear
                                    result = x;
                                }
                                emit(x, result);
                            } catch(e) {
                                emit(x, 0);
                            }
                        },
                        domain: [-10, 10],
                        samples: 200,
                        color: 0x2196f3,
                        lineWidth: 3
                    });
                
            } catch (e) {
                console.error('Error creating MathBox plot for ' + plot.id, e);
                container.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error loading 3D graph: ' + e.message + '</p>';
            }
        }
    });
};

// Load MathBox and dependencies
document.addEventListener('DOMContentLoaded', function() {
    if (typeof MathBox === 'undefined') {
        // Load THREE.js first
        const threeScript = document.createElement('script');
        threeScript.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js';
        threeScript.onload = function() {
            // Then load MathBox
            const mathboxScript = document.createElement('script');
            mathboxScript.src = 'https://cdn.jsdelivr.net/npm/mathbox@2.1.1/build/mathbox.js';
            mathboxScript.onload = function() {
                // Load MathBox CSS
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://cdn.jsdelivr.net/npm/mathbox@2.1.1/build/mathbox.css';
                document.head.appendChild(link);
                
                setTimeout(function() {
                    if (typeof window.initPlots === 'function') window.initPlots();
                }, 500);
            };
            document.head.appendChild(mathboxScript);
        };
        document.head.appendChild(threeScript);
    } else {
        setTimeout(function() {
            if (typeof window.initPlots === 'function') window.initPlots();
        }, 100);
    }
});
`;
        additionalScript = `<script>${plotInitScript}<\/script>`;
    }

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${quizTitle}</title>
        <script>MathJax = { tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] } };<\/script>
        <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"><\/script>
        <style>${cssContent}</style>
        <style>
        .plot-container {
            width: 100%;
            height: 300px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin: 10px 0;
            background: #f8f9fa;
        }
        .material-box {
            margin: 15px 0;
        }
        </style>
        </head>
        <body>
        ${quizBody}
        ${additionalScript}
        <script>${jsContent}<\/script>
        </body></html>`;
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
  if (!newTab) { alert("Popup blocked!"); return; }
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
