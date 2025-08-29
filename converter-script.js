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
// Plotly.js plotting system - TRULY minimal and static
window.plotData = ${JSON.stringify(globalPlotData)};

window.initPlots = function() {
    if (typeof Plotly === 'undefined') {
        console.error('Plotly not loaded');
        return;
    }
    
    window.plotData.forEach(function(plot) {
        const container = document.getElementById(plot.id);
        if (container) {
            try {
                // Generate x values with EXTENDED range to prevent cutting (-20 to 20)
                const x = [];
                const y = [];
                const step = 0.05; // Finer resolution
                const generateRange = 20; // Generate from -20 to 20
                const visibleRange = 10; // But only show -10 to 10
                
                for (let i = -generateRange; i <= generateRange; i += step) {
                    x.push(i);
                    try {
                        // Function evaluation
                        let result;
                        const func = plot.latex.toLowerCase();
                        
                        if (func.includes('x^2') || func.includes('x**2')) {
                            result = i * i;
                        } else if (func.includes('sin')) {
                            result = Math.sin(i);
                        } else if (func.includes('cos')) {
                            result = Math.cos(i);
                        } else if (func.includes('tan')) {
                            // Handle tan carefully
                            if (Math.abs(Math.cos(i)) < 0.01) {
                                result = i > 0 ? 50 : -50;
                            } else {
                                result = Math.tan(i);
                            }
                        } else if (func.includes('x^3') || func.includes('x**3')) {
                            result = i * i * i;
                        } else if (func.includes('sqrt')) {
                            result = i >= 0 ? Math.sqrt(i) : null;
                        } else if (func.includes('exp')) {
                            // Limit exp to prevent overflow
                            if (i > 5) result = 100;
                            else if (i < -5) result = 0;
                            else result = Math.exp(i);
                        } else if (func.includes('log')) {
                            result = i > 0 ? Math.log(i) : null;
                        } else {
                            // Linear function as default
                            result = i;
                        }
                        
                        // Limit extreme values and handle nulls
                        if (result === null || result === undefined || !isFinite(result)) {
                            y.push(null);
                        } else {
                            if (Math.abs(result) > 100) {
                                result = result > 0 ? 100 : -100;
                            }
                            y.push(result);
                        }
                    } catch(e) {
                        y.push(null);
                    }
                }
                
                // Filter data to visible range for cleaner plotting
                const cleanX = [];
                const cleanY = [];
                for (let i = 0; i < x.length; i++) {
                    if (y[i] !== null && x[i] >= -visibleRange && x[i] <= visibleRange) {
                        cleanX.push(x[i]);
                        cleanY.push(y[i]);
                    }
                }
                
                // Create Plotly trace - TRULY minimal
                const trace = {
                    x: cleanX,
                    y: cleanY,
                    type: 'scatter',
                    mode: 'lines',
                    line: {
                        color: '#666',
                        width: 1
                    },
                    hoverinfo: 'none'
                };
                
                // TRULY minimal layout - NO INTERACTION
                const layout = {
                    autosize: true,
                    margin: {
                        l: 25,
                        r: 5,
                        b: 25,
                        t: 5,
                        pad: 0
                    },
                    xaxis: {
                        showgrid: true,
                        gridcolor: '#f5f5f5',
                        gridwidth: 1,
                        zeroline: true,
                        zerolinecolor: '#eee',
                        zerolinewidth: 1,
                        showline: false,
                        showticklabels: false,
                        fixedrange: true,
                        range: [-10, 10] // FIXED visible range
                    },
                    yaxis: {
                        showgrid: true,
                        gridcolor: '#f5f5f5',
                        gridwidth: 1,
                        zeroline: true,
                        zerolinecolor: '#eee',
                        zerolinewidth: 1,
                        showline: false,
                        showticklabels: false,
                        fixedrange: true,
                        range: [-10, 10] // FIXED visible range
                    },
                    showlegend: false,
                    hovermode: false,
                    dragmode: false,
                    selectdirection: false,
                    plot_bgcolor: 'white',
                    paper_bgcolor: 'white'
                };
                
                // TRULY static configuration - NO INTERACTION WHATSOEVER
                const config = {
                    displayModeBar: false,
                    displaylogo: false,
                    staticPlot: true,
                    editable: false,
                    scrollZoom: false,
                    doubleClick: false,
                    showTips: false,
                    showAxisDragHandles: false,
                    showAxisRangeEntryBoxes: false,
                    showSendToCloud: false,
                    sendData: false
                };
                
                // Render the plot - TRULY STATIC
                Plotly.newPlot(container, [trace], layout, config);
                
                // DISABLE ALL MOUSE EVENTS
                container.style.pointerEvents = 'none';
                
            } catch (e) {
                console.error('Error creating Plotly plot for ' + plot.id, e);
                container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px; font-size: 12px;">Graph</p>';
            }
        }
    });
};

// Load Plotly.js
document.addEventListener('DOMContentLoaded', function() {
    if (typeof Plotly === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.plot.ly/plotly-2.24.1.min.js';
        script.onload = function() {
            setTimeout(function() {
                if (typeof window.initPlots === 'function') window.initPlots();
            }, 100);
        };
        script.onerror = function() {
            console.error('Failed to load Plotly.js');
            if (window.plotData) {
                window.plotData.forEach(function(plot) {
                    const container = document.getElementById(plot.id);
                    if (container) {
                        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px; font-size: 12px;">Graph</p>';
                    }
                });
            }
        };
        document.head.appendChild(script);
    } else {
        setTimeout(function() {
            if (typeof window.initPlots === 'function') window.initPlots();
        }, 10);
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
            height: 200px;
            border: 1px solid #f0f0f0;
            border-radius: 2px;
            margin: 10px 0;
            background: #fff;
            /* DISABLE ALL POINTER EVENTS FOR TRUE STATIC */
            pointer-events: none;
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
