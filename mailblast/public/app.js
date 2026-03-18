const recipientState = [];
const fileState = [];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const els = {
  sendForm: document.getElementById('sendForm'),
  subject: document.getElementById('subject'),
  textBody: document.getElementById('textBody'),
  htmlBody: document.getElementById('htmlBody'),
  emailTagBox: document.getElementById('emailTagBox'),
  emailInput: document.getElementById('emailInput'),
  recipientCount: document.getElementById('recipientCount'),
  fileInput: document.getElementById('fileInput'),
  dropzone: document.getElementById('dropzone'),
  fileList: document.getElementById('fileList'),
  sendBtn: document.getElementById('sendBtn'),
  toastContainer: document.getElementById('toastContainer'),
  statRecipients: document.getElementById('statRecipients'),
  statAttachments: document.getElementById('statAttachments'),
  statStatus: document.getElementById('statStatus'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),
  userPhoto: document.getElementById('userPhoto'),
};

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizeTokens(input) {
  return input
    .split(/[\s,;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function existsRecipient(email) {
  return recipientState.some((item) => item.email === email);
}

function addRecipients(tokens) {
  let added = 0;

  tokens.forEach((email) => {
    if (existsRecipient(email)) {
      return;
    }

    recipientState.push({
      email,
      valid: emailRegex.test(email),
    });
    added += 1;
  });

  if (added > 0) {
    renderRecipients();
  }
}

function removeRecipient(index) {
  recipientState.splice(index, 1);
  renderRecipients();
}

function renderRecipients() {
  const input = els.emailInput;
  els.emailTagBox.innerHTML = '';

  recipientState.forEach((recipient, index) => {
    const chip = document.createElement('span');
    chip.className = `tag${recipient.valid ? '' : ' invalid'}`;
    chip.innerHTML = `<span>${recipient.email}</span><button type="button" aria-label="Remove ${recipient.email}">×</button>`;

    chip.querySelector('button').addEventListener('click', () => removeRecipient(index));
    els.emailTagBox.appendChild(chip);
  });

  els.emailTagBox.appendChild(input);
  input.focus();

  const count = recipientState.length;
  els.recipientCount.textContent = String(count);
  els.statRecipients.textContent = String(count);
}

function addFiles(files) {
  const incoming = Array.from(files || []);
  let added = 0;

  incoming.forEach((file) => {
    const duplicate = fileState.some(
      (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );

    if (!duplicate) {
      fileState.push(file);
      added += 1;
    }
  });

  if (added > 0) {
    renderFiles();
  }
}

function removeFile(index) {
  fileState.splice(index, 1);
  renderFiles();
}

function renderFiles() {
  els.fileList.innerHTML = '';

  fileState.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'file-item';
    item.innerHTML = `
      <span class="file-name" title="${file.name}">${file.name}</span>
      <div class="file-meta">
        <span>${formatBytes(file.size)}</span>
        <button type="button" class="btn-link" aria-label="Remove ${file.name}">Remove</button>
      </div>
    `;

    item.querySelector('button').addEventListener('click', () => removeFile(index));
    els.fileList.appendChild(item);
  });

  els.statAttachments.textContent = String(fileState.length);
}

function showToast(message, type = 'success', timeout = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, timeout);
}

function setSendingState(isSending) {
  els.sendBtn.disabled = isSending;
  els.sendBtn.textContent = isSending ? 'SENDING...' : 'SEND BULK EMAIL';
  els.statStatus.textContent = isSending ? 'Sending' : 'Idle';
}

async function loadCurrentUser() {
  try {
    const response = await fetch('/me', {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Not authenticated');
    }

    const user = await response.json();
    els.userName.textContent = user.name || 'Google User';
    els.userEmail.textContent = user.email || '';
    els.userPhoto.src = user.photo || 'https://ui-avatars.com/api/?name=MailBlast&background=1a1f1f&color=ffffff';
  } catch (error) {
    showToast('Session expired. Redirecting to login.', 'error');
    setTimeout(() => {
      window.location.href = '/login';
    }, 900);
  }
}

function collectSendPayload() {
  const subject = els.subject.value.trim();
  const text = els.textBody.value.trim();
  const html = els.htmlBody.value.trim();
  const recipients = recipientState.map((item) => item.email);
  const invalid = recipientState.filter((item) => !item.valid);

  if (!subject) {
    throw new Error('Subject is required.');
  }

  if (!text && !html) {
    throw new Error('Provide plain text or HTML content.');
  }

  if (!recipients.length) {
    throw new Error('Add at least one recipient.');
  }

  if (invalid.length) {
    throw new Error('Fix invalid recipient emails before sending.');
  }

  const formData = new FormData();
  formData.append('subject', subject);
  formData.append('text', text);
  formData.append('html', html);
  formData.append('emails', JSON.stringify(recipients));

  fileState.forEach((file) => {
    formData.append('attachments', file, file.name);
  });

  return formData;
}

async function handleSend(event) {
  event.preventDefault();

  try {
    const formData = collectSendPayload();

    setSendingState(true);
    const response = await fetch('/send-bulk', {
      method: 'POST',
      body: formData,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok && response.status !== 207) {
      throw new Error(payload?.error || payload?.details || 'Failed to send emails.');
    }

    const sent = payload?.sent || 0;
    const failed = payload?.failed || 0;
    const total = payload?.total || 0;

    els.statStatus.textContent = failed > 0 ? 'Partial' : 'Sent';

    if (failed > 0) {
      showToast(`Sent ${sent}/${total}. Failed: ${failed}`, 'error', 4500);
    } else {
      showToast(`Success. Sent ${sent}/${total} emails.`, 'success');
    }
  } catch (error) {
    els.statStatus.textContent = 'Error';
    showToast(error.message || 'Could not send emails.', 'error', 4500);
  } finally {
    els.sendBtn.disabled = false;
    if (els.statStatus.textContent === 'Sending') {
      els.statStatus.textContent = 'Idle';
    }
    els.sendBtn.textContent = 'SEND BULK EMAIL';
  }
}

function bindRecipientInput() {
  els.emailInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const tokens = normalizeTokens(els.emailInput.value);
      addRecipients(tokens);
      els.emailInput.value = '';
      return;
    }

    if (event.key === 'Backspace' && !els.emailInput.value && recipientState.length) {
      removeRecipient(recipientState.length - 1);
    }
  });

  els.emailInput.addEventListener('blur', () => {
    const tokens = normalizeTokens(els.emailInput.value);
    addRecipients(tokens);
    els.emailInput.value = '';
  });

  els.emailInput.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text') || '';
    const tokens = normalizeTokens(text);

    if (tokens.length) {
      event.preventDefault();
      addRecipients(tokens);
      els.emailInput.value = '';
    }
  });
}

function bindDropzone() {
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener('change', (event) => {
    addFiles(event.target.files);
    els.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((name) => {
    els.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropzone.classList.add('active');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    els.dropzone.addEventListener(name, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropzone.classList.remove('active');
    });
  });

  els.dropzone.addEventListener('drop', (event) => {
    const droppedFiles = event.dataTransfer?.files;
    addFiles(droppedFiles);
  });
}

async function init() {
  bindRecipientInput();
  bindDropzone();
  els.sendForm.addEventListener('submit', handleSend);

  renderRecipients();
  renderFiles();
  await loadCurrentUser();
}

init();
