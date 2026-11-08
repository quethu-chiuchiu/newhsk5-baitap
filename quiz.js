/* ============================================================
   HSK5 Luyện Tập — shared JS helpers (namespace HSK)
   Dùng chung cho index.html và mọi trang bai*.html
   - HSK.initTabs()          : hiện đúng tab (Nghe/Đọc/Viết/Từ vựng) theo #hash
   - HSK.Quiz(...)           : dựng câu trắc nghiệm, câu sắp xếp từ + tự chấm điểm
   - HSK.mountListeningQuiz  : chấm phần Nghe theo file đáp án .txt
   - HSK.mountEssay          : ô viết đoạn văn (không tự chấm)
   - HSK.mountVocabGame      : trò chơi từ vựng
   - HSK.collectResult / buildPrintableHtml : gom bài làm và dựng phiếu in/PDF
   Mọi khoá localStorage đều có tiền tố "hsk5_" để không lẫn với site HSK3
   (các repo GitHub Pages của anh chạy chung một tên miền).
   ============================================================ */
window.HSK = (function(){

  function el(html){
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ---------- Ảnh: src ban đầu luôn là .webp; nếu không có thì tự thử
     các đuôi khác (data-base = đường dẫn KHÔNG có đuôi). ---------- */
  const IMG_EXTS = ['webp','png','jpg','jpeg','WEBP','PNG','JPG','JPEG'];
  function imgFallback(img){
    const base = img.dataset.base;
    if(!base){ img.style.display = 'none'; return; }
    const idx = parseInt(img.dataset.extIdx || '0', 10) + 1;
    if(idx >= IMG_EXTS.length){ img.style.display = 'none'; return; }
    img.dataset.extIdx = idx;
    img.src = base + '.' + IMG_EXTS[idx];
  }

  /* ---------- Chuyển tab theo location.hash ---------- */
  function initTabs(defaultTab){
    const sections = Array.from(document.querySelectorAll('.tab-section'));
    function show(){
      const tab = (location.hash || '#' + defaultTab).replace('#','');
      let found = false;
      sections.forEach(sec=>{
        const match = sec.dataset.tab === tab;
        sec.classList.toggle('active', match);
        if(match) found = true;
      });
      if(!found && sections.length){
        sections.forEach((sec,i)=>sec.classList.toggle('active', i===0));
      }
    }
    window.addEventListener('hashchange', show);
    show();
  }

  /* Bỏ dấu câu và khoảng trắng để so câu sắp xếp với đáp án */
  function normSentence(s){
    return String(s || '').replace(/[\s。．.，,？?！!；;：:、“”"'‘’]/g, '');
  }

  /* ============================================================
     Quiz engine
     ============================================================ */
  function Quiz(opts){
    this.scoreTxtId  = opts.scoreTxtId;
    this.gradeBtnId  = opts.gradeBtnId;
    this.resetBtnId  = opts.resetBtnId;
    this.answers = {};
    this.questions = []; // {n, ans, type, accepted?, tokens?}
    this.orderState = {}; // n -> [chỉ số token đã chọn theo thứ tự]
    this.graded = false;
  }

  Quiz.prototype.registerQuestion = function(n, ans, type, extra){
    const q = {n:n, ans:ans, type: type || 'choice'};
    if(extra) Object.keys(extra).forEach(k=>q[k]=extra[k]);
    this.questions.push(q);
    return q;
  };

  Quiz.prototype.makeOptBtn = function(qn, letter, label){
    const self = this;
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.type = 'button';
    btn.dataset.q = qn;
    btn.dataset.letter = letter;
    btn.textContent = label ? (letter + ' ' + label) : letter;
    btn.addEventListener('click', function(){
      if(self.graded) return;
      self.answers[qn] = letter;
      document.querySelectorAll('.opt-btn[data-q="'+qn+'"]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      self.updateLabel();
    });
    return btn;
  };

  Quiz.prototype.isAnswered = function(q){
    if(q.type === 'order') return (this.orderState[q.n] || []).length > 0;
    return !!this.answers[q.n];
  };

  Quiz.prototype.updateLabel = function(){
    if(this.graded || !this.scoreTxtId) return;
    const answered = this.questions.filter(q=>this.isAnswered(q)).length;
    const elx = document.getElementById(this.scoreTxtId);
    if(elx) elx.textContent = 'Đã làm ' + answered + ' / ' + this.questions.length + ' câu';
  };

  function makeExplain(n, html, noPad){
    const exp = document.createElement('div');
    exp.className = 'explain';
    exp.id = 'exp-' + n;
    if(noPad) exp.style.paddingLeft = '0';
    exp.innerHTML = html;
    return exp;
  }

  /* Đoạn văn + câu trắc nghiệm. passageHtml = null nếu không có đoạn văn.
     starText = '' nếu câu chỉ có số (dạng điền chỗ trống / chọn ý đúng).
     Trả về khối để gắn thêm câu dùng chung đoạn văn bằng appendMCQToBlock. */
  Quiz.prototype.mountMCQBlock = function(containerEl, n, passageHtml, starText, optionsDict, answerLetter){
    const block = document.createElement('div');
    block.className = 'q-row q-block';
    if(passageHtml){
      const p = document.createElement('div');
      p.className = 'passage';
      p.innerHTML = passageHtml;
      block.appendChild(p);
    }
    containerEl.appendChild(block);
    this.appendMCQToBlock(block, n, starText, optionsDict, answerLetter);
    return block;
  };

  Quiz.prototype.appendMCQToBlock = function(blockEl, n, starText, optionsDict, answerLetter){
    this.registerQuestion(n, answerLetter);
    const star = document.createElement('div');
    star.className = 'star-q';
    star.innerHTML = '<span class="star-q-num">'+n+'.</span>' + (starText || '');
    blockEl.appendChild(star);
    const grp = document.createElement('div');
    grp.className = 'opt-group';
    Object.keys(optionsDict).forEach(letter=>grp.appendChild(this.makeOptBtn(n, letter, optionsDict[letter])));
    blockEl.appendChild(grp);
    blockEl.appendChild(makeExplain(n, 'Đáp án: <b>'+answerLetter+' '+optionsDict[answerLetter]+'</b>', true));
  };

  /* Câu "完成句子": bấm lần lượt các từ để ghép câu, bấm lại từ đã chọn
     để trả về. accepted = mảng các câu đúng (so sánh bỏ dấu câu). */
  Quiz.prototype.mountSentenceOrder = function(containerEl, n, tokens, accepted){
    const self = this;
    const acc = Array.isArray(accepted) ? accepted : [accepted];
    this.registerQuestion(n, acc[0], 'order', {accepted: acc, tokens: tokens});
    this.orderState[n] = [];

    const row = el('<div class="q-row q-block order-q" data-q="'+n+'">'+
      '<div class="order-head"><div class="q-num">'+n+'.</div>'+
        '<div class="order-answer" data-q="'+n+'"><span class="order-placeholder">Bấm các từ bên dưới theo đúng thứ tự…</span></div>'+
      '</div>'+
      '<div class="order-bank" data-q="'+n+'"></div>'+
      '</div>');
    const answerBox = row.querySelector('.order-answer');
    const bank = row.querySelector('.order-bank');

    function render(){
      const chosen = self.orderState[n];
      bank.innerHTML = '';
      tokens.forEach(function(tok, i){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'order-chip' + (chosen.indexOf(i) >= 0 ? ' used' : '');
        b.textContent = tok;
        b.disabled = chosen.indexOf(i) >= 0 || self.graded;
        b.addEventListener('click', function(){
          if(self.graded) return;
          chosen.push(i);
          render(); self.updateLabel();
        });
        bank.appendChild(b);
      });
      answerBox.innerHTML = '';
      if(!chosen.length){
        answerBox.innerHTML = '<span class="order-placeholder">Bấm các từ bên dưới theo đúng thứ tự…</span>';
      }
      chosen.forEach(function(idx, pos){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'order-chip in-answer';
        b.textContent = tokens[idx];
        b.disabled = self.graded;
        b.addEventListener('click', function(){
          if(self.graded) return;
          chosen.splice(pos, 1);
          render(); self.updateLabel();
        });
        answerBox.appendChild(b);
      });
    }
    row._render = render;
    render();
    row.appendChild(makeExplain(n, 'Đáp án: <b>'+escapeHtml(acc[0])+'</b>', true));
    containerEl.appendChild(row);
  };

  Quiz.prototype.orderValue = function(q){
    return (this.orderState[q.n] || []).map(i=>q.tokens[i]).join('');
  };

  Quiz.prototype.isCorrect = function(q){
    if(q.type === 'order'){
      const v = normSentence(this.orderValue(q));
      return q.accepted.some(a=>normSentence(a) === v);
    }
    return this.answers[q.n] === q.ans;
  };

  Quiz.prototype.grade = function(){
    this.graded = true;
    let correct = 0;
    const self = this;
    this.questions.forEach(function(q){
      const ok = self.isCorrect(q);
      if(ok) correct++;
      if(q.type === 'order'){
        const row = document.querySelector('.order-q[data-q="'+q.n+'"]');
        if(row){
          row._render();
          const box = row.querySelector('.order-answer');
          box.classList.remove('correct','wrong');
          box.classList.add(ok ? 'correct' : 'wrong');
        }
      } else {
        const chosen = self.answers[q.n];
        document.querySelectorAll('.opt-btn[data-q="'+q.n+'"]').forEach(function(btn){
          btn.classList.add('locked');
          if(btn.dataset.letter === q.ans) btn.classList.add('correct');
          else if(btn.dataset.letter === chosen) btn.classList.add('wrong');
        });
      }
      const exp = document.getElementById('exp-'+q.n);
      if(exp) exp.classList.add('show');
    });
    if(this.scoreTxtId){
      const elx = document.getElementById(this.scoreTxtId);
      if(elx) elx.textContent = 'Kết quả: ' + correct + ' / ' + this.questions.length + ' câu đúng 🎉';
    }
    return correct;
  };

  /* Chỉ làm lại các câu thuộc quiz này (không đụng tới phần khác trên trang) */
  Quiz.prototype.reset = function(){
    const self = this;
    this.graded = false;
    this.answers = {};
    this.questions.forEach(function(q){
      if(q.type === 'order'){
        self.orderState[q.n] = [];
        const row = document.querySelector('.order-q[data-q="'+q.n+'"]');
        if(row){
          row.querySelector('.order-answer').classList.remove('correct','wrong');
          row._render();
        }
      } else {
        document.querySelectorAll('.opt-btn[data-q="'+q.n+'"]').forEach(function(btn){
          btn.classList.remove('selected','correct','wrong','locked');
        });
      }
      const exp = document.getElementById('exp-'+q.n);
      if(exp) exp.classList.remove('show');
    });
    this.updateLabel();
  };

  Quiz.prototype.getSummary = function(){
    const self = this;
    const answers = {}, answerKey = {};
    this.questions.forEach(function(q){
      answerKey[q.n] = q.ans;
      answers[q.n] = q.type === 'order' ? self.orderValue(q) : (self.answers[q.n] || '');
    });
    let correct = null, correctMap = null;
    if(this.graded){
      correct = 0; correctMap = {};
      this.questions.forEach(function(q){
        const ok = self.isCorrect(q);
        correctMap[q.n] = ok;
        if(ok) correct++;
      });
    }
    return { total: this.questions.length, graded: this.graded, correct: correct, correctMap: correctMap, answers: answers, answerKey: answerKey };
  };

  Quiz.prototype.bindButtons = function(){
    const self = this;
    const g = this.gradeBtnId && document.getElementById(this.gradeBtnId);
    if(g) g.addEventListener('click', ()=>self.grade());
    const r = this.resetBtnId && document.getElementById(this.resetBtnId);
    if(r) r.addEventListener('click', ()=>self.reset());
    this.updateLabel();
  };

  /* ============================================================
     Phần Nghe — các nút dựng sẵn trên trang (data-q, data-letter),
     chấm theo file đáp án .txt dạng "1C" mỗi dòng.
     ============================================================ */
  function parseAnswerKey(text){
    const dict = {};
    String(text || '').split(/\r?\n/).forEach(function(line){
      const m = line.trim().match(/^(\d+)\s*([A-Za-z])$/);
      if(m) dict[m[1]] = m[2].toUpperCase();
    });
    return dict;
  }

  /* Dựng một dòng câu Nghe có lựa chọn chữ: opts = ['...','...',...] */
  function listeningRow(n, opts){
    const optHtml = opts.map(function(o,i){
      const letter = String.fromCharCode(65+i);
      return '<button type="button" class="opt-btn" data-q="'+n+'" data-letter="'+letter+'">'+letter+' '+o+'</button>';
    }).join('');
    return el('<div class="q-row"><div class="q-num">'+n+'.</div><div class="opt-group">'+optHtml+'</div></div>');
  }

  function mountListeningQuiz(scopeSelector, answersDict, opts){
    const container = document.querySelector(scopeSelector);
    if(!container) return null;

    const questionNums = opts.questionNums || [];
    const hasKey = !!(answersDict && Object.keys(answersDict).length);
    let graded = false;

    const scoreBar = opts.scoreBarId ? document.getElementById(opts.scoreBarId) : null;
    const scoreTxt = opts.scoreTxtId ? document.getElementById(opts.scoreTxtId) : null;
    const gradeBtn = opts.gradeBtnId ? document.getElementById(opts.gradeBtnId) : null;
    const resetBtn = opts.resetBtnId ? document.getElementById(opts.resetBtnId) : null;
    if(hasKey && scoreBar) scoreBar.style.display = '';

    function updateLabel(){
      if(graded || !scoreTxt) return;
      const answered = questionNums.filter(n=>container.querySelector('.opt-btn.selected[data-q="'+n+'"]')).length;
      scoreTxt.textContent = 'Đã làm ' + answered + ' / ' + questionNums.length + ' câu';
    }

    container.addEventListener('click', function(e){
      const btn = e.target.closest('.opt-btn');
      if(!btn || !container.contains(btn) || graded) return;
      container.querySelectorAll('.opt-btn[data-q="'+btn.dataset.q+'"]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      updateLabel();
    });

    function grade(){
      if(!hasKey) return null;
      graded = true;
      let correct = 0;
      questionNums.forEach(function(n){
        const ans = answersDict[n];
        const chosenBtn = container.querySelector('.opt-btn.selected[data-q="'+n+'"]');
        const chosen = chosenBtn ? chosenBtn.dataset.letter : null;
        container.querySelectorAll('.opt-btn[data-q="'+n+'"]').forEach(function(btn){
          btn.classList.add('locked');
          if(btn.dataset.letter === ans) btn.classList.add('correct');
          else if(btn === chosenBtn) btn.classList.add('wrong');
        });
        if(chosen === ans) correct++;
      });
      if(scoreTxt) scoreTxt.textContent = 'Kết quả: ' + correct + ' / ' + questionNums.length + ' câu đúng 🎉';
      return correct;
    }

    function reset(){
      graded = false;
      container.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected','correct','wrong','locked'));
      updateLabel();
    }

    if(gradeBtn) gradeBtn.addEventListener('click', grade);
    if(resetBtn) resetBtn.addEventListener('click', reset);
    updateLabel();

    function getSummary(){
      const answers = {};
      questionNums.forEach(function(n){
        const b = container.querySelector('.opt-btn.selected[data-q="'+n+'"]');
        answers[n] = b ? b.dataset.letter : '';
      });
      let correct = null, correctMap = null;
      if(graded){
        correct = 0; correctMap = {};
        questionNums.forEach(function(n){
          const ok = answers[n] === answersDict[n];
          correctMap[n] = ok;
          if(ok) correct++;
        });
      }
      return { total: questionNums.length, graded: graded, correct: correct, correctMap: correctMap, answers: answers, answerKey: hasKey ? answersDict : {} };
    }

    return { grade: grade, reset: reset, getSummary: getSummary, hasKey: hasKey };
  }

  /* ============================================================
     Viết đoạn văn (写短文) — không tự chấm. Đếm số chữ Hán, đánh dấu
     từ bắt buộc đã dùng, có nút xem bài mẫu.
     ============================================================ */
  function countHanzi(s){
    const m = String(s || '').match(/[㐀-鿿]/g);
    return m ? m.length : 0;
  }

  function mountEssay(containerEl, n, words, targetLen, sampleHtml){
    const block = el('<div class="q-row q-block essay-q">'+
      '<div class="essay-prompt"><span class="star-q-num">'+n+'.</span>'+
        'Dùng <b>đủ</b> các từ sau (thứ tự tùy ý), viết đoạn văn khoảng <b>'+targetLen+' chữ</b>:</div>'+
      '<div class="essay-words">'+words.map(w=>'<span class="essay-word" data-w="'+w+'">'+w+'</span>').join('')+'</div>'+
      '<textarea class="writing-textarea essay-textarea" data-q="'+n+'" placeholder="Viết đoạn văn của bạn ở đây…"></textarea>'+
      '<div class="essay-meta"><span class="essay-count">0 chữ</span><span class="essay-used">Đã dùng 0 / '+words.length+' từ</span></div>'+
      '<div><button type="button" class="reveal-btn">Xem bài mẫu</button></div>'+
      '<div class="sample-answer">'+sampleHtml+'</div>'+
      '</div>');
    const ta = block.querySelector('textarea');
    const countEl = block.querySelector('.essay-count');
    const usedEl = block.querySelector('.essay-used');
    function update(){
      const v = ta.value;
      const c = countHanzi(v);
      countEl.textContent = c + ' chữ';
      countEl.classList.toggle('ok', c >= targetLen * 0.8);
      let used = 0;
      block.querySelectorAll('.essay-word').forEach(function(w){
        const u = v.indexOf(w.dataset.w) >= 0;
        w.classList.toggle('used', u);
        if(u) used++;
      });
      usedEl.textContent = 'Đã dùng ' + used + ' / ' + words.length + ' từ';
      usedEl.classList.toggle('ok', used === words.length);
    }
    ta.addEventListener('input', update);
    ta.dataset.words = words.join('、');
    const btn = block.querySelector('.reveal-btn');
    const sample = block.querySelector('.sample-answer');
    btn.addEventListener('click', ()=>{
      sample.classList.toggle('show');
      btn.textContent = sample.classList.contains('show') ? 'Ẩn bài mẫu' : 'Xem bài mẫu';
    });
    containerEl.appendChild(block);
  }

  /* ============================================================
     Gom bài làm của trang (gọi từ index.html qua iframe)
     Cần window.HSK_PAGE = {listening, reading, writingOrder}
     ============================================================ */
  function collectResult(meta){
    const page = window.HSK_PAGE || {};
    const pick = q => (q && typeof q.getSummary === 'function') ? q.getSummary() : null;
    const result = {
      lessonId: meta && meta.lessonId,
      lessonName: meta && meta.lessonName,
      listening: pick(page.listening),
      reading: pick(page.reading),
      writing: { order: pick(page.writingOrder), essays: [] }
    };
    document.querySelectorAll('.tab-section[data-tab="writing"] .essay-textarea').forEach(function(ta){
      result.writing.essays.push({ q: ta.dataset.q, words: ta.dataset.words || '', text: ta.value.trim(), count: countHanzi(ta.value) });
    });
    return result;
  }

  function renderResultSummary(sum){
    if(!sum) return '<div class="pr-row">(chưa có dữ liệu)</div>';
    const hasKey = sum.answerKey && Object.keys(sum.answerKey).length;
    const scoreLine = sum.graded
      ? '<div class="pr-row"><b>Số câu đúng: '+sum.correct+' / '+sum.total+'</b></div>'
      : '<div class="pr-row">(chưa bấm Chấm điểm)</div>';
    const rows = Object.keys(sum.answers).map(function(q){
      const chosen = sum.answers[q] || '';
      const correctAns = hasKey ? sum.answerKey[q] : null;
      let line = 'Câu '+escapeHtml(q)+': <b>'+escapeHtml(chosen || '(chưa làm)')+'</b>';
      if(correctAns){
        if(sum.graded){
          const ok = sum.correctMap ? sum.correctMap[q] : (chosen === correctAns);
          line += ok ? ' <span style="color:#2f9e56;">✓ đúng</span>'
                     : ' <span style="color:#d13c2f;">✗ (đáp án: '+escapeHtml(correctAns)+')</span>';
        } else {
          line += ' <span style="color:#5c5148;">(đáp án: '+escapeHtml(correctAns)+')</span>';
        }
      }
      return '<div class="pr-row">'+line+'</div>';
    }).join('');
    return scoreLine + rows;
  }

  function buildPrintableHtml(data){
    const essays = ((data.writing && data.writing.essays) || []).map(function(e){
      return '<div class="pr-row">Câu '+escapeHtml(e.q)+' — từ bắt buộc: '+escapeHtml(e.words)+' · '+e.count+' chữ</div>'+
        '<div class="pr-essay">'+(e.text ? escapeHtml(e.text).replace(/\n/g,'<br>') : '(chưa viết)')+'</div>'+
        '<div class="pr-row">Điểm giáo viên chấm: ____________</div>';
    }).join('') || '<div class="pr-row">(chưa viết)</div>';
    const timeStr = data.timestamp ? new Date(data.timestamp).toLocaleString('vi-VN') : '';

    return '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Kết quả HSK5 — '+escapeHtml(data.hocvien)+' — '+escapeHtml(data.lessonName)+'</title>' +
      '<style>' +
      'body{font-family:Arial,"Noto Sans SC","Microsoft YaHei",sans-serif;max-width:720px;margin:30px auto;padding:0 16px;color:#2a2118;}' +
      'h1{font-size:20px;margin-bottom:2px;}' +
      '.meta{color:#5c5148;font-size:13.5px;margin-bottom:20px;}' +
      'h2{font-size:16px;background:#fff6ef;padding:8px 12px;border-radius:8px;margin-top:26px;}' +
      '.pr-row{padding:4px;border-bottom:1px solid #f0ddd0;font-size:14px;}' +
      '.pr-essay{padding:10px 12px;margin:6px 0;border:1px solid #f0ddd0;border-radius:8px;font-size:15px;line-height:1.8;}' +
      '.tip{color:#5c5148;font-size:12.5px;margin-top:24px;}' +
      '@media print{ body{margin:10px auto;} .tip{display:none;} }' +
      '</style></head><body>' +
      '<h1>Kết quả luyện tập HSK5</h1>' +
      '<div class="meta">Học viên: <b>'+escapeHtml(data.hocvien)+'</b> &nbsp;·&nbsp; Bài: <b>'+escapeHtml(data.lessonName)+'</b> &nbsp;·&nbsp; Thời gian: '+timeStr+'</div>' +
      '<h2>🎧 Nghe</h2>' + renderResultSummary(data.listening) +
      '<h2>📖 Đọc</h2>' + renderResultSummary(data.reading) +
      '<h2>✍️ Viết — Phần I (sắp xếp câu)</h2>' + renderResultSummary(data.writing && data.writing.order) +
      '<h2>✍️ Viết — Phần II (viết đoạn văn)</h2>' + essays +
      '<div class="tip">Trong hộp thoại in, chọn máy in "Lưu thành PDF" (Save as PDF) để xuất file PDF.</div>' +
      '</body></html>';
  }

  /* ============================================================
     Trò chơi Từ vựng "Đố vui tốc độ" (không tính vào phiếu kết quả)
     vocabList: [{hanzi, pinyin, mean}] — opts: {lessonId}
     ============================================================ */
  function mountVocabGame(containerSelector, vocabList, opts){
    const root = document.querySelector(containerSelector);
    if(!root) return;
    const lessonId = (opts && opts.lessonId) || 'bai';
    const HS_KEY = 'hsk5_vocab_highscore_' + lessonId;
    const TIME_MS = 8000;
    const list = (vocabList || []).filter(w=>w && w.hanzi && w.mean);

    if(list.length < 4){
      root.innerHTML = '<div class="placeholder-box"><div class="big">📚</div>Từ vựng bài này đang được cập nhật, quay lại sau nhé!</div>';
      return;
    }

    let order = [], qi = 0, score = 0, streak = 0, correctCount = 0, timer = null, tStart = 0, answered = false;

    function shuffle(arr){
      const a = arr.slice();
      for(let i=a.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        const t=a[i]; a[i]=a[j]; a[j]=t;
      }
      return a;
    }
    function getHighScore(){ try{ return parseInt(localStorage.getItem(HS_KEY) || '0', 10); }catch(e){ return 0; } }
    function setHighScore(v){ try{ localStorage.setItem(HS_KEY, String(v)); }catch(e){} }

    function renderStart(){
      const hs = getHighScore();
      root.innerHTML =
        '<div class="vocab-start">' +
          '<div class="vocab-start-icon">🎮</div>' +
          '<h3>Đố vui từ vựng tốc độ</h3>' +
          '<p>'+list.length+' từ · Trả lời đúng nghĩa trước khi hết giờ, đúng liên tiếp được combo điểm thưởng!</p>' +
          (hs > 0 ? '<div class="vocab-highscore">🏆 Điểm cao nhất: <b>'+hs+'</b></div>' : '') +
          '<button type="button" class="btn btn-primary vocab-start-btn">Bắt đầu chơi</button>' +
        '</div>';
      root.querySelector('.vocab-start-btn').addEventListener('click', startRound);
    }

    function startRound(){
      order = shuffle(list);
      qi = 0; score = 0; streak = 0; correctCount = 0;
      renderQuestion();
    }

    function makeOptions(word){
      const pool = list.filter(w=>w.hanzi !== word.hanzi && w.mean !== word.mean);
      const distractors = shuffle(pool).slice(0, 3).map(w=>w.mean);
      return shuffle(distractors.concat([word.mean]));
    }

    function renderQuestion(){
      answered = false;
      if(qi >= order.length){ renderEnd(); return; }
      const word = order[qi];
      const options = makeOptions(word);
      root.innerHTML =
        '<div class="vocab-game">' +
          '<div class="vocab-hud">' +
            '<span class="vocab-progress">Câu '+(qi+1)+' / '+order.length+'</span>' +
            '<span class="vocab-score">Điểm: '+score+'</span>' +
            (streak >= 2 ? '<span class="vocab-streak">🔥 Combo x'+streak+'</span>' : '') +
          '</div>' +
          '<div class="vocab-timerbar"><div class="vocab-timerbar-fill"></div></div>' +
          '<div class="vocab-word"><div class="vocab-hanzi">'+word.hanzi+'</div></div>' +
          '<div class="vocab-options">' +
            options.map(o=>'<button type="button" class="vocab-opt-btn">'+o+'</button>').join('') +
          '</div>' +
        '</div>';
      const fill = root.querySelector('.vocab-timerbar-fill');
      tStart = Date.now();
      clearInterval(timer);
      timer = setInterval(function(){
        const elapsed = Date.now() - tStart;
        if(fill) fill.style.width = Math.max(0, 100 - (elapsed / TIME_MS) * 100) + '%';
        if(elapsed >= TIME_MS){
          clearInterval(timer);
          if(!answered) handleAnswer(null, word);
        }
      }, 50);
      root.querySelectorAll('.vocab-opt-btn').forEach(function(btn){
        btn.addEventListener('click', function(){ if(!answered) handleAnswer(btn, word); });
      });
    }

    function handleAnswer(btnEl, word){
      answered = true;
      clearInterval(timer);
      const isCorrect = !!btnEl && btnEl.textContent === word.mean;
      root.querySelectorAll('.vocab-opt-btn').forEach(function(b){
        b.classList.add('locked');
        if(b.textContent === word.mean) b.classList.add('correct');
        else if(b === btnEl) b.classList.add('wrong');
      });
      if(isCorrect){
        streak++; correctCount++;
        score += 10 + (streak > 1 ? Math.min(streak, 5) * 2 : 0);
      } else {
        streak = 0;
      }
      const scoreEl = root.querySelector('.vocab-score');
      if(scoreEl) scoreEl.textContent = 'Điểm: ' + score;
      setTimeout(function(){ qi++; renderQuestion(); }, 900);
    }

    function renderEnd(){
      const hs = getHighScore();
      const isNewHigh = score > hs;
      if(isNewHigh) setHighScore(score);
      root.innerHTML =
        '<div class="vocab-end">' +
          '<div class="vocab-end-icon">'+(isNewHigh ? '🏆' : '🎉')+'</div>' +
          '<h3>'+(isNewHigh ? 'Kỷ lục mới!' : 'Hoàn thành!')+'</h3>' +
          '<div class="vocab-end-score">'+score+' điểm</div>' +
          '<p>Đúng '+correctCount+' / '+order.length+' câu' + (isNewHigh ? '' : ' · Điểm cao nhất: '+hs) + '</p>' +
          '<button type="button" class="btn btn-primary vocab-again-btn">Chơi lại</button>' +
        '</div>';
      root.querySelector('.vocab-again-btn').addEventListener('click', startRound);
    }

    renderStart();
  }

  return { el, escapeHtml, imgFallback, initTabs, Quiz, parseAnswerKey, listeningRow, mountListeningQuiz,
           mountEssay, countHanzi, mountVocabGame, collectResult, buildPrintableHtml };
})();
