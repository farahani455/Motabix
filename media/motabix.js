const vscode = acquireVsCodeApi();

  const elements = {
        messages: document.getElementById('messages'),
        input: document.getElementById('textInput'),
        send: document.getElementById('sendButton'),
        settings: document.getElementById('settings'),
        clearHistory: document.getElementById('clearHistory'),
        modelButton :document.getElementById('model'),
        modelDropdown :document.getElementById('modelDropdown'),
        modelLabel :document.getElementById('model-label'),
        modelOptions :document.querySelectorAll('.model-option'),
        agentButton:document.getElementById('setAgent'),
        agentDropdown:document.getElementById('agentDropdown'),
        agentLabel:document.getElementById('agent-label'),
        agentOptions:document.querySelectorAll('.agent-option'),
        addContentBtn:document.getElementById('addContentBtn'),
        addContentDropdown:document.getElementById('addContentDropdown'),
        attachedContent:document.getElementById('attachedContent'),
        contentOptions:document.querySelectorAll('.content-option')
  };

  function initializeApp() {
    // Select model
    getSelectedModel();
    getSelectedAgent();
    bindEvents();
    notifyReady();
  }

  function bindEvents() {
      elements.send.addEventListener('click', handleSendClick);
      elements.settings.addEventListener('click', handleOpenSettings);
      elements.clearHistory.addEventListener('click', handleClearHistory);
      elements.input.addEventListener('keydown',handleKeydownInput)
      elements.modelButton.addEventListener('click', handleModelButtonClick);
      document.addEventListener('click',handleCloseModal);
      window.addEventListener('message', handleWindowMessage);

      elements.agentButton.addEventListener('click', handleAgentButtonClick);
      document.addEventListener('click',handleCloseAgent);
      
      elements.addContentBtn.addEventListener('click', handleAddContentBtnClick);
      bindContentOptions();
  }

  function notifyReady() {
      vscode.postMessage({ command: 'ready' });
  }

  function handleSendClick() {
      const text = elements.input.textContent.trim();
      const model=elements.modelLabel.getAttribute('data-model');
      const agent=elements.agentLabel.getAttribute('data-agent');
      const files=getContentFileLis();
      const requestId = generateNewId();
      if (!text) {
          return;
      }
      renderUserMessage(text);
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
  function handleKeydownInput(event){
    if(event.keyCode == 13){
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
            console.log('Start Response....');
            emptyBubble(message.requestId,message.responseId);
            break;
            
        }
        case 'stream-chunk-response': {
            if (message.content) {
                console.log(message.content);
                addAssistantMessage(message.content, message.responseId,message.language, true);
            }
            break;
        }

        case 'stream-end-response': {
            console.log('Stream ended');
            formatAssistResponse(message.responseId);
            highlightAssistResponse(message.responseId);
            break; 
        }
        case 'code_response': {
            const parsedMessage = JSON.parse(message.text);
            emptyBubble(message.requestId,message.responseId);
            
            addAssistantMessage(parsedMessage.explanation, message.responseId,message.language, false);

            formatAssistResponse(message.responseId);
            highlightAssistResponse(message.responseId);

            showActionButton(message.responseId, 'pending');

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
            showActionButton(item.Id, item.codeAction??'accepted');
          }
      }

  }
  function setSessionConfig(config){
      if (!config ) {
          return;
      }
      console.log(config);
      if(config.model){
            const selectedModel = config.model;
            elements.modelLabel.textContent = selectedModel;
            elements.modelLabel.setAttribute('data-model', selectedModel);
            elements.modelDropdown.classList.add('hidden');
      }
      if(config.agent){
            const selectedAgent = config.agent;
            elements.agentLabel.textContent = selectedAgent;
            elements.agentLabel.setAttribute('data-agent', selectedAgent);
            elements.agentDropdown.classList.add('hidden');

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

    function addAssistantMessage(content,requestId,dir,append) {
        let bubble = document.querySelector(`[data-newid="${requestId}"]`);
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'bubble ai-bubble';
            bubble.setAttribute('data-newid', requestId);
            elements.messages.appendChild(bubble);
        }
        
        if (!bubble.classList.contains('ai-bubble-' + dir)) {
            bubble.classList.add('ai-bubble-' + dir);
        }

        if (append) {
            bubble.innerHTML += content;
        } else { 
            bubble.innerHTML = content;
        }

       

        elements.messages.scrollTop = elements.messages.scrollHeight;
    }
    function formatAssistResponse(requestId){
        let bubble = document.querySelector(`[data-newid="${requestId}"]`);
        const content=bubble.innerHTML;
        const formatedContent = formatAiResponse(bubble.innerHTML);
        bubble.innerHTML=formatedContent;

        
    }

    function highlightAssistResponse(requestId){
        let bubble = document.querySelector(`[data-newid="${requestId}"]`);

         bubble.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }

    function showActionButton(requestId, status = 'pending'){
        let bubble = document.querySelector(`[data-newid="${requestId}"]`);
        if (!bubble) {
            return;
        }

        // Remove existing action buttons if any
        const existingActions = bubble.querySelector('.response-actions');
        if (existingActions) {
            existingActions.remove();
        }

        // Create action buttons container
        const actionButtons = document.createElement('div');
        actionButtons.className = 'response-actions';

        if (status === 'pending') {
            // Show clickable buttons
            actionButtons.innerHTML = `
                <button class="response-action-btn accept-btn" onclick="acceptResponse(this)" title="Accept changes">
                    <span class="codicon codicon-check"></span>
                    Accept
                </button>
                <button class="response-action-btn reject-btn" onclick="rejectResponse(this)" title="Reject changes">
                    <span class="codicon codicon-close"></span>
                    Reject
                </button>
            `;
        } else if (status === 'accepted') {
            // Show accepted state (disabled)
            actionButtons.innerHTML = `
                <button class="response-action-btn accept-btn accepted" disabled title="Changes accepted">
                    <span class="codicon codicon-check"></span>
                    Accepted
                </button>
                <button class="response-action-btn reject-btn" disabled style="opacity: 0.5;" title="Changes accepted">
                    <span class="codicon codicon-close"></span>
                    Reject
                </button>
            `;
        } else if (status === 'rejected') {
            // Show rejected state (disabled)
            actionButtons.innerHTML = `
                <button class="response-action-btn accept-btn" disabled style="opacity: 0.5;" title="Changes rejected">
                    <span class="codicon codicon-check"></span>
                    Accept
                </button>
                <button class="response-action-btn reject-btn rejected" disabled title="Changes rejected">
                    <span class="codicon codicon-close"></span>
                    Rejected
                </button>
            `;
        }

        bubble.appendChild(actionButtons);
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

    function getSelectedModel(){
        elements.modelOptions.forEach(option => {
            option.addEventListener('click', () => {
                const selectedModel = option.getAttribute('data-model');
                elements.modelLabel.textContent = selectedModel;
                elements.modelLabel.setAttribute('data-model', selectedModel);
                elements.modelDropdown.classList.add('hidden');
                // اینجا می‌تونید مدل انتخاب شده رو ذخیره کنید
                console.log('Selected model:', selectedModel);

                vscode.postMessage({
                    command: 'setSessionConfig',
                    model:selectedModel
                });
            });
        });
    }
    function getSelectedAgent(){

        elements.agentOptions.forEach(option => {
            option.addEventListener('click', () => {
                const selectedAgent = option.getAttribute('data-agent');
                elements.agentLabel.textContent = selectedAgent;
                elements.agentLabel.setAttribute('data-agent', selectedAgent);
                elements.agentDropdown.classList.add('hidden');
                // اینجا می‌تونید مدل انتخاب شده رو ذخیره کنید
                console.log('Selected model:', selectedAgent);

                vscode.postMessage({
                    command: 'setSessionConfig',
                    agent:selectedAgent
                });
            });
        });

    }

    function copyCode(button) {
        const codeBlock = button.closest('.code-block-wrapper').querySelector('code');
        const code = codeBlock.getAttribute('data-code');
        
        // Unescape HTML entities
        const textarea = document.createElement('textarea');
        textarea.innerHTML = code;
        const decodedCode = textarea.value;
        
        vscode.postMessage({
            command: 'copyCode',
            code: decodedCode
        });
        
        // Visual feedback
        // const originalText = button.innerHTML;
        // button.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 2l-7.5 7.5-3.5-3.5-1.5 1.5 5 5 9-9z"/></svg> Copied!';
        // button.classList.add('success');
        
        // setTimeout(() => {
        //     button.innerHTML = originalText;
        //     button.classList.remove('success');
        // }, 2000);
    }

    function insertCode(button) {
        const codeBlock = button.closest('.code-block-wrapper').querySelector('code');
        const code = codeBlock.getAttribute('data-code');
        
        // Unescape HTML entities
        const textarea = document.createElement('textarea');
        textarea.innerHTML = code;
        const decodedCode = textarea.value;
        
        vscode.postMessage({
            command: 'insertCode',
            code: decodedCode
        });
        
        // Visual feedback
        // const originalText = button.innerHTML;
        // button.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 2l-7.5 7.5-3.5-3.5-1.5 1.5 5 5 9-9z"/></svg> Inserted!';
        // button.classList.add('success');
        
        // setTimeout(() => {
        //     button.innerHTML = originalText;
        //     button.classList.remove('success');
        // }, 2000);
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

  initializeApp();
