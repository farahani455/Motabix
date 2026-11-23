const vscode = acquireVsCodeApi();
  let preferredModel = '';
  let isAgentRunning = false;
  let activeRequestId = null;

  const elements = {
        messages: document.getElementById('messages'),
        input: document.getElementById('textInput'),
        send: document.getElementById('sendButton'),
        stop: document.getElementById('stopButton'),
        settings: document.getElementById('settings'),
        clearHistory: document.getElementById('clearHistory'),
        modelButton :document.getElementById('model'),
        modelDropdown :document.getElementById('modelDropdown'),
        modelLabel :document.getElementById('model-label'),
        modelOptions :[],
        agentButton:document.getElementById('setAgent'),
        agentDropdown:document.getElementById('agentDropdown'),
        agentLabel:document.getElementById('agent-label'),
        agentIcon:document.getElementById('agent-icon'),
        agentOptions:document.querySelectorAll('.agent-option'),
        addContentBtn:document.getElementById('addContentBtn'),
        addContentDropdown:document.getElementById('addContentDropdown'),
        attachedContent:document.getElementById('attachedContent'),
        contentOptions:document.querySelectorAll('.content-option')
  };

  function initializeApp() {
    getSelectedAgent();
    bindEvents();
    notifyReady();
    requestProviderModels();
  }

  function requestProviderModels() {
      vscode.postMessage({ command: 'listModels' });
  }

  function setAgentRunning(running, requestId) {
      isAgentRunning = !!running;
      activeRequestId = running ? (requestId || null) : null;
      if (elements.send) {
          elements.send.disabled = isAgentRunning;
          elements.send.classList.toggle('hidden', isAgentRunning);
      }
      if (elements.stop) {
          elements.stop.disabled = !isAgentRunning;
          elements.stop.classList.toggle('hidden', !isAgentRunning);
      }
  }

  function bindEvents() {
      elements.send.addEventListener('click', handleSendClick);
      elements.stop.addEventListener('click', handleStopClick);
      elements.settings.addEventListener('click', handleOpenSettings);
      elements.clearHistory.addEventListener('click', handleClearHistory);
      elements.input.addEventListener('keydown',handleKeydownInput)
      elements.modelButton.addEventListener('click', handleModelButtonClick);
      document.addEventListener('click',handleCloseModal);
      window.addEventListener('message', handleWindowMessage);

      elements.agentButton.addEventListener('click', handleAgentButtonClick);
      document.addEventListener('click',handleCloseAgent);
      
      elements.addContentBtn.addEventListener('click', handleAddContentBtnClick);

      document.getElementById('settingsBack').addEventListener('click', () => showSettingsPanel(false));
      document.getElementById('settingsProvider').addEventListener('change', updateSettingsVisibility);
      document.getElementById('saveSettings').addEventListener('click', handleSaveSettings);
      document.getElementById('testConnection').addEventListener('click', handleTestConnection);
      updateSettingsVisibility();
      bindContentOptions();
  }

  function updateSettingsVisibility() {
      const provider = document.getElementById('settingsProvider').value;
      document.getElementById('ollamaSettings').classList.toggle('hidden', provider !== 'ollama');
      document.getElementById('routerSettings').classList.toggle('hidden', provider !== 'motabix-router');
  }

  function applyAppSettings(settings) {
      if (!settings) {
          return;
      }
      document.getElementById('settingsProvider').value = settings.provider || 'ollama';
      document.getElementById('ollamaBaseURL').value = settings.ollamaBaseURL || 'http://127.0.0.1:11434';
      document.getElementById('routerBaseURL').value = settings.routerBaseURL || 'http://127.0.0.1:8787';
      document.getElementById('routerApiKey').value = settings.apiKey || '';
      document.getElementById('runCommandPermission').value = settings.runCommandPermission || 'ask';
      document.getElementById('pathScope').value = settings.pathScope || 'workspace';
      document.getElementById('runCommandCwd').value = settings.runCommandCwd || '';
      updateSettingsVisibility();
  }

  function handleSaveSettings() {
      setSettingsStatus('', '');
      vscode.postMessage({
          command: 'saveAppSettings',
          provider: document.getElementById('settingsProvider').value,
          ollamaBaseURL: document.getElementById('ollamaBaseURL').value,
          routerBaseURL: document.getElementById('routerBaseURL').value,
          apiKey: document.getElementById('routerApiKey').value,
          runCommandPermission: document.getElementById('runCommandPermission').value,
          pathScope: document.getElementById('pathScope').value,
          runCommandCwd: document.getElementById('runCommandCwd').value
      });
  }

  function handleTestConnection() {
      const testButton = document.getElementById('testConnection');
      testButton.disabled = true;
      setSettingsStatus('Testing connection...', '');
      vscode.postMessage({
          command: 'testConnection',
          provider: document.getElementById('settingsProvider').value,
          ollamaBaseURL: document.getElementById('ollamaBaseURL').value,
          routerBaseURL: document.getElementById('routerBaseURL').value,
          apiKey: document.getElementById('routerApiKey').value
      });
  }

  function setSettingsStatus(text, kind) {
      const el = document.getElementById('settingsStatus');
      el.textContent = text;
      el.classList.remove('ok', 'error');
      if (kind) {
          el.classList.add(kind);
      }
  }

  function notifyReady() {
      vscode.postMessage({ command: 'ready' });
  }

  function handleSendClick() {
      if (isAgentRunning) {
          return;
      }
      const text = (elements.input.innerText || elements.input.textContent || '').trim();
      const model=elements.modelLabel.getAttribute('data-model');
      const agent=elements.agentLabel.getAttribute('data-agent');
      const files=getContentFileLis();
      const requestId = generateNewId();
      if (!text) {
          return;
      }
      renderUserMessage(text);
      setAgentRunning(true, requestId);
      vscode.postMessage({
          command: 'sendMessage',
          text,
          model,
          agent,
          files,
          requestId
      });
      CreateBubble(requestId);
      elements.input.textContent='';
  }

  function handleStopClick() {
      if (!isAgentRunning) {
          return;
      }
      vscode.postMessage({
          command: 'stopGeneration',
          requestId: activeRequestId
      });
  }
  function handleKeydownInput(event){
    // Enter = send; Shift+Enter = new line in contenteditable
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendClick();
    }
  }
  function handleModelButtonClick(e){
        e.stopPropagation();
        elements.modelDropdown.classList.toggle('hidden');
  }
 function handleCloseModal() {
        elements.modelDropdown.classList.add('hidden');
        elements.addContentDropdown.classList.add('hidden');
 }
 function handleAgentButtonClick(e){
        e.stopPropagation();
        elements.agentDropdown.classList.toggle('hidden');
  }
 function handleCloseAgent() {
        elements.agentDropdown.classList.add('hidden');
 }
 
 function handleAddContentBtnClick(e) {
        e.stopPropagation();
        elements.addContentDropdown.classList.toggle('hidden');
 }
 
 function bindContentOptions() {
        elements.contentOptions.forEach(option => {
            option.addEventListener('click', handleContentOptionClick);
        });
        
        // Bind remove button for existing chip
        const removeBtn = elements.attachedContent.querySelector('.remove-chip');
        if (removeBtn) {
            removeBtn.addEventListener('click', handleRemoveChip);
        }
 }
 
 function handleContentOptionClick(e) {
        e.stopPropagation();
        const contentType = this.getAttribute('data-content');
        const includedItem=getContentFileLis();
        if (contentType === 'active-document') {
            if(includedItem.indexOf('active-document') ==-1) {
                addContentChip('Active Document', 'active-document', 'codicon-file');
            }
        } 
        else if (contentType === 'browse-project') {

            vscode.postMessage({ command: 'browseProject' });
        }
        elements.addContentDropdown.classList.add('hidden');
 }
 
 function addContentChip(label, contentType, icon) {
        const chip = document.createElement('span');
        chip.className = 'content-chip';
        chip.setAttribute('data-content', contentType);
        chip.innerHTML = `
            <span class="codicon ${icon}"></span>
            <span>${label}</span>
            <button class="remove-chip" type="button" aria-label="Remove">&times;</button>
        `;
        chip.querySelector('.remove-chip').addEventListener('click', handleRemoveChip);
        elements.attachedContent.appendChild(chip);
 }

 function getContentFileLis(){
    const result=[];
     elements.attachedContent.querySelectorAll('.content-chip').forEach((elem,index)=>{
        result.push(elem.getAttribute('data-content'));
     })
     return result;
 }
 
 function handleRemoveChip(e) {
        e.stopPropagation();
        this.closest('.content-chip').remove();
 }

  function handleOpenSettings() {
      vscode.postMessage({ command: 'openSettings' });
  }

  function handleClearHistory() {
      vscode.postMessage({ command: 'clearHistory' });
      elements.messages.innerHTML='';
  }

  
function handleWindowMessage(event) {
    const message = event.data;
    switch (message.command) {
        case 'stream-start-response': {
            emptyBubble(message.requestId, message.responseId);
            break;
        }
        case 'stream-chunk-response': {
            if (message.content) {
                addAssistantMessage(message.content, message.responseId, message.language, true);
            }
            break;
        }
        case 'agent-step': {
            if (message.text) {
                addAssistantMessage(message.text, message.responseId, message.language, true);
            }
            break;
        }
        case 'editProposal': {
            showEditProposalCard(message);
            break;
        }
        case 'editProposalResult': {
            updateEditProposalCard(message.proposalId, message.status, message.message || message.path);
            break;
        }
        case 'agent-limit': {
            if (message.text) {
                addAssistantMessage(message.text, message.responseId, message.language, true);
                const bubble = document.querySelector(`[data-newid="${message.responseId}"]`);
                if (bubble) {
                    bubble.classList.add('ai-bubble-limit');
                }
            }
            break;
        }

        case 'stream-end-response': {
            formatAssistResponse(message.responseId);
            highlightAssistResponse(message.responseId);
            setAgentRunning(false);
            break;
        }
        case 'code_response': {
            const parsedMessage = JSON.parse(message.text);
            emptyBubble(message.requestId,message.responseId);
            
            addAssistantMessage(parsedMessage.explanation, message.responseId,message.language, false);

            formatAssistResponse(message.responseId);
            highlightAssistResponse(message.responseId);

            showActionButton(message.responseId, 'pending');
            setAgentRunning(false);

            break;
        }
        case 'code_response_error': {
            const parsedMessage = message.text;
            emptyBubble(message.requestId,message.responseId);
            
            addAssistantMessage(parsedMessage, message.responseId,message.language, false);
            setAgentRunning(false);
            break;
        }
        case 'generationStopped': {
            setAgentRunning(false);
            break;
        }
        case 'stream-error-response': {
            const errorText =
                message.text ||
                (typeof message.error === 'string' ? message.error : '') ||
                'Request failed.';
            emptyBubble(message.requestId, message.responseId);
            addAssistantMessage(errorText, message.responseId, message.language || 'en', false);
            const errorBubble = document.querySelector(`[data-newid="${message.responseId}"]`);
            if (errorBubble) {
                errorBubble.classList.add('ai-bubble-error');
            }
            setAgentRunning(false);
            break;
        }
        case 'agentBusy': {
            // Keep current run; second start was rejected on Extension Host.
            break;
        }
        case 'loadHistory':
            renderHistory(message.history);
            break;

        case 'getSessionConfig':
            setSessionConfig(message.global);
            break;

        case 'getSelectedFile':
            setSelectedFile(message.files);
            break;

        case 'changeActiveDocument':
            activeDocumentHandler(message);
        break;

        case 'showSettings':
            showSettingsPanel(true);
            setSettingsStatus('', '');
            break;
        case 'loadAppSettings':
            applyAppSettings(message.settings);
            break;
        case 'appSettingsSaved':
            if (message.ok) {
                setSettingsStatus('Settings saved.', 'ok');
                requestProviderModels();
            } else {
                setSettingsStatus(message.error || 'Save failed.', 'error');
            }
            break;
        case 'connectionTestResult':
            document.getElementById('testConnection').disabled = false;
            setSettingsStatus(
                message.message || (message.ok ? 'Connected.' : 'Connection failed.'),
                message.ok ? 'ok' : 'error'
            );
            if (message.ok && Array.isArray(message.models)) {
                applyProviderModels(message.models);
            }
            break;
        case 'providerModels':
            applyProviderModels(Array.isArray(message.models) ? message.models : []);
            break;
        default:
            console.warn('Unknown message command:', message.command);
    }
}


  function renderHistory(history) {
      if (!history || !history.messages) {
          return;
      }
      console.log(history.messages);
      
      elements.messages.innerHTML = '';

      for (const item of history.messages) {
          if (item.role === 'user') {
              renderUserMessage(item.content);
          } else if (item.role === 'assistant') {
            let currentContent='';
            try{
                const parsedMessage =JSON.parse(item.content);
                currentContent=parsedMessage.explanation;
            }catch(error){
                currentContent=item.content;
            }
            
            addAssistantMessage(currentContent,item.Id,(item.language??"en"),false);
            formatAssistResponse(item.Id);
            highlightAssistResponse(item.Id);
            // History must never show live Accept/Reject — proposals expire with the session.
            // Only a read-only status chip when we know the past decision.
            const pastAction = item.codeAction;
            if (pastAction === 'accepted' || pastAction === 'rejected') {
                showActionButton(item.Id, pastAction, { interactive: false });
            }
          }
      }

  }
  function setSessionConfig(config){
      if (!config ) {
          return;
      }
      console.log(config);
      if(config.model){
            preferredModel = config.model;
            const loaded = elements.modelOptions.map((option) => option.getAttribute('data-model'));
            if (!loaded.length || loaded.includes(config.model)) {
                applySelectedModel(config.model);
            }
            elements.modelDropdown.classList.add('hidden');
      }
      if(config.agent){
            let selectedAgent = config.agent;
            if (selectedAgent === 'Editor') {
                selectedAgent = 'Edit';
            }
            applySelectedAgent(selectedAgent);
            elements.agentDropdown.classList.add('hidden');

      }

  }

  function applySelectedModel(selectedModel) {
      const label = selectedModel || 'No models';
      elements.modelLabel.textContent = label;
      elements.modelLabel.setAttribute('data-model', selectedModel || '');
  }

  function applyProviderModels(models) {
      const previous = preferredModel || elements.modelLabel.getAttribute('data-model') || '';
      elements.modelDropdown.innerHTML = '';
      elements.modelOptions = [];

      if (!models.length) {
          applySelectedModel('');
          return;
      }

      models.forEach((modelName) => {
          const option = document.createElement('div');
          option.className = 'model-option';
          option.setAttribute('data-model', modelName);
          option.textContent = modelName;
          option.addEventListener('click', () => {
              preferredModel = modelName;
              applySelectedModel(modelName);
              elements.modelDropdown.classList.add('hidden');
              vscode.postMessage({
                  command: 'setSessionConfig',
                  model: modelName
              });
          });
          elements.modelDropdown.appendChild(option);
          elements.modelOptions.push(option);
      });

      const nextModel = models.includes(previous) ? previous : models[0];
      preferredModel = nextModel;
      applySelectedModel(nextModel);
      if (nextModel !== previous) {
          vscode.postMessage({
              command: 'setSessionConfig',
              model: nextModel
          });
      }
  }

    function setSelectedFile(files) {
        if (files && files.length > 0) {
            files.forEach((elem,index)=>{
                addContentChip(elem.name, elem.name, 'codicon-file');
            })
        } 
    }

    function activeDocumentHandler(message){
        if(message.isActive){
            const includedItem=getContentFileLis();
            if(includedItem.indexOf('active-document') ==-1) {
                addContentChip('Active Document', 'active-document', 'codicon-file');
            }
            
        }else{
            document.querySelectorAll('[data-content="active-document"]').forEach(el => el.remove());
        }
    }
  function renderUserMessage(text) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble user-bubble';
      bubble.textContent = text;

      appendMessage(bubble);
  }

    function ensureBubbleContent(bubble) {
        let body = bubble.querySelector('.ai-bubble-content');
        if (!body) {
            body = document.createElement('div');
            body.className = 'ai-bubble-content';
            // Keep proposal cards / action bars as siblings after the text body.
            const firstCard = bubble.querySelector('.edit-proposal-card, .response-actions');
            if (firstCard) {
                bubble.insertBefore(body, firstCard);
            } else {
                bubble.appendChild(body);
            }
        }
        return body;
    }

    function addAssistantMessage(content, requestId, dir, append) {
        let bubble = document.querySelector(`[data-newid="${requestId}"]`);
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'bubble ai-bubble';
            bubble.setAttribute('data-newid', requestId);
            elements.messages.appendChild(bubble);
        }

        if (dir && !bubble.classList.contains('ai-bubble-' + dir)) {
            bubble.classList.add('ai-bubble-' + dir);
        }

        const body = ensureBubbleContent(bubble);

        // Keep raw markdown/text while streaming; format only on stream-end.
        // Never write textContent/innerHTML on the bubble root — that wipes Accept cards.
        if (append) {
            body.textContent = (body.textContent || '') + content;
        } else {
            body.textContent = content ?? '';
        }

        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    function formatAssistResponse(requestId) {
        const bubble = document.querySelector(`[data-newid="${requestId}"]`);
        if (!bubble) {
            return;
        }
        const body = ensureBubbleContent(bubble);
        const content = body.textContent || '';
        body.innerHTML = formatAiResponse(content);
    }

    function highlightAssistResponse(requestId) {
        const bubble = document.querySelector(`[data-newid="${requestId}"]`);
        if (!bubble) {
            return;
        }
        const body = bubble.querySelector('.ai-bubble-content') || bubble;
        body.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    function showActionButton(requestId, status = 'pending', options = {}){
        let bubble = document.querySelector(`[data-newid="${requestId}"]`);
        if (!bubble) {
            return;
        }

        const existingActions = bubble.querySelector('.response-actions:not(.edit-proposal-actions)');
        if (existingActions) {
            existingActions.remove();
        }

        const actionButtons = document.createElement('div');
        actionButtons.className = 'response-actions';
        actionButtons.innerHTML = buildDecisionButtonsHtml(status, 'legacy');
        bubble.appendChild(actionButtons);
        // History / resolved states: status text only — never bind Accept/Reject.
        if (options.interactive !== false && status === 'pending') {
            bindLegacyDecisionButtons(actionButtons);
        }
    }

    function buildDecisionButtonsHtml(status, kind) {
        if (status === 'pending') {
            return `
                <button class="decision-btn decision-reject" type="button" data-action="reject" title="Reject">
                    <span class="codicon codicon-close"></span>
                    <span>Reject</span>
                </button>
                <button class="decision-btn decision-accept" type="button" data-action="accept" title="Accept">
                    <span class="codicon codicon-check"></span>
                    <span>Accept</span>
                </button>
            `;
        }
        if (status === 'accepted') {
            return `
                <div class="decision-status decision-status-accepted">
                    <span class="codicon codicon-check"></span>
                    <span>Accepted — written to disk</span>
                </div>
            `;
        }
        if (status === 'rejected') {
            return `
                <div class="decision-status decision-status-rejected">
                    <span class="codicon codicon-close"></span>
                    <span>Rejected — discarded</span>
                </div>
            `;
        }
        return `
            <div class="decision-status decision-status-error">
                <span class="codicon codicon-warning"></span>
                <span>Could not apply</span>
            </div>
        `;
    }

    function bindLegacyDecisionButtons(container) {
        container.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'accept') {
                    acceptResponse(btn);
                } else if (action === 'reject') {
                    rejectResponse(btn);
                }
            });
        });
    }

    function showEditProposalCard(message) {
        let bubble = document.querySelector(`[data-newid="${message.responseId}"]`);
        if (!message.proposalId) {
            return;
        }
        // Proposal can arrive before any text chunk — ensure a bubble exists.
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'bubble ai-bubble';
            bubble.setAttribute('data-newid', message.responseId);
            elements.messages.appendChild(bubble);
        }
        ensureBubbleContent(bubble);

        const existing = bubble.querySelector(`[data-proposal-id="${message.proposalId}"]`);
        if (existing) {
            existing.remove();
        }

        const fileName = (message.path || '').split(/[/\\]/).pop() || message.path || 'file';
        const autoApplied = !!message.autoApplied;
        const card = document.createElement('div');
        card.className = autoApplied
            ? 'edit-proposal-card edit-proposal-card-applied'
            : 'edit-proposal-card';
        card.setAttribute('data-proposal-id', message.proposalId);

        if (autoApplied) {
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.title = 'Open Diff';
            card.innerHTML = `
                <div class="edit-proposal-meta">
                    <span class="codicon codicon-diff"></span>
                    <div class="edit-proposal-copy">
                        <div class="edit-proposal-title">${message.isNewFile ? 'File created' : 'File edited'}</div>
                        <div class="edit-proposal-path">${escapeHtml(fileName)}</div>
                        <div class="edit-proposal-hint">Click to reopen Diff</div>
                    </div>
                    <span class="codicon codicon-chevron-right edit-proposal-chevron"></span>
                </div>
            `;
            const openDiff = () => {
                vscode.postMessage({
                    command: 'openEditProposalDiff',
                    proposalId: message.proposalId
                });
            };
            card.addEventListener('click', openDiff);
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDiff();
                }
            });
        } else {
            const hint = message.shrinkBlocked
                ? 'Blocked auto-overwrite (content too small). Diff is open — Accept only if you want this.'
                : 'Accept writes the file to disk. Reject discards it.';
            card.innerHTML = `
                <div class="edit-proposal-meta">
                    <span class="codicon codicon-diff"></span>
                    <div class="edit-proposal-copy">
                        <div class="edit-proposal-title">${message.isNewFile ? 'New file proposal' : 'Edit proposal'}</div>
                        <div class="edit-proposal-path">${escapeHtml(fileName)}</div>
                        <div class="edit-proposal-hint">${hint}</div>
                    </div>
                </div>
                <div class="edit-proposal-actions response-actions">
                    ${buildDecisionButtonsHtml('pending', 'proposal')}
                </div>
            `;
            card.querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const action = btn.getAttribute('data-action');
                    const proposalId = card.getAttribute('data-proposal-id');
                    if (action === 'accept') {
                        vscode.postMessage({ command: 'acceptEditProposal', proposalId });
                    } else if (action === 'reject') {
                        vscode.postMessage({ command: 'rejectEditProposal', proposalId });
                    }
                });
            });
        }

        bubble.appendChild(card);
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function updateEditProposalCard(proposalId, status, detail) {
        const card = document.querySelector(`[data-proposal-id="${proposalId}"]`);
        if (!card) {
            return;
        }
        const actions = card.querySelector('.edit-proposal-actions');
        if (!actions) {
            return;
        }
        if (status === 'accepted') {
            actions.innerHTML = buildDecisionButtonsHtml('accepted');
        } else if (status === 'rejected') {
            actions.innerHTML = buildDecisionButtonsHtml('rejected');
        } else {
            actions.innerHTML = `
                <div class="decision-status decision-status-error">
                    <span class="codicon codicon-warning"></span>
                    <span>${detail || 'Failed'}</span>
                </div>
            `;
        }
    }

    function appendMessage(element) {
      elements.messages.appendChild(element);
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    function formatAiResponse(text) {
        const codeBlockRegex = /`{3}(\w+)?\n([\s\S]*?)`{3}/g;
        const inlineCodeRegex = /`([^`]+)`/g;

        const codeBlocks = [];
        let processedText = text.replace(codeBlockRegex, (match, lang, code) => {
            const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
            codeBlocks.push({ lang, code });
            return placeholder;
        });

        processedText = processedText.replace(/\n/g, '<br>');

        codeBlocks.forEach((block, index) => {
            const { lang, code } = block;
            const escapedCode = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            
            const displayLang = lang || 'plaintext';
            
            const codeHtml = `
                    <div class="code-block-wrapper">
                        <div class="code-header">
                            <span class="code-language">${displayLang}</span>
                            <div class="code-actions">
                                <button class="code-action-btn copy-btn" onclick="copyCode(this)" title="Copy code">
                                    <span class="codicon codicon-copy"></span>
                                </button>
                                <button class="code-action-btn insert-btn" onclick="insertCode(this)" title="Insert at cursor">
                                    <span class="codicon codicon-insert"></span>
                                </button>
                            </div>
                        </div>
                        <pre><code class="language-${lang || ''}" data-code="${escapedCode}">${escapedCode}</code></pre>
                </div>
            `;
        
            processedText = processedText.replace(`___CODE_BLOCK_${index}___`, codeHtml);
        });

        return processedText
            .replace(inlineCodeRegex, '<code class="inline-code">$1</code>')
            .trim();
    }




    function CreateBubble(requestId) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble ai-bubble loading-bubble';
        bubble.id = 'chat-'+requestId;
        bubble.innerHTML = '<span></span><span></span><span></span>';
        bubble.setAttribute('data-newid',requestId);

        appendMessage(bubble);
    }
    function emptyBubble(requestId,responseId) {
        const bubble = document.querySelector(`[data-newid="${requestId}"]`);
        
        if (bubble) {
            bubble.classList.remove('loading-bubble');
            bubble.innerHTML = '';
            bubble.setAttribute('data-newid',responseId);
        }
    }

    function agentIconClass(agent) {
        if (agent === 'Edit') {
            return 'codicon-edit';
        }
        if (agent === 'Edit Automatically') {
            return 'codicon-run-all';
        }
        return 'codicon-comment';
    }

    function applySelectedAgent(selectedAgent) {
        elements.agentLabel.textContent = selectedAgent;
        elements.agentLabel.setAttribute('data-agent', selectedAgent);
        if (elements.agentIcon) {
            elements.agentIcon.className = 'codicon ' + agentIconClass(selectedAgent);
        }
    }

    function getSelectedAgent(){

        elements.agentOptions.forEach(option => {
            option.addEventListener('click', () => {
                const selectedAgent = option.getAttribute('data-agent');
                applySelectedAgent(selectedAgent);
                elements.agentDropdown.classList.add('hidden');

                vscode.postMessage({
                    command: 'setSessionConfig',
                    agent:selectedAgent
                });
            });
        });

    }

    function getCodeBlockSource(button) {
        const codeBlock = button.closest('.code-block-wrapper')?.querySelector('code');
        if (!codeBlock) {
            return '';
        }
        // getAttribute already returns decoded entities (&lt; → <).
        // Never assign that string to innerHTML — the browser would parse real tags
        // and copy/insert would lose <> or truncate mid-tag.
        const fromAttr = codeBlock.getAttribute('data-code');
        if (fromAttr != null && fromAttr.length > 0) {
            return fromAttr;
        }
        return codeBlock.textContent || '';
    }

    function copyCode(button) {
        vscode.postMessage({
            command: 'copyCode',
            code: getCodeBlockSource(button)
        });
    }

    function insertCode(button) {
        vscode.postMessage({
            command: 'insertCode',
            code: getCodeBlockSource(button)
        });
    }
    function generateNewId() {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 9);
        return `req_${timestamp}_${randomPart}`;
    }


    

    function acceptResponse(button) {
        const bubble = button.closest('.ai-bubble');
        const requestId = bubble.getAttribute('data-newid');
        
        vscode.postMessage({
            command: 'changeCodeMessage',
            action:'accepted',
            requestId: requestId
        });
        
        // Update UI to accepted state
        showActionButton(requestId, 'accepted');
    }

    function rejectResponse(button) {
        const bubble = button.closest('.ai-bubble');
        const requestId = bubble.getAttribute('data-newid');
        
        vscode.postMessage({
            command: 'changeCodeMessage',
            action:'rejected',
            requestId: requestId
        });
        
        // Update UI to rejected state
        showActionButton(requestId, 'rejected');
    }
    function showSettingsPanel(show) {
        document.getElementById('settingsPanel').classList.toggle('hidden', !show);
        document.getElementById('messages').classList.toggle('hidden', show);
        document.querySelector('.composer').classList.toggle('hidden', show);
    }
  initializeApp();
