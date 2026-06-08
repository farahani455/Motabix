export type StreamBufferResponse = {
  type:'text'| 'code', 
  content:string,
  language?:string
}