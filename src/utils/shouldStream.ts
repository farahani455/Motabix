export function shouldStream(code: string): boolean {
    const lines = code.split('\n').length;
    const chars = code.length;
    
    // بیشتر از 15 خط یا 500 کاراکتر → استریم
    return lines > 15 || chars > 500;
}
