import {StreamBufferResponse} from '../types/StreamBufferResponse';
export class StreamBuffer {
  private buffer = '';
  private inCodeBlock = false;
  private codeLanguage = '';
  private codeContent = '';
  private textContent = ''; 
  constructor() {}
  process(chunk:string):StreamBufferResponse[] {
    this.buffer += chunk;
    const results:StreamBufferResponse[] = [];

    //start code block
    const codeBlockStart = /```(\w+)?\n/g;
    //end code block
    const codeBlockEnd = /```/g;

    let match;
    let lastIndex = 0;

    while ((match = codeBlockStart.exec(this.buffer)) !== null || 
          (match = codeBlockEnd.exec(this.buffer)) !== null) {
      
      if (!this.inCodeBlock && match[0].startsWith('```')) {
        // start code block
        const textBefore = this.buffer.substring(lastIndex, match.index);
        if (textBefore.trim()) {
          const streamItem:StreamBufferResponse= { type: 'text', content: textBefore };
          results.push(streamItem);
        }

        this.inCodeBlock = true;
        this.codeLanguage = match[1] || '';
        this.codeContent = '';
        lastIndex = match.index + match[0].length;

      } else if (this.inCodeBlock && match[0] === '```') {
        // پایان code block
        this.codeContent = this.buffer.substring(lastIndex, match.index);
        results.push({ 
          type: 'code', 
          language: this.codeLanguage,
          content: this.codeContent 
        });
        
        this.inCodeBlock = false;
        this.codeLanguage = '';
        this.codeContent = '';
        lastIndex = match.index + match[0].length;
      }
      return results;
    }

    //buffer
    if (lastIndex < this.buffer.length) {
      const remaining = this.buffer.substring(lastIndex);
      if (this.inCodeBlock) {
        this.codeContent += remaining;
      } else if (remaining.trim()) {
        results.push({ type: 'text', content: remaining });
      }
      this.buffer = remaining;
    } else {
      this.buffer = '';
    }

    return results;
  }

  flush() {
    const results = [];
    
    if (this.inCodeBlock && this.codeContent) {
      results.push({ 
        type: 'code', 
        language: this.codeLanguage,
        content: this.codeContent 
      });
    } else if (this.buffer.trim()) {
      results.push({ type: 'text', content: this.buffer });
    }

    this.reset();
    return results;
  }

  reset() {
    this.buffer = '';
    this.inCodeBlock = false;
    this.codeLanguage = '';
    this.codeContent = '';
    this.textContent = '';
  }
}
