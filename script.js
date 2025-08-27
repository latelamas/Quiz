(() => {
  // Styling for inline/plain views
  const styleId = 'tex-inline-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .tex-raw-inline { display:inline; white-space:pre-wrap; word-break:break-word; cursor:default; }
      .tex-raw-block { display:block; white-space:pre-wrap; word-break:break-word; cursor:default; margin:0.5em 0; }
      .question-title > :first-child { cursor: pointer; user-select: none; }
    `;
    document.head.appendChild(style);
  }

  const ORIG_BY_SOURCE = new WeakMap();

  function texFromMathObj(math) {
    if (!math) return null;
    if (math.math) return math.math;
    try {
      const root = math.typesetRoot;
      const ann = root?.querySelector?.('annotation') || root?.querySelector?.('script[type="math/tex"]');
      if (ann) return ann.textContent || ann.innerText || null;
    } catch {}
    return null;
  }

  function createRawNode(tex, isDisplay) {
    const node = isDisplay ? document.createElement('div') : document.createElement('span');
    node.className = isDisplay ? 'tex-raw-block' : 'tex-raw-inline';
    node.textContent = tex;
    return node;
  }

  function annotateAllMathWithTex() {
    try {
      const doc = window.MathJax?.startup?.document;
      if (!doc) return;
      for (const math of doc.math) {
        const root = math.typesetRoot;
        if (!root) continue;
        const container = root.closest ? (root.closest('mjx-container') || root) : root;
        if (!container) continue;
        if (!container.hasAttribute('data-tex')) {
          const tex = texFromMathObj(math);
          if (tex) container.setAttribute('data-tex', tex);
        }
        container.style.pointerEvents = 'auto';
      }
    } catch {}
  }

  function toggleAllMathInQuestion(qBlock) {
    if (!qBlock) return;
    const rendered = Array.from(qBlock.querySelectorAll('[data-tex]'));
    const raw = Array.from(qBlock.querySelectorAll('.tex-raw-inline, .tex-raw-block'));

    if (rendered.length > 0) {
      for (const rn of rendered) {
        const tex = rn.getAttribute('data-tex');
        if (!tex) continue;
        const isDisplay = rn.getAttribute('display') === 'true' || window.getComputedStyle(rn).display === 'block';
        const rawNode = createRawNode(tex, isDisplay);
        ORIG_BY_SOURCE.set(rawNode, rn);
        rn.replaceWith(rawNode);
      }
      return;
    }

    if (raw.length > 0) {
      for (const r of raw) {
        const orig = ORIG_BY_SOURCE.get(r);
        if (orig) r.replaceWith(orig);
        else {
          const isBlock = r.classList.contains('tex-raw-block');
          const wrapper = document.createElement(isBlock ? 'div' : 'span');
          wrapper.textContent = (isBlock ? '$$' : '$') + r.textContent + (isBlock ? '$$' : '$');
          r.replaceWith(wrapper);
          if (window.MathJax?.typesetPromise) MathJax.typesetPromise([wrapper]);
        }
      }
    }
  }

  function isInteractiveEl(el) {
    if (!el || !el.closest) return false;
    return Boolean(el.closest('button, input, label, summary, a, textarea, select, .check-button'));
  }

  function findClickedQuestionNumberElement(path) {
    for (const el of path) {
      if (!el || el.nodeType !== 1) continue;
      const qTitle = el.closest && el.closest('.question-title');
      if (!qTitle) continue;
      const firstElChild = qTitle.firstElementChild;
      if (firstElChild && firstElChild === el) return el.closest('.question-block');
    }
    return null;
  }

  function installQuestionNumberClickHandler() {
    window.addEventListener('click', (ev) => {
      try {
        const path = ev.composedPath ? ev.composedPath() : [];

        // If click happened on any MathJax element, block it entirely
        if (path.some(el => el && el.tagName && el.tagName.toLowerCase() === 'mjx-container')) {
          ev.stopPropagation();
          ev.preventDefault();
          return;
        }

        // ignore clicks on interactive elements
        if (path.some(isInteractiveEl)) return;

        const qBlock = findClickedQuestionNumberElement(path);
        if (qBlock) {
          const hasRendered = qBlock.querySelector('[data-tex]') !== null;
          const hasRaw = qBlock.querySelector('.tex-raw-inline, .tex-raw-block') !== null;
          if (hasRendered || hasRaw) {
            toggleAllMathInQuestion(qBlock);
            ev.stopPropagation();
          }
          return;
        }
      } catch {}
    }, { capture: true, passive: true });
  }

  function disableClickOnMath() {
    // Disables left-click on all existing and future MathJax nodes
    function disableNode(el) {
      if (!el) return;
      el.addEventListener('click', e => e.preventDefault(), { capture: true });
    }

    document.querySelectorAll('mjx-container').forEach(disableNode);

    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!n) continue;
          if (n.tagName && n.tagName.toLowerCase() === 'mjx-container') disableNode(n);
          else if (n.querySelectorAll) n.querySelectorAll('mjx-container').forEach(disableNode);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  
  function init() {
    installQuestionNumberClickHandler();
    disableClickOnMath();

    if (window.MathJax?.startup?.promise) {
      MathJax.startup.promise.then(() => annotateAllMathWithTex()).catch(() => annotateAllMathWithTex());
    } else {
      window.addEventListener('load', () => {
        const p = window.MathJax?.startup?.promise;
        if (p) p.then(() => annotateAllMathWithTex()).catch(() => annotateAllMathWithTex());
        else annotateAllMathWithTex();
      });
    }

    const obs = new MutationObserver((muts) => {
      if (muts.some(m => m.addedNodes && m.addedNodes.length)) setTimeout(annotateAllMathWithTex, 0);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();

  // Quiz logic
  function wireQuiz() {
    document.querySelectorAll('.check-button').forEach(button => {
      button.addEventListener('click', () => {
        const qBlock = button.closest('.question-block');
        const feedback = qBlock.querySelector('.feedback');
        const explanation = qBlock.querySelector('.explanation');
        const selected = qBlock.querySelector(`input[name="${qBlock.id}"]:checked`);

        if (!selected) {
          feedback.textContent = "Please select an answer.";
          feedback.className = "feedback incorrect";
          explanation.style.display = 'none';
          return;
        }

        if (selected.value === qBlock.dataset.correctAnswer) {
          feedback.textContent = "✓";
          feedback.className = "feedback correct";
          explanation.style.display = 'block';
        } else {
          feedback.textContent = "✖";
          feedback.className = "feedback incorrect";
          explanation.style.display = 'none';
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireQuiz);
  } else {
    wireQuiz();
  }
})();
