let newTab = null;

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

  let quizTitle = "Generated Quiz";
  let shuffleOptions = true;
  let questionText = text;
  const plotObjects = []; // Array for our new native canvas plots

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
          if (key === 'shuffle') { shuffleOptions = value.toLowerCase() === 'true' || value === '1'; }
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

      // Regex now looks for 'plot'
      block = block.replace(/\[(code|quote|table|material|plot)(.*?)\]\n?([\s\S]*?)\n?\[\/(?:code|quote|table|material|plot)\]/g, (match, type, attrs, content) => {
        content = content.trim();
        if (type === 'code') {
          materialsHtml += `<div class="material-box"><pre><code>${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre></div>`;
        } else if (type === 'quote') {
            // --- THIS LOGIC WAS MISSING ---
            const parts = content.split('\n—');
            materialsHtml += `<div class="material-box"><figure><blockquote><p>${applyFormatting(parts[0].trim())}</p></blockquote>${parts[1] ? `<figcaption>— ${applyFormatting(parts[1].trim())}</figcaption>` : ''}</figure></div>`;
        } else if (type === 'material') {
            // --- THIS LOGIC WAS MISSING ---
            materialsHtml += `<div class="material-box"><p class="content-text">${applyFormatting(content).replace(/\n\n/g, '</p><p class="content-text">')}</p></div>`;
        } else if (type === 'table') {
            // --- THIS LOGIC WAS MISSING ---
            const rows = content.split('\n').map(r => r.trim().slice(1, -1).split('|').map(c => c.trim()));
            const header = rows[0]; const body = rows.slice(2);
            const tableHtml = `<table class="data-table"><thead><tr>${header.map(h => `<th>${applyFormatting(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(d => `<td>${applyFormatting(d)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            materialsHtml += `<div class="material-box">${tableHtml}</div>`;
        } else if (type === 'plot') {
          const canvasId = `plot-canvas-${qNum}-${plotObjects.length}`;
          materialsHtml += `<div class="material-box plot-container"><canvas id="${canvasId}" width="600" height="400"></canvas></div>`;

          const getAttr = (name, defaultValue) => {
            const match = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
            if (!match || !match[1]) return defaultValue;
            const parsed = match[1].split(',').map(Number);
            return parsed.length === 2 && !parsed.some(isNaN) ? parsed : defaultValue;
          };
          
          const getStepAttr = (name, defaultValue) => {
            const match = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
            if (!match || !match[1]) return defaultValue;
            const parsed = Number(match[1]);
            return isNaN(parsed) ? defaultValue : parsed;
          };

          plotObjects.push({
            id: canvasId,
            funcStr: content.replace(/\^/g, '**'), // Convert ^ to ** for JS
            xrange: getAttr('xrange', [-5, 5]),
            yrange: getAttr('yrange', [-5, 5]),
            xstep: getStepAttr('xstep', 1),
            ystep: getStepAttr('ystep', 1),
          });
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
      if (options.length > 0 && shuffleOptions) { shuffleArray(options); }
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
    plotObjects
  };
}

function createFullHtml(quizTitle, quizBody, cssContent, jsContent, plotObjects) {
    const finalCss = `
        .plot-container {
            padding: 0;
            border: none;
            text-align: center; /* Center the canvas */
            margin-top: 1em;
            margin-bottom: 1em;
        }
        .plot-container canvas {
            max-width: 100%;
            height: auto;
            border: 1px solid #ccc;
        }
        ${cssContent}
    `;

    const plotFunctionCode = `
    function plotFunctionWithGrid(canvasId, func, xMin, xMax, yMin, yMax, xStep=1, yStep=1) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) { console.error("Canvas not found:", canvasId); return; }
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        function xToCanvas(x) { return (x - xMin) / (xMax - xMin) * width; }
        function yToCanvas(y) { return height - (y - yMin) / (yMax - yMin) * height; }

        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        for (let x = Math.ceil(xMin/xStep)*xStep; x <= xMax; x += xStep) {
            if (Math.abs(x - 0) < 0.001) continue;
            const cx = xToCanvas(x);
            ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, height); ctx.stroke();
        }
        for (let y = Math.ceil(yMin/yStep)*yStep; y <= yMax; y += yStep) {
            if (Math.abs(y - 0) < 0.001) continue;
            const cy = yToCanvas(y);
            ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(width, cy); ctx.stroke();
        }

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, yToCanvas(0)); ctx.lineTo(width, yToCanvas(0)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xToCanvas(0), 0); ctx.lineTo(xToCanvas(0), height); ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let x = Math.ceil(xMin/xStep)*xStep; x <= xMax; x += xStep) {
            if (x !== 0) ctx.fillText(x, xToCanvas(x), yToCanvas(0)+5);
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = Math.ceil(yMin/yStep)*yStep; y <= yMax; y += yStep) {
            if (y !== 0) ctx.fillText(y, xToCanvas(0)-5, yToCanvas(y));
        }

        ctx.beginPath();
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        let first = true;
        for (let px = 0; px <= width; px++) {
            let x = xMin + px / width * (xMax - xMin);
            let y;
            try { y = func(x); } catch { continue; }
            if (isNaN(y) || !isFinite(y)) continue;
            let py = yToCanvas(y);
            if (first) { ctx.moveTo(px, py); first = false; }
            else { ctx.lineTo(px, py); }
        }
        ctx.stroke();
    }`;

    const rendererScript = `
      function renderPlots() {
        const plotData = ${JSON.stringify(plotObjects)};
        for (const plot of plotData) {
          try {
            const func = new Function('x', 'with(Math) { return ' + plot.funcStr + '; }');
            plotFunctionWithGrid(
                plot.id, func,
                plot.xrange[0], plot.xrange[1],
                plot.yrange[0], plot.yrange[1],
                plot.xstep, plot.ystep
            );
          } catch (e) {
            console.error("Failed to plot function for canvas #" + plot.id, e);
            const canvas = document.getElementById(plot.id);
            if(canvas) canvas.parentElement.innerHTML = '<p style="color:red;">Error: Invalid function syntax.</p>';
          }
        }
      }
      window.addEventListener('load', renderPlots);
    `;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${quizTitle}</title>
        <script>MathJax = { tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] } };<\/script>
        <script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" defer><\/script>
        <style>${finalCss}</style>
        </head>
        <body>
        ${quizBody}
        <script>${jsContent}<\/script>
        <script>
        ${plotFunctionCode}
        ${rendererScript}
        <\/script>
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
  const fullHtml = createFullHtml(quizOutput.title, quizOutput.body, cssContent, jsContent, quizOutput.plotObjects);

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
  const fullHtml = createFullHtml(quizOutput.title, quizOutput.body, cssContent, jsContent, quizOutput.plotObjects);

  const blob = new Blob([fullHtml], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "quiz.html";
  link.click();
  URL.revokeObjectURL(link.href);
}
