// ---- generic helpers ----

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---- app state: which grid is showing ----

const state = {
  view: 'topics', // 'topics' | 'subtopics' | 'questions'
  topicId: null,
  topicData: null, // cached GET /admin/topics/:id response, reused for both sub-topics and questions grids
  subTopicId: null,
};

const els = {
  breadcrumb: document.getElementById('breadcrumb'),
  gridTitle: document.getElementById('gridTitle'),
  addBtn: document.getElementById('addBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  gridEmpty: document.getElementById('gridEmpty'),
  grid: document.getElementById('grid'),
  gridHead: document.getElementById('gridHead'),
  gridBody: document.getElementById('gridBody'),
};

els.downloadBtn.addEventListener('click', () => {
  if (!state.topicId) return;
  window.location.href = `/admin/topics/${encodeURIComponent(state.topicId)}/export`;
});

function renderBreadcrumb() {
  const parts = [`<a data-nav="topics">Topics</a>`];
  if (state.view === 'subtopics' || state.view === 'questions') {
    parts.push(`<a data-nav="subtopics">${escapeHtml(state.topicData.title)}</a>`);
  }
  if (state.view === 'questions') {
    const st = state.topicData.subTopics.find((s) => s.id === state.subTopicId);
    parts.push(`<span class="crumb-current">${escapeHtml(st ? st.label : state.subTopicId)}</span>`);
  }
  els.breadcrumb.innerHTML = parts.join('<span class="crumb-sep">&rsaquo;</span>');
  els.breadcrumb.querySelectorAll('a[data-nav]').forEach((a) => {
    a.addEventListener('click', () => {
      if (a.dataset.nav === 'topics') showTopics();
      else if (a.dataset.nav === 'subtopics') showSubTopics(state.topicId, state.topicData);
    });
  });
}

function setGridEmpty(message) {
  els.gridEmpty.textContent = message;
  els.gridEmpty.style.display = 'block';
  els.grid.style.display = 'none';
}

function setGridRows(headHtml, bodyHtml) {
  els.gridEmpty.style.display = 'none';
  els.grid.style.display = 'table';
  els.gridHead.innerHTML = headHtml;
  els.gridBody.innerHTML = bodyHtml;
}

// ---- Topics grid ----

async function showTopics() {
  state.view = 'topics';
  state.topicId = null;
  state.topicData = null;
  state.subTopicId = null;
  els.gridTitle.textContent = 'Topics';
  els.addBtn.textContent = '+ Add Topic';
  els.downloadBtn.style.display = 'none';
  renderBreadcrumb();

  els.gridEmpty.style.display = 'block';
  els.gridEmpty.textContent = 'Loading…';
  els.grid.style.display = 'none';

  const data = await api('GET', '/modules');
  const modules = data.modules || [];
  if (modules.length === 0) {
    setGridEmpty('No topics yet — click "Add Topic" to create one.');
    return;
  }

  const rows = modules
    .map(
      (m) => `
    <tr>
      <td>${escapeHtml(m.title)}</td>
      <td>${Array.isArray(m.subTopics) ? m.subTopics.length : '—'}</td>
      <td class="actions">
        <button class="small secondary" data-action="manage" data-id="${escapeHtml(m.id)}">Manage</button>
        <button class="small secondary" data-action="edit" data-id="${escapeHtml(m.id)}" data-title="${escapeHtml(m.title)}">Edit</button>
        <button class="small danger" data-action="delete" data-id="${escapeHtml(m.id)}" data-title="${escapeHtml(m.title)}">Delete</button>
      </td>
    </tr>`
    )
    .join('');

  setGridRows('<tr><th>Topic</th><th>Sub-topics</th><th></th></tr>', rows);

  els.gridBody.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { action, id, title } = btn.dataset;
      if (action === 'manage') {
        await enterTopic(id);
      } else if (action === 'edit') {
        openModal({
          title: 'Edit topic',
          fields: [{ name: 'title', label: 'Title', type: 'text', value: title }],
          onSave: async (values) => {
            await api('PUT', `/admin/topics/${encodeURIComponent(id)}`, { title: values.title });
            await showTopics();
          },
        });
      } else if (action === 'delete') {
        if (!confirm(`Delete "${title}"? This removes it from the live app immediately.`)) return;
        await api('DELETE', `/admin/topics/${encodeURIComponent(id)}`);
        await showTopics();
      }
    });
  });

  els.addBtn.onclick = () => {
    openModal({
      title: 'Add topic',
      fields: [{ name: 'title', label: 'Title', type: 'text', value: '' }],
      onSave: async (values) => {
        await api('POST', '/admin/topics', { title: values.title });
        await showTopics();
      },
    });
  };
}

async function enterTopic(moduleId) {
  const data = await api('GET', `/admin/topics/${encodeURIComponent(moduleId)}`);
  state.topicId = moduleId;
  state.topicData = data;
  showSubTopics(moduleId, data);
}

// ---- Sub-topics grid ----

async function refreshTopicData() {
  state.topicData = await api('GET', `/admin/topics/${encodeURIComponent(state.topicId)}`);
}

function showSubTopics(moduleId, data) {
  state.view = 'subtopics';
  state.topicId = moduleId;
  state.topicData = data;
  state.subTopicId = null;
  els.gridTitle.textContent = `Sub-topics — ${data.title}`;
  els.addBtn.textContent = '+ Add Sub-Topic';
  els.downloadBtn.style.display = 'inline-block';
  renderBreadcrumb();

  const subTopics = data.subTopics || [];
  if (subTopics.length === 0) {
    setGridEmpty('No sub-topics yet — click "Add Sub-Topic" to create one.');
  } else {
    const rows = subTopics
      .map(
        (st) => `
      <tr>
        <td>${escapeHtml(st.label)}</td>
        <td>${st.items.length}</td>
        <td class="actions">
          <button class="small secondary" data-action="manage" data-id="${escapeHtml(st.id)}">Manage</button>
          <button class="small secondary" data-action="edit" data-id="${escapeHtml(st.id)}" data-label="${escapeHtml(st.label)}">Edit</button>
          <button class="small danger" data-action="delete" data-id="${escapeHtml(st.id)}" data-label="${escapeHtml(st.label)}">Delete</button>
        </td>
      </tr>`
      )
      .join('');
    setGridRows('<tr><th>Sub-Topic</th><th>Questions</th><th></th></tr>', rows);

    els.gridBody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { action, id, label } = btn.dataset;
        if (action === 'manage') {
          showQuestions(id);
        } else if (action === 'edit') {
          openModal({
            title: 'Edit sub-topic',
            fields: [{ name: 'label', label: 'Label', type: 'text', value: label }],
            onSave: async (values) => {
              await api('PUT', `/admin/topics/${encodeURIComponent(state.topicId)}/subtopics/${encodeURIComponent(id)}`, {
                label: values.label,
              });
              await refreshTopicData();
              showSubTopics(state.topicId, state.topicData);
            },
          });
        } else if (action === 'delete') {
          if (!confirm(`Delete sub-topic "${label}" and all its questions?`)) return;
          await api('DELETE', `/admin/topics/${encodeURIComponent(state.topicId)}/subtopics/${encodeURIComponent(id)}`);
          await refreshTopicData();
          showSubTopics(state.topicId, state.topicData);
        }
      });
    });
  }

  els.addBtn.onclick = () => {
    openModal({
      title: 'Add sub-topic',
      fields: [{ name: 'label', label: 'Label', type: 'text', value: '' }],
      onSave: async (values) => {
        await api('POST', `/admin/topics/${encodeURIComponent(state.topicId)}/subtopics`, { label: values.label });
        await refreshTopicData();
        showSubTopics(state.topicId, state.topicData);
      },
    });
  };
}

// ---- Questions grid ----

function showQuestions(subTopicId) {
  state.view = 'questions';
  state.subTopicId = subTopicId;
  const subTopic = state.topicData.subTopics.find((s) => s.id === subTopicId);
  els.gridTitle.textContent = `Questions — ${subTopic.label}`;
  els.addBtn.textContent = '+ Add Question';
  renderBreadcrumb();

  if (subTopic.items.length === 0) {
    setGridEmpty('No questions yet — click "Add Question" to create one.');
  } else {
    const rows = subTopic.items
      .map((item, index) => {
        const correctText = item.type === 'MCQ' ? `<span class="correct-badge">${escapeHtml(item.correct)}</span>` : '—';
        return `
      <tr>
        <td><span class="type-pill type-${item.type.toLowerCase()}">${item.type}</span></td>
        <td class="truncate" title="${escapeHtml(item.question)}">${escapeHtml(item.question)}</td>
        <td>${correctText}</td>
        <td class="actions">
          <button class="small secondary" data-action="edit" data-index="${index}">Edit</button>
          <button class="small danger" data-action="delete" data-index="${index}">Delete</button>
        </td>
      </tr>`;
      })
      .join('');
    setGridRows('<tr><th>Type</th><th>Question</th><th>Correct</th><th></th></tr>', rows);

    els.gridBody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { action, index } = btn.dataset;
        const item = subTopic.items[Number(index)];
        if (action === 'edit') {
          openQuestionModal({ mode: 'edit', item, index: Number(index) });
        } else if (action === 'delete') {
          if (!confirm('Delete this question?')) return;
          await api(
            'DELETE',
            `/admin/topics/${encodeURIComponent(state.topicId)}/subtopics/${encodeURIComponent(subTopicId)}/questions/${index}`
          );
          await refreshTopicData();
          showQuestions(subTopicId);
        }
      });
    });
  }

  els.addBtn.onclick = () => openQuestionModal({ mode: 'create' });
}

// ---- Question modal (Q or MCQ, fields adapt to Type) ----

function openQuestionModal({ mode, item, index }) {
  const modalFields = document.getElementById('modalFields');
  document.getElementById('modalTitle').textContent = mode === 'create' ? 'Add question' : 'Edit question';

  function fieldsHtml(type) {
    const common = `
      <label for="f-question">Question</label>
      <textarea id="f-question" class="field">${escapeHtml(item && item.question)}</textarea>`;
    if (type === 'Q') {
      return `${common}
        <label for="f-answer">Answer</label>
        <textarea id="f-answer" class="field">${escapeHtml(item && item.answer)}</textarea>`;
    }
    const choices = item && item.choices ? item.choices : [];
    const choiceVal = (id) => {
      const c = choices.find((c) => c.id === id);
      return c ? c.label : '';
    };
    const correct = item ? item.correct : '';
    return `${common}
      <label for="f-choiceA">Choice A</label><input id="f-choiceA" type="text" value="${escapeHtml(choiceVal('A'))}" />
      <label for="f-choiceB">Choice B</label><input id="f-choiceB" type="text" value="${escapeHtml(choiceVal('B'))}" />
      <label for="f-choiceC">Choice C</label><input id="f-choiceC" type="text" value="${escapeHtml(choiceVal('C'))}" />
      <label for="f-choiceD">Choice D</label><input id="f-choiceD" type="text" value="${escapeHtml(choiceVal('D'))}" />
      <label for="f-correct">Correct answer</label>
      <select id="f-correct">
        ${['A', 'B', 'C', 'D'].map((l) => `<option value="${l}" ${correct === l ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label for="f-answer">Explanation (shown after answering)</label>
      <textarea id="f-answer" class="field">${escapeHtml(item && item.explanation)}</textarea>`;
  }

  const currentType = item ? item.type : 'Q';
  modalFields.innerHTML = `
    <label for="f-type">Type</label>
    <select id="f-type" ${mode === 'edit' ? 'disabled' : ''}>
      <option value="Q" ${currentType === 'Q' ? 'selected' : ''}>Q — question &amp; answer</option>
      <option value="MCQ" ${currentType === 'MCQ' ? 'selected' : ''}>MCQ — graded multiple choice</option>
    </select>
    <div id="typeFields">${fieldsHtml(currentType)}</div>
  `;

  document.getElementById('f-type').addEventListener('change', (e) => {
    document.getElementById('typeFields').innerHTML = fieldsHtml(e.target.value);
  });

  document.getElementById('modalError').style.display = 'none';
  document.getElementById('modalOverlay').style.display = 'flex';

  document.getElementById('modalSave').onclick = async () => {
    const type = document.getElementById('f-type').value;
    const payload = { type, question: document.getElementById('f-question').value };
    if (type === 'Q') {
      payload.answer = document.getElementById('f-answer').value;
    } else {
      payload.choiceA = document.getElementById('f-choiceA').value;
      payload.choiceB = document.getElementById('f-choiceB').value;
      payload.choiceC = document.getElementById('f-choiceC').value;
      payload.choiceD = document.getElementById('f-choiceD').value;
      payload.correct = document.getElementById('f-correct').value;
      payload.answer = document.getElementById('f-answer').value;
    }

    const saveBtn = document.getElementById('modalSave');
    saveBtn.disabled = true;
    try {
      if (mode === 'create') {
        await api(
          'POST',
          `/admin/topics/${encodeURIComponent(state.topicId)}/subtopics/${encodeURIComponent(state.subTopicId)}/questions`,
          payload
        );
      } else {
        await api(
          'PUT',
          `/admin/topics/${encodeURIComponent(state.topicId)}/subtopics/${encodeURIComponent(state.subTopicId)}/questions/${index}`,
          payload
        );
      }
      closeModal();
      await refreshTopicData();
      showQuestions(state.subTopicId);
    } catch (err) {
      const errBox = document.getElementById('modalError');
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      saveBtn.disabled = false;
    }
  };
}

// ---- Generic simple modal (title/label forms — topic & sub-topic add/edit) ----

function openModal({ title, fields, onSave }) {
  document.getElementById('modalTitle').textContent = title;
  const modalFields = document.getElementById('modalFields');
  modalFields.innerHTML = fields
    .map((f) => `<label for="f-${f.name}">${escapeHtml(f.label)}</label><input id="f-${f.name}" type="text" value="${escapeHtml(f.value)}" />`)
    .join('');

  document.getElementById('modalError').style.display = 'none';
  document.getElementById('modalOverlay').style.display = 'flex';

  document.getElementById('modalSave').onclick = async () => {
    const values = {};
    for (const f of fields) values[f.name] = document.getElementById(`f-${f.name}`).value;

    const saveBtn = document.getElementById('modalSave');
    saveBtn.disabled = true;
    try {
      await onSave(values);
      closeModal();
    } catch (err) {
      const errBox = document.getElementById('modalError');
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      saveBtn.disabled = false;
    }
  };
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ---- CSV bulk publish (unchanged behavior, moved out of inline <script>) ----

const fileInput = document.getElementById('csvFile');
const textArea = document.getElementById('csvText');
const resultBox = document.getElementById('result');
const previewResultBox = document.getElementById('previewResult');
const previewStatus = document.getElementById('previewStatus');
const publishBtn = document.getElementById('publishBtn');
const pasteToggleBtn = document.getElementById('pasteToggleBtn');
const pasteArea = document.getElementById('pasteArea');
const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');

// Same column order csvExporter.js writes on the server, so a downloaded template
// and a downloaded topic look identical — one format to learn, not two. Two example
// rows (a Q and an MCQ) show the shape without an admin having to guess from the
// header alone.
const CSV_TEMPLATE =
  'Topic,Sub-Topic,Type,#,Question,Choice A,Choice B,Choice C,Choice D,Correct,Answer/Explanation\r\n' +
  'Example Topic,Example Sub-Topic,Q,1,What is an example question?,,,,,,This is the answer shown right below the question.\r\n' +
  'Example Topic,Example Sub-Topic,MCQ,1,Which option is correct?,First choice,Second choice,Third choice,Fourth choice,B,Shown after the learner answers.\r\n';

downloadTemplateBtn.addEventListener('click', () => {
  const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ai-tutor-template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

// The paste textarea is a fallback for the rare "I don't have a file" case — kept
// out of view by default so choosing a file (the common path) isn't followed by a
// wall of raw CSV text nobody asked to see.
pasteToggleBtn.addEventListener('click', () => {
  const showing = pasteArea.style.display !== 'none';
  pasteArea.style.display = showing ? 'none' : 'block';
  pasteToggleBtn.textContent = showing ? 'Paste CSV text instead' : 'Hide paste area';
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const bytes = new Uint8Array(reader.result);
    // Prefer strict UTF-8; if the file isn't valid UTF-8 (e.g. exported as
    // Windows ANSI/CP-1252 from Excel, which mangles em-dashes etc.), fall back
    // to windows-1252 rather than silently corrupting those bytes into "?".
    try {
      textArea.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      textArea.value = new TextDecoder('windows-1252').decode(bytes);
    }
    // A chosen file should just show its data — no extra click needed.
    runPreview();
  };
  reader.readAsArrayBuffer(file);
});

// Pasting/typing into the CSV textarea previews the same way a file does — no
// button to remember to click. Debounced so it doesn't fire on every keystroke.
let pasteDebounce = null;
textArea.addEventListener('input', () => {
  clearTimeout(pasteDebounce);
  pasteDebounce = setTimeout(() => {
    if (textArea.value.trim()) runPreview();
  }, 600);
});

// Renders one topic's stats as a card — shared by the Preview (dry-run) and Publish
// (actually written) results, since both are "here's a topic, here's its shape."
function renderTopicCard(title, stats, subTopics) {
  const statsHtml = stats.map(([value, label]) => `<span class="preview-stat"><strong>${value}</strong> ${escapeHtml(label)}</span>`).join('');
  const chipsHtml = subTopics && subTopics.length
    ? `<div class="preview-chips">${subTopics.map((s) => `<span class="preview-chip">${escapeHtml(s)}</span>`).join('')}</div>`
    : '';
  return `
    <div class="preview-card">
      <div class="preview-card-title">${escapeHtml(title)}</div>
      <div class="preview-stats">${statsHtml}</div>
      ${chipsHtml}
    </div>`;
}

// Preview means literally "show me the CSV data" — the actual rows in a table, not
// just counts. The admin needs to be able to read each question/answer/choice to
// catch a typo or a wrong "Correct" letter before Publish makes it live.
function renderPreviewCell(value) {
  const text = value == null || value === '' ? '—' : String(value);
  return `<td class="truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</td>`;
}

async function runPreview() {
  const csv = textArea.value;
  previewResultBox.className = 'result-box';
  previewStatus.textContent = 'Checking…';
  try {
    const data = await api('POST', '/admin/preview', { csv });
    previewResultBox.className = 'result-box info';

    const summaryHtml = data.summary
      .map((s) => `<span class="preview-stat"><strong>${escapeHtml(s.title)}</strong> — ${s.subTopics} sub-topics, ${s.questions} Q, ${s.mcqs} MCQ</span>`)
      .join('');

    const rowsHtml = data.rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.topic)}</td>
        <td>${escapeHtml(r.subTopic)}</td>
        <td><span class="type-pill type-${r.type.toLowerCase()}">${escapeHtml(r.type)}</span></td>
        <td>${escapeHtml(r.num)}</td>
        ${renderPreviewCell(r.question)}
        ${renderPreviewCell(r.choiceA)}
        ${renderPreviewCell(r.choiceB)}
        ${renderPreviewCell(r.choiceC)}
        ${renderPreviewCell(r.choiceD)}
        <td>${r.correct ? `<span class="correct-badge">${escapeHtml(r.correct)}</span>` : '—'}</td>
        ${renderPreviewCell(r.answer)}
      </tr>`
      )
      .join('');

    previewResultBox.innerHTML = `
      <div class="preview-intro">
        <span>Nothing published yet — <strong>${data.rows.length} row${data.rows.length === 1 ? '' : 's'}</strong> parsed successfully.</span>
      </div>
      <div class="preview-summary">${summaryHtml}</div>
      <div class="table-wrap preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>Topic</th><th>Sub-Topic</th><th>Type</th><th>#</th><th>Question</th>
              <th>A</th><th>B</th><th>C</th><th>D</th><th>Correct</th><th>Answer/Explanation</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  } catch (err) {
    previewResultBox.className = 'result-box err raw';
    previewResultBox.textContent = err.message;
  } finally {
    previewStatus.textContent = '';
  }
}

publishBtn.addEventListener('click', async () => {
  const csv = textArea.value;
  resultBox.className = 'result-box';
  publishBtn.disabled = true;
  publishBtn.textContent = 'Publishing…';
  try {
    const data = await api('POST', '/admin/import', { csv });
    resultBox.className = 'result-box ok';
    const cards = data.published
      .map((t) =>
        renderTopicCard(t.title, [
          [t.subTopicCount, 'sub-topics'],
          [t.stateCount, 'states'],
        ])
      )
      .join('');
    resultBox.innerHTML = `<div class="preview-intro">&check; Published successfully:</div><div class="preview-cards">${cards}</div>`;
    if (state.view === 'topics') await showTopics();
  } catch (err) {
    resultBox.className = 'result-box err raw';
    resultBox.textContent = err.message;
  } finally {
    publishBtn.disabled = false;
    publishBtn.textContent = 'Publish';
  }
});

showTopics();
