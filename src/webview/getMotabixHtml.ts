import * as fs from 'fs';
import * as path from 'path';
export function getMotabixHtml(extensionPath:string,mediaUri:string): string {
    const motabixHtmlPath= path.join(extensionPath,"media","motabix.html");
    if (!fs.existsSync(motabixHtmlPath)) {
        return '<h1>Error: motabix.html not found</h1>';
    }
    try{
        let motabixHtml = fs.readFileSync(motabixHtmlPath,'utf8');
        //const formatFn = formatAiResponse.toString();
        motabixHtml=motabixHtml.replace(/\{mediaUri\}/ig,mediaUri);
        return motabixHtml;
    }catch(error ) {
         return `<h1>Error: motabix.html throw error ${error}</h1>`;
    }
}
