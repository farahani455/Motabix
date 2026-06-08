export type chatRole='user' |'assistant' | 'system';
export type chatAction='pending'|'accepted'|'rejected';

export interface ChatSession{
   messages:ChatMessage[]; 
   summary:string;
}

export interface ChatMessage{
    Id:string;
    role:chatRole;
    content:string;
    files?:AttachedFile[];
    timestamp:Number;
    language?:string ;
    codeAction?:chatAction;
}
export interface AttachedFile{
    isActiveFile:boolean;
    path:string;
    content: string;
    language?: string;
}

